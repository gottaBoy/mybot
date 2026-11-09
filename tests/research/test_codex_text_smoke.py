"""Offline protocol tests. Never launch Codex or send a provider request."""

import io
import json
from types import SimpleNamespace

import pytest

from codex_text_smoke import Client, ProbeError


def client_with(message):
    client = Client.__new__(Client)
    client.buffer = (json.dumps(message) + "\n").encode()
    client.child = SimpleNamespace(stdin=io.BytesIO())
    client.types = set()
    client.tool_items = 0
    client.usage = None
    return client


@pytest.mark.parametrize("kind", ["userMessage", "agentMessage", "reasoning"])
def test_text_item_classification_without_retaining_payload(kind):
    client = client_with({
        "method": "item/completed", "params": {"item": {"type": kind, "text": "synthetic"}},
    })
    client.receive(0)
    assert client.types == {kind}
    assert client.tool_items == 0


@pytest.mark.parametrize("kind", [
    "commandExecution", "fileChange", "mcpToolCall", "webSearch", "unknownTool",
])
def test_non_text_item_stops_probe(kind):
    client = client_with({"method": "item/started", "params": {"item": {"type": kind}}})
    with pytest.raises(ProbeError, match="non_text_item_observed"):
        client.receive(0)
    assert client.tool_items == 1


def test_server_tool_request_is_refused_not_executed():
    client = client_with({
        "id": 91, "method": "item/tool/call", "params": {"arguments": "synthetic"},
    })
    with pytest.raises(ProbeError, match="server_tool_or_approval_request_rejected"):
        client.receive(0)
    rejection = json.loads(client.child.stdin.getvalue())
    assert rejection["id"] == 91
    assert rejection["error"]["code"] == -32601
    assert "arguments" not in rejection


def test_usage_records_only_numeric_token_counters():
    client = client_with({
        "method": "thread/tokenUsage/updated", "params": {"tokenUsage": {
            "total": {"inputTokens": 3, "outputTokens": 1, "token": "synthetic-secret"},
            "last": {"inputTokens": True, "outputTokens": "1", "totalTokens": 4},
        }},
    })
    client.receive(0)
    assert client.usage == {
        "total": {"inputTokens": 3, "outputTokens": 1}, "last": {"totalTokens": 4},
    }


def test_invalid_protocol_does_not_echo_payload():
    client = client_with({})
    client.buffer = b"invalid-synthetic-sensitive-text\n"
    with pytest.raises(ProbeError) as error:
        client.receive(0)
    assert str(error.value) == "invalid_protocol_frame"
