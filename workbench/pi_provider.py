"""One-shot Pi SDK text generation; no CLI credentials or tool exposure."""

import asyncio
from pathlib import Path
import json
import os
import re
import shutil
import signal
import tempfile
from urllib.parse import urlsplit

from .provider import ProviderError


PI_VERSION = "1.5.0"
PI_INTEGRITY = "sha512-xNDZ5kqowO6Z03FS2gwAkPEGk1ssxVcYKQ6qZId84mFEvwACvvyc2l0vAMOS+c5zvxLRMLBE9r4y44IGYkMJaQ=="
RUNTIME = Path(__file__).resolve().parents[1] / "runtime" / "pi"
BRIDGE = RUNTIME / "bridge.mjs"


def pi_sdk_available() -> bool:
    """Local installation presence only, never provider reachability."""
    try:
        package = json.loads((RUNTIME / "node_modules/@earendil-works/pi-coding-agent/package.json").read_text())
        lock = json.loads((RUNTIME / "package-lock.json").read_text())["packages"][
            "node_modules/@earendil-works/pi-coding-agent"
        ]
        return bool(
            shutil.which("node") and BRIDGE.is_file()
            and package["name"] == "@earendil-works/pi-coding-agent"
            and package["version"] == lock["version"] == PI_VERSION and lock["integrity"] == PI_INTEGRITY
        )
    except (OSError, ValueError, KeyError):
        return False


class PiSdkProvider:
    async def complete(self, model: dict, messages: list[dict], max_tokens: int) -> dict:
        if not pi_sdk_available():
            raise ProviderError("pi_sdk_not_available")
        endpoint, model_id, key_name = model.get("endpoint"), model.get("model"), model.get("key_env", "")
        try:
            parsed = urlsplit(endpoint)
            if (
                not isinstance(endpoint, str) or parsed.scheme not in {"http", "https"}
                or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment
                or any(ord(char) < 33 for char in endpoint)
                or not isinstance(model_id, str) or not 1 <= len(model_id) <= 150
                or model_id != model_id.strip() or any(ord(char) < 32 for char in model_id)
                or not isinstance(key_name, str) or key_name and not re.fullmatch(r"[A-Z_][A-Z0-9_]{0,99}", key_name)
                or type(max_tokens) is not int or not 1 <= max_tokens <= 16384
                or not isinstance(messages, list) or not 1 <= len(messages) <= 20
                or any(not isinstance(item, dict) or set(item) != {"role", "content"}
                       or item["role"] not in {"system", "user", "assistant"}
                       or not isinstance(item["content"], str) for item in messages)
            ):
                raise ValueError
            timeout = model.get("_timeout_seconds", 90)
            if type(timeout) not in {int, float} or not 0 < timeout <= 300:
                raise ValueError
            key = os.environ.get(key_name, "") if key_name else ""
            if key_name and not key:
                raise ProviderError("missing_api_key")
            request = json.dumps({
                "endpoint": endpoint.rstrip("/"), "model": model_id, "api_key": key,
                "messages": messages, "max_tokens": max_tokens, "timeout_ms": max(1, round(timeout * 1000)),
            }, ensure_ascii=False).encode("utf-8")
            if len(request) > 1024 * 1024:
                raise ValueError
        except (ValueError, TypeError, UnicodeError, AttributeError) as error:
            raise ProviderError("pi_sdk_invalid_input") from error
        process = None
        tasks = []
        output = bytearray()
        detail = {"sdk_version": PI_VERSION, "workspace_isolated": True, "credentials_isolated": True}

        async def terminate():
            if process is None:
                return
            if process.returncode is None:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                    await asyncio.wait_for(process.wait(), 0.5)
                except (ProcessLookupError, asyncio.TimeoutError):
                    if process.returncode is None:
                        try:
                            os.killpg(process.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
            await process.wait()
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

        async def consume():
            while chunk := await process.stdout.read(4096):
                output.extend(chunk)
                if len(output) > 1024 * 1024:
                    raise ProviderError("pi_sdk_output_limit")

        def safe_detail():
            return {**detail, "process_reaped": process is not None and process.returncode is not None}

        with tempfile.TemporaryDirectory(prefix="mybot-pi-call-") as directory:
            root = Path(directory)
            for name in ("home", "agent", "cwd", "config", "cache"):
                (root / name).mkdir()
            try:
                try:
                    async with asyncio.timeout(timeout):
                        process = await asyncio.create_subprocess_exec(
                            shutil.which("node"), str(BRIDGE), cwd=root / "cwd",
                            env={
                                "LANG": "C.UTF-8", "TZ": "UTC", "HOME": str(root / "home"),
                                "XDG_CONFIG_HOME": str(root / "config"), "XDG_CACHE_HOME": str(root / "cache"),
                                "PI_CODING_AGENT_DIR": str(root / "agent"), "PI_OFFLINE": "1",
                                "NODE_NO_WARNINGS": "1",
                            },
                            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.DEVNULL, start_new_session=True,
                        )
                        tasks = [asyncio.create_task(consume()), asyncio.create_task(process.wait())]
                        process.stdin.write(request)
                        await process.stdin.drain()
                        process.stdin.close()
                        await asyncio.gather(*tasks)
                except TimeoutError as error:
                    await terminate()
                    raise ProviderError("pi_sdk_timeout_outcome_unknown", detail=safe_detail()) from error
                except asyncio.CancelledError:
                    await terminate()
                    raise
                except OSError as error:
                    await terminate()
                    raise ProviderError("pi_sdk_start_failed", detail=safe_detail()) from error
                except ProviderError as error:
                    await terminate()
                    raise ProviderError(error.code, detail=safe_detail()) from error
                try:
                    value = json.loads(output.decode("utf-8"))
                    if not isinstance(value, dict):
                        raise ValueError
                    diagnostics = value.get("diagnostics")
                    if not isinstance(diagnostics, dict):
                        raise ValueError
                    admitted = {
                        "sdk_version", "requests", "events", "http_status", "tools_disabled",
                        "resources_disabled", "session_in_memory", "retries_disabled",
                        "cache_warming_disabled", "cache_read_tokens", "cache_write_tokens", "usage_reported",
                        "native_input_tokens", "cache_tokens_are_input_subset",
                    }
                    if set(diagnostics) - admitted or diagnostics.get("sdk_version") != PI_VERSION:
                        raise ValueError
                    detail.update(diagnostics)
                    if "error" in value:
                        if set(value) != {"error", "diagnostics"} or value["error"] not in {
                            "pi_sdk_not_available", "pi_sdk_invalid_input", "pi_sdk_policy_violation",
                            "pi_sdk_provider_rejected", "pi_sdk_output_limit", "pi_sdk_invalid_response",
                            "pi_sdk_empty_response", "pi_sdk_connection_outcome_unknown",
                        }:
                            raise ValueError
                        raise ProviderError(value["error"], detail=safe_detail())
                    if (
                        process.returncode != 0 or set(value) != {
                            "text", "model", "input_tokens", "output_tokens", "truncated", "diagnostics",
                        }
                        or not isinstance(value["text"], str) or not value["text"].strip() or len(value["text"]) > 80000
                        or value["model"] != model_id or type(value["truncated"]) is not bool
                        or any(value[name] is not None and (type(value[name]) is not int or value[name] < 0)
                               for name in ("input_tokens", "output_tokens"))
                        or diagnostics.get("cache_tokens_are_input_subset") is not True
                        or type(diagnostics.get("usage_reported")) is not bool
                        or any(diagnostics.get(name) is not None and (
                            type(diagnostics[name]) is not int or diagnostics[name] < 0
                        ) for name in ("native_input_tokens", "cache_read_tokens", "cache_write_tokens"))
                        or (value["input_tokens"] is None and any(
                            diagnostics.get(name) is not None
                            for name in ("native_input_tokens", "cache_read_tokens", "cache_write_tokens")
                        ))
                        or (value["input_tokens"] is not None and (
                            any(diagnostics.get(name) is not None and diagnostics[name] > value["input_tokens"] for name in (
                                "native_input_tokens", "cache_read_tokens", "cache_write_tokens",
                            ))
                            or sum(diagnostics.get(name) or 0 for name in (
                                "cache_read_tokens", "cache_write_tokens",
                            )) > value["input_tokens"]
                            or (diagnostics.get("native_input_tokens") is not None and (
                                any(diagnostics.get(name) is None for name in (
                                    "cache_read_tokens", "cache_write_tokens",
                                ))
                                or sum(diagnostics[name] for name in (
                                    "native_input_tokens", "cache_read_tokens", "cache_write_tokens",
                                )) != value["input_tokens"]
                            ))
                        ))
                        or diagnostics.get("requests") != 1
                        or any(diagnostics.get(name) is not True for name in (
                            "tools_disabled", "resources_disabled", "session_in_memory",
                            "retries_disabled", "cache_warming_disabled",
                        ))
                    ):
                        raise ValueError
                except (ValueError, UnicodeError, KeyError) as error:
                    raise ProviderError("pi_sdk_invalid_response", detail=safe_detail()) from error
                return {**value, "diagnostics": safe_detail()}
            finally:
                await terminate()
                for task in tasks:
                    if not task.done():
                        task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
