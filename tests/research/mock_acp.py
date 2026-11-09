"""Synthetic stdio ACP peer. No model, tool execution, credentials, or network."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import sys
import uuid


def run(lines, output, log_path: Path) -> None:
    pending = {}

    def emit(value):
        output.write(json.dumps({"jsonrpc": "2.0", **value}) + "\n")
        output.flush()

    def result(identifier, value):
        emit({"id": identifier, "result": value})

    for line in lines:
        if len(line) > 1_000_000:
            raise ValueError("mock input too large")
        message = json.loads(line)
        method = message.get("method")
        params = message.get("params", {})
        identifier = message.get("id")
        session = params.get("sessionId")
        text = "\n".join(
            part.get("text", "") for part in params.get("prompt", [])
            if part.get("type") == "text"
        )
        markers = re.findall(r"MYBOT_(?:OK|HOLD|FAIL|ASK)_[A-Z0-9]+", text)
        marker = markers[-1] if markers else None
        with log_path.open("a") as log:
            log.write(json.dumps({
                "method": method, "session": session, "marker": marker,
                "pid": os.getpid(), "fixture_only": True,
                **({"unmarked_prompt_prefix": text[:240]} if method == "session/prompt" and not marker else {}),
            }) + "\n")
        if method == "initialize":
            result(identifier, {
                "protocolVersion": 1,
                "agentCapabilities": {
                    "loadSession": True,
                    "promptCapabilities": {"image": False, "embeddedContext": False},
                    "mcpCapabilities": {"http": False, "sse": False},
                },
                "authMethods": [],
            })
        elif method == "session/new":
            result(identifier, {"sessionId": str(uuid.uuid4())})
        elif method in {"session/load", "session/set_mode", "session/set_model",
                        "session/set_config_option", "authenticate", "session/close"}:
            result(identifier, {})
        elif method == "session/prompt":
            if not marker:
                emit({"id": identifier, "error": {
                    "code": -32602, "message": "Synthetic peer requires a MYBOT marker",
                }})
            elif marker.startswith("MYBOT_HOLD_"):
                pending[session] = identifier
            elif marker.startswith("MYBOT_FAIL_"):
                emit({"id": identifier, "error": {
                    "code": -32603, "message": "Synthetic fixture failure; no model called",
                }})
            elif marker.startswith("MYBOT_ASK_"):
                pending[session] = identifier
                emit({"id": "mock-permission", "method": "session/request_permission", "params": {
                    "sessionId": session,
                    "toolCall": {"toolCallId": "synthetic-command", "kind": "execute",
                                 "title": "Synthetic command, never executed",
                                 "rawInput": {"command": "synthetic-never-execute"}},
                    "options": [
                        {"optionId": "allow", "kind": "allow_once", "name": "Allow"},
                        {"optionId": "reject", "kind": "reject_once", "name": "Reject"},
                    ],
                }})
            else:
                emit({"method": "session/update", "params": {
                    "sessionId": session,
                    "update": {"sessionUpdate": "agent_message_chunk",
                               "content": {"type": "text", "text": f"MOCK ONLY: {marker}"}},
                }})
                result(identifier, {"stopReason": "end_turn"})
        elif method == "session/cancel":
            if session in pending:
                result(pending.pop(session), {"stopReason": "cancelled"})
        elif identifier is not None and method:
            emit({"id": identifier, "error": {"code": -32601, "message": "Unknown mock method"}})


if __name__ == "__main__":
    if "--version" in sys.argv:
        print("mybot-synthetic-acp 1.0.0")
    else:
        run(sys.stdin, sys.stdout, Path(os.environ["MYBOT_MOCK_ACP_LOG"]))
