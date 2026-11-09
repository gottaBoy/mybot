import asyncio

import httpx
import pytest

from workbench.backend import (
    BackendConnection,
    BackendError,
    ConversationRef,
    OpenMausBotReadOnlyAdapter,
    UnconfiguredConversationBackend,
)


def test_unconfigured_backend_has_no_network_or_send_path():
    backend = UnconfiguredConversationBackend()
    connection = BackendConnection("c1", "OpenMausBot", "openmausbot", "", "unconfigured")
    conversations, cursor = asyncio.run(backend.list_conversations(connection))
    assert conversations == []
    assert cursor is None
    with pytest.raises(BackendError, match="backend_adapter_not_configured"):
        asyncio.run(backend.list_messages(
            ConversationRef("r1", "c1", "thread-1", "Thread", "unknown")
        ))


def test_backend_value_objects_are_stable():
    conversation = ConversationRef("r1", "c1", "thread-1", "Thread", "active", "cursor-1")
    assert conversation.connection_id == "c1"
    assert conversation.cursor == "cursor-1"


def test_openmausbot_read_adapter_maps_pages_and_deduplicates():
    requests = []

    def handler(request):
        requests.append(request)
        if request.url.path == "/conversations":
            return httpx.Response(200, json={
                "threads": [
                    {"id": "t1", "title": "One", "status": "active"},
                    {"id": "t1", "title": "Duplicate", "status": "active"},
                ],
                "nextCursor": "c2",
            })
        return httpx.Response(200, json={
            "messages": [
                {"id": "m1", "role": "user", "text": "hello", "created_at": "2026-11-09T00:00:00Z"},
                {"id": "m1", "role": "user", "text": "duplicate"},
            ],
            "next_cursor": None,
        })

    client = httpx.AsyncClient(
        base_url="http://mock.local", transport=httpx.MockTransport(handler),
    )
    adapter = OpenMausBotReadOnlyAdapter(client)
    connection = BackendConnection("c1", "OMB", "openmausbot", "http://mock.local", "configured")

    async def run():
        conversations, cursor = await adapter.list_conversations(connection)
        messages, next_cursor = await adapter.list_messages(conversations[0])
        await client.aclose()
        return conversations, cursor, messages, next_cursor

    conversations, cursor, messages, next_cursor = asyncio.run(run())
    assert [item.external_id for item in conversations] == ["t1"]
    assert cursor == "c2"
    assert messages[0].content == "hello"
    assert next_cursor is None
    assert [request.method for request in requests] == ["GET", "GET"]
    assert "cursor" not in requests[0].url.params


@pytest.mark.parametrize("status,code", [
    (403, "backend_access_denied"), (404, "backend_not_found"), (503, "backend_http_503"),
])
def test_openmausbot_read_adapter_maps_http_failures(status, code):
    client = httpx.AsyncClient(
        base_url="http://mock.local",
        transport=httpx.MockTransport(lambda request: httpx.Response(status)),
    )
    adapter = OpenMausBotReadOnlyAdapter(client)
    connection = BackendConnection("c1", "OMB", "openmausbot", "http://mock.local", "configured")
    with pytest.raises(BackendError, match=code):
        asyncio.run(adapter.list_conversations(connection))
    asyncio.run(client.aclose())


def test_openmausbot_read_adapter_rejects_schema_and_revoked_connection():
    client = httpx.AsyncClient(
        base_url="http://mock.local",
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"data": []})),
    )
    adapter = OpenMausBotReadOnlyAdapter(client)
    malformed = BackendConnection("c1", "OMB", "openmausbot", "http://mock.local", "configured")
    revoked = BackendConnection("c2", "OMB", "openmausbot", "http://mock.local", "revoked", "now")
    with pytest.raises(BackendError, match="backend_schema_invalid"):
        asyncio.run(adapter.list_conversations(malformed))
    with pytest.raises(BackendError, match="backend_revoked"):
        asyncio.run(adapter.list_conversations(revoked))
    asyncio.run(client.aclose())
