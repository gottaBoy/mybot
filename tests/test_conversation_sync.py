import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from test_workbench import fixture, post
from workbench.app import create_app
from workbench.backend import BackendConnection, BackendError, OpenMausBotNativeReadAdapter


@pytest.fixture
def sync_fixture(fixture):
    _, provider, settings = fixture
    requests = []
    state = {"has_more": True, "deny": False, "invalid": False, "revoke": None}

    def handler(request):
        requests.append(request)
        assert request.method == "GET"
        if state["revoke"]:
            state["revoke"]()
        if state["deny"]:
            return httpx.Response(403, text="PRIVATE_ERROR")
        if request.url.path == "/api/bots":
            assert request.url.params["messages"] == "0"
            return httpx.Response(200, json={"bots": [
                {"id": "b1", "name": "Research <bot>", "threadId": "t1", "status": "idle"},
            ]})
        assert request.url.path == "/api/threads/t1/messages"
        assert request.url.params["limit"] == "30"
        return httpx.Response(200, json={
            "messages": [
                {"id": "m1", "kind": "text", "role": "user", "text": "<script>text</script>", "at": 1794355200000},
                {"id": "m2", "kind": "text", "role": "bot", "text": "Answer", "at": 1794355201000},
                {"id": "s1", "kind": "secret", "secret": {"value": "NEVER_CACHE"}},
            ],
            "hasMore": "invalid" if state["invalid"] else state["has_more"],
        })

    client = httpx.AsyncClient(base_url="http://127.0.0.1:8000", transport=httpx.MockTransport(handler))
    app = create_app(settings, provider, OpenMausBotNativeReadAdapter(client))
    with TestClient(app) as api:
        connection = post(api, "/api/backends", {
            "name": "OMB", "endpoint": "http://127.0.0.1:8000",
        }).json()
        yield api, app, provider, settings, connection, requests, state
    asyncio.run(client.aclose())


def sync_list(api, connection):
    result = post(api, f"/api/backends/{connection['id']}/sync", {"consent": True})
    assert result.status_code == 200, result.text
    return api.get(f"/api/backends/{connection['id']}/conversations").json()["conversations"][0]


def test_explicit_sync_is_bounded_deduplicated_text_only_and_chronological(sync_fixture):
    api, app, provider, _, connection, requests, _ = sync_fixture
    assert post(api, f"/api/backends/{connection['id']}/sync", {}).status_code == 422
    assert requests == []
    ref = sync_list(api, connection)
    sync_list(api, connection)
    assert len(api.get(f"/api/backends/{connection['id']}/conversations").json()["conversations"]) == 1
    assert post(api, f"/api/conversations/{ref['id']}/sync", {}).status_code == 422
    for _ in range(2):
        result = post(api, f"/api/conversations/{ref['id']}/sync", {"consent": True})
        assert result.status_code == 200, result.text
        assert result.json()["has_more"] is True
        assert result.json()["count"] == 2
    count = len(requests)
    cache = api.get(f"/api/conversations/{ref['id']}/messages").json()
    assert [msg["external_id"] for msg in cache["messages"]] == ["m1", "m2"]
    assert [msg["role"] for msg in cache["messages"]] == ["user", "bot"]
    assert cache["messages"][0]["created_at"].startswith("2026-")
    assert cache["checked_at"] and cache["has_more"] is True
    assert "NEVER_CACHE" not in str(app.state.store.list("conversation_messages", ref["id"]))
    api.get("/api/bootstrap")
    assert len(requests) == count
    assert provider.requests == []


def test_fresh_adapter_can_read_persisted_conversation_after_restart(sync_fixture):
    api, app, _, _, connection, _, _ = sync_fixture
    ref = sync_list(api, connection)
    # A fresh adapter has never listed conversations; connection data must
    # come from Store rather than a previous process's in-memory registry.
    app.state.backends.read_adapter = OpenMausBotNativeReadAdapter(app.state.backends.read_adapter.client)
    response = post(api, f"/api/conversations/{ref['id']}/sync", {"consent": True})
    assert response.status_code == 200, response.text


@pytest.mark.parametrize("stage", ["conversations", "messages"])
def test_revoke_during_sync_rejects_late_persistence(sync_fixture, stage):
    api, app, _, _, connection, _, state = sync_fixture
    if stage == "messages":
        ref = sync_list(api, connection)
        target = f"/api/conversations/{ref['id']}/sync"
    else:
        target = f"/api/backends/{connection['id']}/sync"
    state["revoke"] = lambda: app.state.store.revoke_backend(connection["id"])
    response = post(api, target, {"consent": True})
    assert response.status_code == 409
    assert response.json()["detail"] == "backend_revoked"
    table = "conversation_messages" if stage == "messages" else "conversation_refs"
    assert app.state.store.list(table) == []
    assert connection["id"] not in api.get("/api/bootstrap").json()["backend_conversations"]


def test_revoke_blocks_all_cache_and_sync_access(sync_fixture):
    api, _, _, _, connection, requests, _ = sync_fixture
    ref = sync_list(api, connection)
    assert post(api, f"/api/conversations/{ref['id']}/sync", {"consent": True}).status_code == 200
    post(api, f"/api/backends/{connection['id']}/revoke", {})
    count = len(requests)
    assert api.get(f"/api/conversations/{ref['id']}/messages").status_code == 409
    assert api.get(f"/api/backends/{connection['id']}/conversations").status_code == 409
    assert post(api, f"/api/conversations/{ref['id']}/sync", {"consent": True}).status_code == 409
    assert connection["id"] not in api.get("/api/bootstrap").json()["backend_conversations"]
    assert len(requests) == count


def test_invalid_schema_or_access_denied_preserves_previous_cache(sync_fixture):
    api, _, _, _, connection, _, state = sync_fixture
    ref = sync_list(api, connection)
    post(api, f"/api/conversations/{ref['id']}/sync", {"consent": True})
    before = api.get(f"/api/conversations/{ref['id']}/messages").json()
    state["invalid"] = True
    assert post(api, f"/api/conversations/{ref['id']}/sync", {"consent": True}).status_code == 409
    state["deny"] = True
    failed = post(api, f"/api/conversations/{ref['id']}/sync", {"consent": True})
    assert failed.json()["detail"] == "backend_access_denied"
    assert "PRIVATE_ERROR" not in failed.text
    assert api.get(f"/api/conversations/{ref['id']}/messages").json() == before


def test_production_transcript_reads_fail_closed_without_any_request(fixture, monkeypatch):
    app, provider, _ = fixture

    async def forbid(*args, **kwargs):
        raise AssertionError("Production transcript read attempted network")

    monkeypatch.setattr(httpx.AsyncClient, "send", forbid)
    with TestClient(app) as api:
        connection = post(api, "/api/backends", {"name": "OMB", "endpoint": "http://127.0.0.1:8000"}).json()
        assert api.get("/api/bootstrap").json()["capabilities"]["backend_sync"] is False
        response = post(api, f"/api/backends/{connection['id']}/sync", {"consent": True})
        assert response.status_code == 409
        assert response.json()["detail"] == "backend_read_scope_unverified"
        assert provider.requests == []


@pytest.mark.parametrize("operation", ["conversations", "messages"])
def test_sync_revalidates_legacy_endpoint_before_network(sync_fixture, operation):
    api, app, _, _, connection, requests, _ = sync_fixture
    if operation == "messages":
        ref = sync_list(api, connection)
        target = f"/api/conversations/{ref['id']}/sync"
    else:
        target = f"/api/backends/{connection['id']}/sync"
    with app.state.store.transaction() as db:
        db.execute("UPDATE backend_connections SET endpoint=? WHERE id=?",
                   ("https://unreviewed.example", connection["id"]))
    count = len(requests)
    response = post(api, target, {"consent": True})
    assert response.status_code == 409
    assert response.json()["detail"] == "backend_endpoint_invalid"
    assert len(requests) == count


@pytest.mark.parametrize("status,expected", [
    (401, "backend_auth_required"), (403, "backend_access_denied"),
    (302, "backend_redirect_denied"), (503, "backend_http_503"),
])
def test_native_read_refusals_are_not_retried(status, expected):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(status, text="PRIVATE", headers={"location": "https://other.example"})

    async def run():
        async with httpx.AsyncClient(
            base_url="http://127.0.0.1:8000", transport=httpx.MockTransport(handler),
            follow_redirects=True,
        ) as client:
            with pytest.raises(BackendError, match=expected) as error:
                await OpenMausBotNativeReadAdapter(client).list_conversations(
                    BackendConnection("c", "OMB", "openmausbot", "http://127.0.0.1:8000", "configured")
                )
            assert "PRIVATE" not in str(error.value)
    asyncio.run(run())
    assert len(requests) == 1
