"""Isolated upstream MCP/control-plane probe with a synthetic stdio ACP engine."""

from __future__ import annotations

import argparse
import base64
from collections import deque
from datetime import datetime, timezone
import hashlib
from http.client import HTTPConnection
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from verify_omb_p0 import INTEGRITY, VERSION, free_port, guarded, server


def allowed_bridge_request(method: str, path: str) -> bool:
    parsed = urlsplit(path)
    if parsed.scheme or parsed.netloc or parsed.fragment or len(path) > 2048:
        return False
    if not path.startswith("/api/") or "%" in parsed.path:
        return False
    routes = {
        "GET": [
            r"/api/health", r"/api/bots", r"/api/instances", r"/api/search",
            r"/api/threads/[\w-]+/(?:messages|job)",
        ],
        "POST": [
            r"/api/bots", r"/api/bots/[\w-]+/(?:tasks|messages|interrupt)",
            r"/api/bots/[\w-]+/tasks/[\w-]+",
        ],
        "PATCH": [r"/api/bots/[\w-]+", r"/api/bots/[\w-]+/tasks/[\w-]+"],
    }
    return any(re.fullmatch(pattern, parsed.path) for pattern in routes.get(method, []))


def http(port, path, method="GET", payload=None, token=None, timeout=8):
    connection = HTTPConnection("127.0.0.1", port, timeout=timeout)
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        connection.request(method, path, None if payload is None else json.dumps(payload), headers)
        response = connection.getresponse()
        content = response.read(2_000_001)
        if len(content) > 2_000_000:
            raise ValueError("upstream response exceeds probe limit")
        return response.status, json.loads(content)
    finally:
        connection.close()


def verify_package(args):
    integrity = "sha512-" + base64.b64encode(hashlib.sha512(args.archive.read_bytes()).digest()).decode()
    if integrity != INTEGRITY:
        raise ValueError("wrong package archive integrity")
    with tarfile.open(args.archive) as archive:
        for member in archive.getmembers():
            if not member.isfile():
                continue
            relative = Path(member.name).relative_to("package")
            local = (args.package / relative).resolve(strict=True)
            if not local.is_relative_to(args.package):
                raise ValueError("archive path escape")
            with archive.extractfile(member) as data:
                if hashlib.sha256(data.read()).digest() != hashlib.sha256(local.read_bytes()).digest():
                    raise ValueError(f"changed upstream member: {relative}")
    metadata = json.loads((args.package / "package.json").read_text())
    if metadata["name"] != "openmausbot" or metadata["version"] != VERSION:
        raise ValueError("wrong package identity")


class McpProbe:
    def __init__(self, args, profile, port, token, observations):
        self.port, self.token = port, token
        self.observations = observations
        self.next_id = 0
        self.responses = {}
        self.buffer = b""
        self.lines = deque()
        self.log = (profile / "mcp-bridge.log").open("a")
        self.child = subprocess.Popen(
            guarded(args, profile) + [
                "--", str(args.node), str(profile / "omb_mcp_bridge.mjs"),
                str(args.package / "dist-server/mcp-server.js"),
            ],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.log,
            start_new_session=True,
        )
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.child.stdout, selectors.EVENT_READ)

    def __enter__(self):
        return self

    def write(self, frame):
        self.child.stdin.write((json.dumps(frame) + "\n").encode())
        self.child.stdin.flush()

    def rpc(self, method, params=None, timeout=12):
        self.next_id += 1
        identifier = self.next_id
        frame = {"jsonrpc": "2.0", "id": identifier, "method": method}
        if params is not None:
            frame["params"] = params
        self.write({"rpc": frame})
        deadline = time.monotonic() + timeout
        while identifier not in self.responses:
            if not self.lines:
                if not self.selector.select(max(0, deadline - time.monotonic())):
                    raise TimeoutError(f"MCP deadline: {method}")
                chunk = os.read(self.child.stdout.fileno(), 65536)
                if not chunk:
                    raise RuntimeError("MCP child exited")
                self.buffer += chunk
                if len(self.buffer) > 2_000_000:
                    raise ValueError("MCP output exceeds probe limit")
                parts = self.buffer.split(b"\n")
                self.buffer = parts.pop()
                self.lines.extend(parts)
                continue
            line = self.lines.popleft().decode()
            if line.startswith("P0 guard active:"):
                continue
            incoming = json.loads(line)
            if "bridgeRequest" in incoming:
                verb, path = incoming["method"], incoming["path"]
                if not allowed_bridge_request(verb, path):
                    raise ValueError(f"bridge refused {verb} {path}")
                body = json.loads(incoming["body"]) if incoming.get("body") else None
                status, result = http(self.port, path, verb, body, self.token, timeout=5)
                self.observations["http"].append({"method": verb, "path": path, "status": status})
                self.write({"bridgeResponse": incoming["bridgeRequest"], "status": status, "body": result})
            elif "mcpResponse" in incoming:
                response = incoming["mcpResponse"]
                self.responses[response["id"]] = response
            else:
                raise RuntimeError(f"unexpected bridge frame: {incoming}")
        return self.responses.pop(identifier)

    def tool(self, name, args=None):
        response = self.rpc("tools/call", {"name": name, "arguments": args or {}})
        if "error" in response:
            raise RuntimeError(f"{name}: {response['error']}")
        result = response["result"]
        if result.get("isError"):
            raise RuntimeError(f"{name}: {result['content']}")
        return result.get("structuredContent") or json.loads(result["content"][0]["text"])

    def __exit__(self, *_exc):
        try:
            self.child.stdin.close()
            try:
                self.child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.child.send_signal(signal.SIGTERM)
                self.child.wait(timeout=3)
        finally:
            self.selector.close()
            self.child.stdout.close()
            self.log.close()
        self.observations.setdefault("bridge_exit_codes", []).append(self.child.returncode)


def init_params():
    return {"protocolVersion": "2025-11-25", "capabilities": {},
            "clientInfo": {"name": "mybot-isolated-research", "version": "1.0.0"}}


def mock_calls(profile):
    path = profile / "mock-acp.jsonl"
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


def prompt_count(profile, marker=None):
    return sum(row["method"] == "session/prompt" and (marker is None or row["marker"] == marker)
               for row in mock_calls(profile))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("package", "archive", "node", "report"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--fixed-default", action="store_true",
                        help="Compare upstream behavior with an explicit saved synthetic model default")
    args = parser.parse_args()
    for name in ("package", "archive", "node"):
        setattr(args, name, getattr(args, name).resolve(strict=True))
    if args.report.exists():
        raise SystemExit("Existing evidence must not be overwritten")
    root = Path(tempfile.mkdtemp(prefix="mybot-omb-mcp-"))
    profile = root / "profile"
    profile.mkdir(mode=0o700)
    checks, observations = {}, {"http": []}
    report = {
        "schema_version": 1, "recorded_at": datetime.now(timezone.utc).isoformat(),
        "scope": "Real pinned upstream server and MCP handlers; synthetic stdio ACP; no real model/tools",
        "saved_synthetic_model_default": args.fixed_default,
        "version": VERSION, "temporary_root": str(root), "checks": checks,
        "observations": observations, "launches": [], "errors": [],
        "limitations": [
            "Handler HTTP is injected through the trusted probe, not native MCP fetch/socket transport.",
            "Native packaged stdio entry tested only for initialize/tools/list without HTTP.",
            "No production integration, real model, account, phone, GUI, Shell or App action.",
            "Ask configuration and mock refusal are not a production capability ceiling.",
            "No SSE/replay, RPC cancellation, crash recovery, multi-agent delegation or live approval acceptance.",
        ],
    }

    def check(name, passed):
        checks[name] = bool(passed)
        if not passed:
            raise AssertionError(name)

    def api(port, path, method="GET", payload=None, token=None, expected=200):
        status, value = http(port, path, method, payload, token)
        if status != expected:
            raise RuntimeError(f"{method} {path}: HTTP {status}: {value}")
        return value

    token = None
    try:
        verify_package(args)
        checks["verified_package_archive_and_members"] = True
        report["integrity"] = INTEGRITY
        report["selected_sha256"] = {
            name: hashlib.sha256((args.package / name).read_bytes()).hexdigest()
            for name in ("dist-server/index.js", "dist-server/mcp-server.js",
                         "dist-server/scripts/mcp-server.js",
                         "dist-server/server/drivers/acp/core.js",
                         "dist-server/server/drivers/acp/custom.js")
        }
        for filename in ("mock_acp.py", "omb_mcp_bridge.mjs"):
            shutil.copyfile(HERE / filename, profile / filename)
        sentinel = root / "denied.txt"
        sentinel.write_text("synthetic sentinel, not a credential\n")
        tested = subprocess.run(
            guarded(args, profile) + [
                "--read", str(HERE / "guard_selftest.py"), "--port", str(port := free_port()),
                "--", "/usr/bin/python3", "-I", str(HERE / "guard_selftest.py"),
                str(profile), str(sentinel), str(port),
            ], env={"PATH": "/usr/bin:/bin", "MYBOT_P0_SYNTHETIC_SECRET": "synthetic"},
            text=True, capture_output=True, timeout=10,
        )
        report["guard"] = json.loads(tested.stdout.splitlines()[-1])["guard_checks"]
        check("unchanged_deny_all_guard_selftest", tested.returncode == 0 and all(report["guard"].values()))
        node = subprocess.run(
            guarded(args, profile) + ["--", str(args.node), "--version"],
            text=True, capture_output=True, timeout=10,
        )
        check("node_version_pinned", node.returncode == 0 and node.stdout.splitlines()[-1] == "v24.22.1")
        native = subprocess.run(
            guarded(args, profile) + ["--", str(args.node), str(args.package / "dist-server/mcp-server.js")],
            input="\n".join(json.dumps(value) for value in [
                {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": init_params()},
                {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
            ]) + "\n", text=True, capture_output=True, timeout=10,
        )
        replies = {row["id"]: row for line in native.stdout.splitlines()
                   if line.startswith("{") and (row := json.loads(line))}
        check("native_mcp_stdio_initialize", native.returncode == 0 and
              replies[1]["result"]["serverInfo"]["name"] == "openmausbot-mcp")
        tools = [row["name"] for row in replies[2]["result"]["tools"]]
        observations["tool_names"] = tools
        check("native_mcp_tools_include_work_control",
              {"create_bot", "create_task", "send_bot_message", "wait_for_conversation",
               "interrupt_conversation", "get_bot_messages"} <= set(tools))
        check("native_mcp_no_grant_or_credential_tools",
              not any(re.search(r"approv|credential|grant|delete", name) for name in tools))

        config = {
            "instances": {"mybot-mock": {
                "driver": "customAcp", "displayName": "MYBOT SYNTHETIC ACP",
                "config": {"cli": f"/usr/bin/python3 -I {profile / 'mock_acp.py'}"},
                "environment": {"MYBOT_MOCK_ACP_LOG": str(profile / "mock-acp.jsonl")},
            }},
            "newBotDefaults": {"profile": {"approvalMode": "ask"}},
            "features": {"browser": False, "autoRecall": False, "skillAuthoring": False},
            "automaticRecovery": {"enabled": False},
            "memory": {"captureQuietMs": 86_400_000},
        }
        if args.fixed_default:
            config["defaultModelSelection"] = {"instanceId": "mybot-mock", "model": "agent-default"}
        (profile / "data/config.json").write_text(json.dumps(config))
        with server(args, profile, "owner", report["launches"]) as port:
            if args.fixed_default:
                time.sleep(0.2)
                check("saved_default_boot_does_not_send_synthetic_prompts", prompt_count(profile) == 0)
            pairing = api(port, "/api/auth/pairing", "POST", {"scopes": ["admin", "client"]})
            paired = api(port, "/api/auth/pair", "POST", {
                "code": pairing["code"].replace(" ", ""), "label": "Synthetic MCP probe",
            })
            token = paired["token"]
            observations["synthetic_session_scopes"] = paired["session"]["scopes"]
            check("synthetic_pairing_mints_session", token.startswith("omb_sess_"))
            check("single_use_pairing_refuses_replay", http(port, "/api/auth/pair", "POST", {
                "code": pairing["code"].replace(" ", ""), "label": "Replay fixture",
            })[0] in (401, 403, 409, 429))

        with server(args, profile, "service", report["launches"]) as port:
            with McpProbe(args, profile, port, None, observations) as anonymous:
                refused = anonymous.rpc("tools/call", {"name": "create_bot", "arguments": {"name": "Unpaired"}})
                check("service_unpaired_mcp_write_refused", refused["result"].get("isError") is True)
            with McpProbe(args, profile, port, token, observations) as mcp:
                check("bridge_initialize", mcp.rpc("initialize", init_params())["result"]["protocolVersion"] == "2025-11-25")
                fleet = mcp.tool("list_bots")
                check("paired_mcp_read_bots", isinstance(fleet["bots"], list))
                instances = api(port, "/api/instances", token=token)["instances"]
                engine = next(row for row in instances if row["instanceId"] == "mybot-mock")
                observations["mock_engine"] = {"instanceId": engine["instanceId"], "snapshot": engine["snapshot"]}
                check("synthetic_engine_available", engine["snapshot"]["state"] == "available")
                if args.fixed_default:
                    check("instance_read_does_not_send_synthetic_prompts", prompt_count(profile) == 0)
                bot = mcp.tool("create_bot", {
                    "name": "MYBOT Research Fixture", "title": "Read-only research fixture",
                    "instance_id": "mybot-mock", "model": "agent-default",
                })["bot"]
                bot_id = bot["id"]
                observations["bot_id"] = bot_id
                raw_bot = next(row for row in api(port, "/api/bots", token=token)["bots"] if row["id"] == bot_id)
                check("created_bot_ask_template", raw_bot["approvalMode"] == "ask")
                invalid = mcp.rpc("tools/call", {"name": "update_bot_profile", "arguments": {
                    "bot_id": bot_id, "approvalMode": "full",
                }})
                check("mcp_profile_rejects_permission_fields", invalid.get("error", {}).get("code") == -32602)
                mcp.tool("update_bot_profile", {"bot_id": bot_id, "description": "Synthetic persistent profile"})
                task = mcp.tool("create_task", {"target_type": "bot", "target_id": bot_id,
                                               "title": "Persistent synthetic conversation"})["task"]
                task_id = task["taskId"]
                observations["task_id"] = task_id
                target = {"target_type": "bot", "target_id": bot_id, "task_id": task_id}
                send = {"bot_id": bot_id, "task_id": task_id}
                wait = lambda **extra: mcp.tool("wait_for_conversation", {**target, "timeout_seconds": 4, **extra})
                messages = lambda: mcp.tool("get_bot_messages", {**send, "limit": 50})["messages"]

                receipt = mcp.tool("send_bot_message", {
                    **send, "text": "MYBOT_OK_FIRST", "send_id": "mybot-unique-send-0001",
                })
                first_wait = wait()
                observations["first_wait"] = first_wait
                check("mock_turn_completes", first_wait["state"] == "completed")
                check("transcript_contains_mock_reply", any(row.get("text") == "MOCK ONLY: MYBOT_OK_FIRST" for row in messages()))
                repeated = mcp.tool("send_bot_message", {
                    **send, "text": "MYBOT_OK_FIRST", "send_id": "mybot-unique-send-0001",
                })
                check("duplicate_send_returns_same_receipt", receipt["messageId"] == repeated["messageId"])
                check("duplicate_send_only_one_mock_prompt", prompt_count(profile, "MYBOT_OK_FIRST") == 1)
                second_receipt = mcp.tool("send_bot_message", {**send, "text": "MYBOT_OK_SECOND", "send_id": "mybot-unique-send-0002"})
                second_wait = wait(since_ms=second_receipt["at"])
                observations["second_wait"] = second_wait
                check("followup_same_conversation_completed", second_wait["state"] == "completed")
                check("same_conversation_keeps_both_replies", len([
                    row for row in messages() if row.get("text") in {
                        "MOCK ONLY: MYBOT_OK_FIRST", "MOCK ONLY: MYBOT_OK_SECOND",
                    }
                ]) == 2)

                other_bot = mcp.tool("create_bot", {"name": "MYBOT Separate Fixture"})["bot"]
                foreign = mcp.rpc("tools/call", {"name": "get_bot_messages", "arguments": {
                    "bot_id": other_bot["id"], "task_id": task_id,
                }})
                check("cross_bot_task_binding_refused", foreign["result"].get("isError") is True)

                hold_receipt = mcp.tool("send_bot_message", {**send, "text": "MYBOT_HOLD_CANCEL", "send_id": "mybot-unique-send-0003"})
                hold = wait(timeout_seconds=1, since_ms=hold_receipt["at"])
                observations["hold_wait"] = hold
                check("running_wait_not_claimed_completed", hold["status"] == "timed-out")
                mcp.tool("interrupt_conversation", target)
                stopped = wait(since_ms=hold_receipt["at"])
                observations["stopped_wait"] = stopped
                check("interrupted_job_not_claimed_success", stopped["state"] == "failed")
                check("mock_received_cancel", any(row["method"] == "session/cancel" for row in mock_calls(profile)))
                failure_receipt = mcp.tool("send_bot_message", {**send, "text": "MYBOT_FAIL_EXPLICIT", "send_id": "mybot-unique-send-0004"})
                failed = wait(since_ms=failure_receipt["at"])
                observations["failed_wait"] = failed
                check("failed_job_not_claimed_success", failed["state"] == "failed")
                after_failure = mcp.tool("send_bot_message", {**send, "text": "MYBOT_OK_AFTERFAIL", "send_id": "mybot-unique-send-0005"})
                after_failure_wait = wait(since_ms=after_failure["at"])
                observations["after_failure_wait"] = after_failure_wait
                check("explicit_new_turn_after_failure", after_failure_wait["state"] == "completed")
                observations["pre_restart_prompts"] = [
                    row for row in mock_calls(profile) if row["method"] == "session/prompt"
                ]
                completed_counts = {
                    marker: prompt_count(profile, marker)
                    for marker in ("MYBOT_OK_FIRST", "MYBOT_OK_SECOND", "MYBOT_OK_AFTERFAIL")
                }

        with server(args, profile, "service", report["launches"]) as port:
            with McpProbe(args, profile, port, token, observations) as mcp:
                bots = mcp.tool("list_bots")["bots"]
                saved_bot = next(row for row in bots if row["id"] == bot_id)
                check("bot_profile_persisted_after_restart", saved_bot["description"] == "Synthetic persistent profile")
                check("task_persisted_after_restart", any(row["taskId"] == task_id for row in saved_bot["tasks"]))
                restored = mcp.tool("get_bot_messages", {**send, "limit": 100})
                check("transcript_persisted_after_restart",
                      any(row.get("text") == "MOCK ONLY: MYBOT_OK_SECOND" for row in restored["messages"]))
                time.sleep(0.2)
                observations["post_restart_prompts"] = [
                    row for row in mock_calls(profile) if row["method"] == "session/prompt"
                ]
                check("completed_user_turns_not_replayed_on_clean_restart", all(
                    prompt_count(profile, marker) == count for marker, count in completed_counts.items()
                ))
                if args.fixed_default:
                    check("saved_default_clean_restart_does_not_send_prompts",
                          len(observations["post_restart_prompts"]) == len(observations["pre_restart_prompts"]))
                restarted_receipt = mcp.tool("send_bot_message", {**send, "text": "MYBOT_OK_RESTART", "send_id": "mybot-unique-send-0006"})
                resumed = mcp.tool("wait_for_conversation", {
                    **target, "timeout_seconds": 4, "since_ms": restarted_receipt["at"],
                })
                check("explicit_followup_after_restart", resumed["state"] == "completed")
                status, _ = http(port, "/api/auth/logout", "POST", {}, token)
                check("synthetic_session_logout", status == 200)
                revoked = mcp.rpc("tools/call", {"name": "list_bots", "arguments": {}})
                check("revoked_session_refused_without_loopback_fallback", revoked["result"].get("isError") is True)
        checks["all_servers_stopped"] = all(row["listeners_closed"] for row in report["launches"])
        checks["all_bridge_children_stopped"] = all(code == 0 for code in observations["bridge_exit_codes"])
        observations["mock_receipts"] = mock_calls(profile)
        observations["mock_prompt_count"] = prompt_count(profile)
        observations["real_model_requests"] = 0
        observations["fixture_tool_executions"] = 0
    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}"
        if token:
            message = message.replace(token, "[synthetic-token-redacted]")
        report["errors"].append(message)
    finally:
        checks["all_servers_stopped"] = bool(report["launches"]) and all(
            row.get("listeners_closed") for row in report["launches"]
        )
        observations["mock_receipts"] = mock_calls(profile)
        observations["mock_prompt_count"] = prompt_count(profile)
        observations["unmarked_mock_prompt_count"] = sum(
            row["method"] == "session/prompt" and row["marker"] is None
            for row in observations["mock_receipts"]
        )
        report["passed"] = bool(checks) and all(checks.values()) and not report["errors"]
        report["adoption_verdict"] = "not adopted; bounded reuse evidence only"
        report["harness_sha256"] = {
            name: hashlib.sha256((HERE / name).read_bytes()).hexdigest()
            for name in ("verify_omb_mcp.py", "mock_acp.py", "omb_mcp_bridge.mjs", "guard.py", "guard_selftest.py")
        }
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"passed": report["passed"], "checks": len(checks),
                          "errors": report["errors"], "report": str(args.report)}))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
