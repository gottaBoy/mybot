"""Offline probe tests; no upstream, credentials, model, or service launched."""

import io
import json

import pytest

from mock_acp import run
from verify_omb_mcp import allowed_bridge_request


@pytest.mark.parametrize("method,path", [
    ("GET", "/api/health"),
    ("GET", "/api/bots?messages=0"),
    ("GET", "/api/threads/task-1/job?scope=job&wait=500"),
    ("GET", "/api/threads/task-1/messages?limit=20"),
    ("POST", "/api/bots"),
    ("POST", "/api/bots/bot-1/messages"),
    ("POST", "/api/bots/bot-1/interrupt"),
    ("POST", "/api/bots/bot-1/tasks"),
    ("PATCH", "/api/bots/bot-1"),
])
def test_bridge_allows_only_bounded_control_routes(method, path):
    assert allowed_bridge_request(method, path)


@pytest.mark.parametrize("method,path", [
    ("GET", "https://example.com/api/bots"),
    ("GET", "//example.com/api/bots"),
    ("GET", "/api/config"),
    ("POST", "/api/auth/pair"),
    ("POST", "/api/auth/pairing"),
    ("POST", "/api/approvals/request-1"),
    ("DELETE", "/api/bots/bot-1"),
    ("POST", "/api/bots/bot-1/computer"),
    ("GET", "/api/threads/%2e%2e/messages"),
    ("GET", "/api/threads/../messages"),
    ("GET", "/api/bots#secret"),
    ("CONNECT", "/api/bots"),
    ("GET", "/api/" + "x" * 2050),
])
def test_bridge_refuses_external_and_management_routes(method, path):
    assert not allowed_bridge_request(method, path)


def exchange(tmp_path, *requests):
    output = io.StringIO()
    log = tmp_path / "mock.jsonl"
    run([json.dumps(row) + "\n" for row in requests], output, log)
    return [json.loads(line) for line in output.getvalue().splitlines()], [
        json.loads(line) for line in log.read_text().splitlines()
    ]


def prompt(marker):
    return {"jsonrpc": "2.0", "id": 7, "method": "session/prompt", "params": {
        "sessionId": "synthetic-session", "prompt": [{"type": "text", "text": marker}],
    }}


def test_mock_normal_reply_is_explicitly_a_fixture(tmp_path):
    replies, receipts = exchange(tmp_path, prompt("MYBOT_OK_UNIT"))
    assert replies[0]["params"]["update"]["content"]["text"] == "MOCK ONLY: MYBOT_OK_UNIT"
    assert replies[-1]["result"]["stopReason"] == "end_turn"
    assert receipts[0]["fixture_only"] is True


def test_mock_without_marker_refuses_unexpected_prompt(tmp_path):
    replies, _ = exchange(tmp_path, prompt("not an authorized synthetic prompt"))
    assert replies[0]["error"]["code"] == -32602


def test_mock_failure_does_not_become_success(tmp_path):
    replies, _ = exchange(tmp_path, prompt("MYBOT_FAIL_UNIT"))
    assert replies[0]["error"]["code"] == -32603
    assert "result" not in replies[0]


def test_mock_holds_until_cancel_without_execution(tmp_path):
    replies, receipts = exchange(tmp_path, prompt("MYBOT_HOLD_UNIT"), {
        "jsonrpc": "2.0", "method": "session/cancel", "params": {"sessionId": "synthetic-session"},
    })
    assert replies == [{"jsonrpc": "2.0", "id": 7, "result": {"stopReason": "cancelled"}}]
    assert [row["method"] for row in receipts] == ["session/prompt", "session/cancel"]


def test_mock_permission_request_never_executes_command(tmp_path):
    replies, _ = exchange(tmp_path, prompt("MYBOT_ASK_UNIT"))
    assert replies[0]["method"] == "session/request_permission"
    assert replies[0]["params"]["toolCall"]["rawInput"]["command"] == "synthetic-never-execute"
    assert not any("result" in row for row in replies)
