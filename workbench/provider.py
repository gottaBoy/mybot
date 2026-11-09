from __future__ import annotations

import json
import os
import asyncio
import shutil
import signal
import tempfile
import time
from pathlib import Path

import httpx


class ProviderError(Exception):
    def __init__(self, code: str, *, detail: dict | None = None):
        self.code = code
        self.detail = detail or {}
        super().__init__(code)


def key_available(model: dict) -> bool:
    return not model["key_env"] or bool(os.environ.get(model["key_env"]))


class ChatProvider:
    """OpenAI-compatible Chat Completions, without implicit retries or fallbacks."""

    async def complete(self, model: dict, messages: list[dict], max_tokens: int) -> dict:
        if not key_available(model):
            raise ProviderError("missing_api_key")
        headers = {"Content-Type": "application/json"}
        if model["key_env"]:
            headers["Authorization"] = f"Bearer {os.environ[model['key_env']]}"
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(model.get("_timeout_seconds", 60), connect=10),
                                         follow_redirects=False, trust_env=False) as client:
                async with client.stream(
                    "POST", model["endpoint"] + "/chat/completions", headers=headers,
                    json={"model": model["model"], "messages": messages,
                          "max_tokens": max_tokens, "stream": False},
                ) as response:
                    if response.status_code != 200:
                        raise ProviderError(f"provider_http_{response.status_code}")
                    data = bytearray()
                    async for chunk in response.aiter_bytes():
                        data.extend(chunk)
                        if len(data) > 1024 * 1024:
                            raise ProviderError("response_too_large")
            raw = json.loads(data)
            choice = raw["choices"][0]
            text = choice["message"].get("content")
            if not isinstance(text, str) or not text.strip():
                raise ProviderError("empty_response")
            if len(text) > 80000:
                raise ProviderError("response_too_large")
            usage = raw.get("usage") or {}

            def tokens(name):
                value = usage.get(name)
                return value if type(value) is int and value >= 0 else None

            return {"text": text, "model": raw.get("model") if isinstance(raw.get("model"), str) else None,
                    "input_tokens": tokens("prompt_tokens"), "output_tokens": tokens("completion_tokens"),
                    "truncated": choice.get("finish_reason") == "length"}
        except httpx.TimeoutException as exc:
            raise ProviderError("provider_timeout_outcome_unknown") from exc
        except httpx.HTTPError as exc:
            raise ProviderError("provider_connection_error") from exc
        except (json.JSONDecodeError, KeyError, IndexError, TypeError, AttributeError) as exc:
            raise ProviderError("invalid_provider_response") from exc


def codex_timeout_seconds() -> int:
    try:
        return max(10, min(300, int(os.environ.get("WORKBENCH_CODEX_TIMEOUT_SECONDS", "90"))))
    except ValueError:
        return 90


class CodexCliProvider:
    """Explicit local Codex adapter; it reuses the CLI's own login state."""

    def __init__(self):
        self.lock = asyncio.Lock()

    async def complete(self, model: dict, messages: list[dict], max_tokens: int) -> dict:
        # Connection tests and Run calls share the same local CLI channel.
        async with self.lock:
            return await self._complete(model, messages, max_tokens)

    async def _complete(self, model: dict, messages: list[dict], max_tokens: int) -> dict:
        executable = shutil.which("codex")
        if not executable:
            raise ProviderError("codex_cli_not_found")
        prompt = "\n\n".join(
            f"{message['role'].upper()}:\n{message['content']}" for message in messages
        )
        command = [
            executable, "exec", "--json", "--ephemeral", "--sandbox", "read-only",
            "--skip-git-repo-check", "--color", "never",
        ]
        workspace = model.get("workspace")
        if workspace:
            command.extend(["-C", str(workspace)])
        output_file = tempfile.NamedTemporaryFile(prefix="mybot-codex-", suffix=".txt", delete=False)
        output_path = Path(output_file.name)
        output_file.close()
        command.extend(["--output-last-message", str(output_path)])
        command.append("-")
        process = None
        tasks = []
        timeout_seconds = model.get("_timeout_seconds", codex_timeout_seconds())
        last_event_at = None
        text = ""
        usage = {}
        diagnostics = {
            "timeout_seconds": timeout_seconds,
            "events": 0,
            "last_event": None,
            "partial_message": False,
        }
        message_types = {"agentMessage", "agent_message", "assistant_message", "message"}
        event_types = {
            "thread.started", "turn.started", "turn.completed", "turn.failed", "error",
            "item.started", "item.updated", "item.completed",
        }
        item_types = message_types | {
            "reasoning", "command_execution", "file_change", "mcp_tool_call",
            "web_search", "todo_list", "error",
        }

        async def terminate():
            if not process:
                return
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            except PermissionError:
                if process.returncode is None:
                    process.kill()
            try:
                await asyncio.wait_for(process.wait(), timeout=2)
            except (asyncio.TimeoutError, ProcessLookupError):
                pass

        def safe_detail():
            return {
                **diagnostics,
                "last_event_age_ms": (
                    round((time.monotonic() - last_event_at) * 1000)
                    if last_event_at is not None else None
                ),
                "exit_code": process.returncode if process else None,
                "process_reaped": process is not None and process.returncode is not None,
            }

        async def read_stdout():
            nonlocal text, usage, last_event_at
            size = 0
            async for raw_line in process.stdout:
                size += len(raw_line)
                if size > 1024 * 1024:
                    raise ProviderError("codex_cli_output_limit")
                try:
                    event = json.loads(raw_line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(event, dict):
                    continue
                diagnostics["events"] += 1
                last_event_at = time.monotonic()
                item = event.get("item")
                kind = item.get("type") if isinstance(item, dict) else None
                event_kind = event.get("type")
                # Only record fixed protocol labels, never arbitrary upstream
                # fields, stderr, command arguments, or reasoning text.
                diagnostics["last_event"] = (
                    kind if isinstance(kind, str) and kind in item_types
                    else event_kind if isinstance(event_kind, str) and event_kind in event_types
                    else "other"
                )
                if isinstance(kind, str) and kind in message_types:
                    candidate = item.get("text") or item.get("content")
                    if isinstance(candidate, str) and candidate.strip():
                        diagnostics["partial_message"] = True
                        text = candidate.strip()
                if event_kind == "turn.completed" and isinstance(event.get("usage"), dict):
                    usage = event["usage"]

        try:
            try:
                async with asyncio.timeout(timeout_seconds):
                    process = await asyncio.create_subprocess_exec(
                        *command,
                        stdin=asyncio.subprocess.PIPE,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.DEVNULL,
                        cwd=str(workspace) if workspace else None,
                        start_new_session=True,
                        limit=1024 * 1024 + 1,
                    )
                    tasks = [asyncio.create_task(read_stdout()), asyncio.create_task(process.wait())]
                    process.stdin.write(prompt.encode())
                    await process.stdin.drain()
                    process.stdin.close()
                    await asyncio.gather(*tasks)
            except TimeoutError as exc:
                await terminate()
                raise ProviderError("codex_cli_timeout_outcome_unknown", detail=safe_detail()) from exc
            except asyncio.CancelledError:
                await terminate()
                raise
            except ProviderError as exc:
                await terminate()
                raise ProviderError(exc.code, detail=safe_detail()) from exc
            except ValueError as exc:
                await terminate()
                raise ProviderError("codex_cli_output_limit", detail=safe_detail()) from exc
            except OSError as exc:
                await terminate()
                raise ProviderError("codex_cli_start_failed", detail=safe_detail()) from exc
            if process.returncode != 0:
                raise ProviderError("codex_cli_failed", detail=safe_detail())
            with output_path.open("rb") as output:
                final_bytes = output.read(320001)
            if len(final_bytes) > 320000:
                raise ProviderError("response_too_large", detail=safe_detail())
            final_text = final_bytes.decode("utf-8", errors="replace").strip()
            text = final_text or text
            if not text:
                raise ProviderError("codex_cli_empty_response", detail=safe_detail())
            if len(text) > 80000:
                raise ProviderError("response_too_large", detail=safe_detail())

            def tokens(name):
                value = usage.get(name)
                return value if type(value) is int and value >= 0 else None

            return {"text": text, "model": model["model"],
                    "input_tokens": tokens("input_tokens"),
                    "output_tokens": tokens("output_tokens"), "truncated": False}
        finally:
            if process and (process.returncode is None or any(not task.done() for task in tasks)):
                await terminate()
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            output_path.unlink(missing_ok=True)


class ProviderRouter:
    def __init__(self):
        self.chat = ChatProvider()
        self.codex = CodexCliProvider()

    async def complete(self, model: dict, messages: list[dict], max_tokens: int) -> dict:
        if model.get("kind") == "codex_cli":
            return await self.codex.complete(model, messages, max_tokens)
        return await self.chat.complete(model, messages, max_tokens)
