"""Opt-in single-turn smoke test via the existing Codex CLI authentication."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import subprocess
import tempfile
import time


PROMPT = "Reply with exactly MYBOT_ACCOUNT_OK. Do not call tools or access any files."
DISABLED = (
    "shell_tool", "unified_exec", "shell_snapshot", "code_mode", "code_mode_host",
    "view_image", "image_generation", "multi_agent", "multi_agent_v2", "browser_use",
    "browser_use_external", "in_app_browser", "computer_use", "apps", "plugins",
    "remote_plugin", "hooks", "goals", "memories", "skill_search",
    "skill_mcp_dependency_install", "workspace_dependencies", "sleep_tool",
    "tool_suggest", "in_app_local_automation", "unbounded_connection_retries",
)


class ProbeError(Exception):
    pass


class Client:
    def __init__(self, command, cwd):
        self.child = subprocess.Popen(
            command, cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, start_new_session=True,
        )
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.child.stdout, selectors.EVENT_READ)
        self.buffer = b""
        self.next_id = 0
        self.pending = []
        self.types = set()
        self.tool_items = 0
        self.usage = None

    def send(self, message):
        self.child.stdin.write((json.dumps({"jsonrpc": "2.0", **message}) + "\n").encode())
        self.child.stdin.flush()

    def receive(self, deadline):
        while b"\n" not in self.buffer:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ProbeError("protocol_timeout")
            if not self.selector.select(remaining):
                raise ProbeError("protocol_timeout")
            data = os.read(self.child.stdout.fileno(), 65536)
            if not data:
                raise ProbeError("app_server_closed")
            self.buffer += data
            if len(self.buffer) > 2_000_000:
                raise ProbeError("protocol_frame_limit")
        line, self.buffer = self.buffer.split(b"\n", 1)
        try:
            message = json.loads(line)
        except ValueError:
            raise ProbeError("invalid_protocol_frame") from None
        if "method" in message:
            method = message["method"]
            if "id" in message:
                self.send({"id": message["id"], "error": {"code": -32601, "message": "No tools authorized"}})
                raise ProbeError("server_tool_or_approval_request_rejected")
            params = message.get("params", {})
            if method in {"item/started", "item/completed"}:
                kind = params.get("item", {}).get("type")
                self.types.add(kind)
                if kind not in {"agentMessage", "userMessage", "reasoning"}:
                    self.tool_items += 1
                    raise ProbeError("non_text_item_observed")
            if method == "thread/tokenUsage/updated":
                usage = params.get("tokenUsage", {})
                self.usage = {
                    group: {key: value for key, value in usage.get(group, {}).items()
                            if key in {"totalTokens", "inputTokens", "cachedInputTokens",
                                       "outputTokens", "reasoningOutputTokens"} and type(value) is int}
                    for group in ("total", "last")
                }
        return message

    def rpc(self, method, params, timeout=20):
        self.next_id += 1
        identifier = self.next_id
        self.send({"id": identifier, "method": method, "params": params})
        deadline = time.monotonic() + timeout
        while True:
            message = self.receive(deadline)
            if message.get("id") == identifier:
                if "error" in message:
                    # Never retain remote error bodies, endpoint URLs or credential output.
                    raise ProbeError(f"rpc_rejected_{method.replace('/', '_')}")
                return message.get("result", {})
            self.pending.append(message)

    def stop(self):
        if self.child.poll() is None:
            os.killpg(self.child.pid, signal.SIGTERM)
            try:
                self.child.wait(timeout=8)
            except subprocess.TimeoutExpired:
                os.killpg(self.child.pid, signal.SIGKILL)
                self.child.wait(timeout=3)
        self.selector.close()
        return self.child.returncode


def run(args, report):
    cli = shutil.which("codex")
    if not cli:
        raise ProbeError("codex_not_installed")
    root = Path(tempfile.mkdtemp(prefix="mybot-codex-text-"))
    report["temporary_workspace"] = str(root)
    config = {
        "web_search": "disabled", "notify": [],
        "analytics.enabled": False, "otel.exporter": "none",
        "otel.trace_exporter": "none", "otel.metrics_exporter": "none",
        "project_doc_max_bytes": 0, "history.persistence": "none",
        "shell_environment_policy.inherit": "none",
    }
    command = [cli, "app-server", "--listen", "stdio://"]
    for feature in DISABLED:
        command.extend(["--disable", feature])
    for key, value in config.items():
        command.extend(["-c", f"{key}={json.dumps(value)}"])
    client = Client(command, root)
    phase = "initialize"
    try:
        initialized = client.rpc("initialize", {
            "clientInfo": {"name": "mybot_text_smoke", "version": "0.1.0"},
            "capabilities": {"experimentalApi": True},
        })
        report["initialized"] = bool(initialized)
        client.send({"method": "initialized"})
        phase = "config_read"
        effective = client.rpc("config/read", {"includeLayers": False}).get("config", {})
        provider = effective.get("model_provider") or "openai"
        model = effective.get("model")
        providers = effective.get("model_providers", {})
        if not isinstance(provider, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", provider):
            raise ProbeError("provider_identifier_unsupported")
        if not isinstance(model, str) or not re.fullmatch(r"[A-Za-z0-9._:/+-]{1,150}", model):
            raise ProbeError("configured_model_not_identified")
        if provider not in providers:
            raise ProbeError("cannot_pin_provider_retries_without_definition")
        servers = effective.get("mcp_servers", {})
        if not isinstance(servers, dict):
            raise ProbeError("cannot_disable_configured_mcp_servers")
        for name in servers:
            # Names from the CLI config are used only as runtime keys, never logged.
            config[f"mcp_servers.{name}.enabled"] = False
        prefix = f"model_providers.{provider}"
        config[f"{prefix}.request_max_retries"] = 0
        config[f"{prefix}.stream_max_retries"] = 0
        config[f"{prefix}.supports_websockets"] = False
        config["features"] = {name: False for name in DISABLED}
        report.update({
            "configured_model": model,
            "authentication": "existing_cli_api_key_no_export",
            "provider_endpoint_not_recorded": True,
            "disabled_features": list(DISABLED),
            "disabled_mcp_server_count": len(servers),
            "retry_overrides": {"request_max_retries": 0, "stream_max_retries": 0},
            "explicit_project_files_attached": 0,
        })
        phase = "thread_start"
        thread = client.rpc("thread/start", {
            "model": model, "modelProvider": provider, "cwd": str(root),
            "ephemeral": True, "sandbox": "read-only", "approvalPolicy": "never",
            "approvalsReviewer": "user", "allowProviderModelFallback": False,
            "baseInstructions": "This is a text-only connectivity check. Reply exactly as requested. Never use tools.",
            "developerInstructions": "No tools, files, integrations or delegation. Return one fixed short text reply only.",
            "dynamicTools": [], "environments": [], "selectedCapabilityRoots": [],
            "runtimeWorkspaceRoots": [str(root)], "config": config,
            "experimentalRawEvents": False,
        })
        identifier = thread.get("thread", {}).get("id")
        if not identifier or thread.get("model") != model:
            raise ProbeError("thread_model_or_identity_not_verified")
        report["preflight_complete"] = True
        if not args.allow_one_request:
            report["status"] = "preflight_only_no_model_turn"
            return
        phase = "turn_start"
        report["turn_start_calls"] = 1
        started = time.monotonic()
        turn = client.rpc("turn/start", {
            "threadId": identifier, "input": [{"type": "text", "text": PROMPT, "text_elements": []}],
            "effort": "low", "environments": [], "runtimeWorkspaceRoots": [str(root)],
        })
        report["turn_accepted"] = bool(turn.get("turn", {}).get("id"))
        phase = "wait_for_completion"
        messages = client.pending
        client.pending = []
        reply = None
        deadline = started + 60
        while True:
            message = messages.pop(0) if messages else client.receive(deadline)
            params = message.get("params", {})
            method = message.get("method")
            if method == "item/completed" and params.get("item", {}).get("type") == "agentMessage":
                reply = params["item"].get("text")
            if method == "turn/completed":
                completed = params.get("turn", {})
                report["turn_status"] = completed.get("status")
                break
            if method == "error":
                raise ProbeError("turn_error_no_retry")
        report["duration_ms"] = round((time.monotonic() - started) * 1000)
        report["reply_matches_expected"] = isinstance(reply, str) and reply.strip() == "MYBOT_ACCOUNT_OK"
        if report["reply_matches_expected"]:
            report["reply"] = "MYBOT_ACCOUNT_OK"
        report["status"] = (
            "passed" if report.get("turn_status") == "completed" and report["reply_matches_expected"]
            and client.tool_items == 0 else "not_passed_no_retry"
        )
    except ProbeError:
        report["failed_phase"] = phase
        raise
    finally:
        report["tool_item_count"] = client.tool_items
        report["observed_item_types"] = sorted(kind for kind in client.types if isinstance(kind, str))
        report["visible_usage"] = client.usage
        report["client_exit_code"] = client.stop()
        report["client_stopped"] = client.child.poll() is not None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allow-one-request", action="store_true",
                        help="Requires fresh explicit user authorization; otherwise preflight only.")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    args.report.parent.mkdir(parents=True, exist_ok=True)
    # Reserve the report before any model request; do not overwrite or retry a previous attempt.
    with args.report.open("x") as output:
        report = {
            "date": datetime.now(timezone.utc).isoformat(),
            "scope": "one authorized text-only Codex CLI turn, not an OpenMausBot integration",
            "authorized_one_request": args.allow_one_request,
            "prompt": PROMPT, "turn_start_calls": 0, "automatic_rerun": False,
            "status": "preflight_started",
            "wire_request_count": "not independently observed",
            "credential_values_logged": False,
        }
        try:
            run(args, report)
        except (ProbeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
            report["status"] = "stopped_no_retry"
            report["error"] = str(error) if isinstance(error, ProbeError) else type(error).__name__
        json.dump(report, output, indent=2)
        output.write("\n")
    print(json.dumps(report, indent=2))
    return 0 if report["status"] in {"passed", "preflight_only_no_model_turn"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
