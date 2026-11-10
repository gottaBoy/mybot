import asyncio
import httpx
import pytest
from fastapi.testclient import TestClient

import workbench.backend as backend_module
from test_workbench import FakeProvider, fixture, post
from workbench.app import create_app
from workbench.backend import BackendHealth, OpenMausBotNativeReadAdapter


@pytest.fixture
def connected_fixture(fixture):
    _, provider, settings = fixture
    requests = []

    def handler(request):
        requests.append(request)
        assert request.method == "GET"
        assert request.url.path == "/api/health"
        assert "authorization" not in request.headers
        assert "cookie" not in request.headers
        return httpx.Response(200, json={"app": "openmausbot", "static": True})

    transport = httpx.AsyncClient(
        base_url="http://127.0.0.1:8000", transport=httpx.MockTransport(handler),
    )
    app = create_app(settings, provider, OpenMausBotNativeReadAdapter(transport))
    with TestClient(app) as client:
        yield client, app, provider, settings, requests
    asyncio.run(transport.aclose())


def configure(client):
    response = post(client, "/api/backends", {"name": "OMB", "endpoint": "http://127.0.0.1:8000"})
    assert response.status_code == 201, response.text
    return response.json()


def test_save_list_bootstrap_health_get_and_reload_never_connect(connected_fixture):
    client, app, provider, settings, requests = connected_fixture
    connection = configure(client)
    identifier = connection["id"]
    assert connection["status"] == "configured"
    assert connection["test_status"] is None
    assert len(connection["settings"]["source_commit"]) == 40
    assert connection["settings"]["read_only"] is True
    assert client.get("/api/backends").json()["connections"] == [connection]
    assert client.get("/api/bootstrap").json()["backends"] == [connection]
    health = client.get(f"/api/backends/{identifier}/health").json()
    assert health["status"] == "untested"
    assert health["authentication"] == "unverified"
    assert health["read_access_verified"] is False
    assert app.state.store.get("backend_connections", identifier) == connection
    assert requests == provider.requests == []


def test_check_requires_consent_and_public_health_is_not_authentication(connected_fixture):
    client, app, provider, _, requests = connected_fixture
    connection = configure(client)
    identifier = connection["id"]
    response = post(client, f"/api/backends/{identifier}/check", {})
    assert response.status_code == 422
    assert requests == []
    checked = post(client, f"/api/backends/{identifier}/check", {"consent": True})
    assert checked.status_code == 200
    assert checked.json()["status"] == "reachable"
    assert checked.json()["authentication"] == "unverified"
    assert checked.json()["read_access_verified"] is False
    assert checked.json()["tested_at"]
    assert len(requests) == 1
    assert provider.requests == []
    assert app.state.store.get("backend_connections", identifier)["status"] == "configured"
    for _ in range(3):
        assert client.get(f"/api/backends/{identifier}/health").json() == checked.json()
    assert len(requests) == 1


def test_revoke_is_idempotent_blocks_checks_and_cached_conversations(connected_fixture):
    client, app, _, _, requests = connected_fixture
    connection = configure(client)
    identifier = connection["id"]
    app.state.store.add_conversation_ref({
        "connection_id": identifier, "external_id": "thread1", "title": "Cached", "status": "unknown",
    })
    revoked = post(client, f"/api/backends/{identifier}/revoke", {}).json()
    assert revoked["status"] == "revoked"
    assert revoked["revoked_at"]
    assert post(client, f"/api/backends/{identifier}/revoke", {}).json() == revoked
    assert post(client, f"/api/backends/{identifier}/check", {"consent": True}).status_code == 409
    assert client.get(f"/api/backends/{identifier}/conversations").status_code == 409
    assert client.get(f"/api/backends/{identifier}/health").json()["status"] == "revoked"
    assert requests == []


def test_revocation_while_check_is_inflight_cannot_restore_reachability(fixture):
    _, provider, settings = fixture
    app = None

    class RevokeDuringCheck:
        async def check_health(self, connection):
            app.state.store.revoke_backend(connection.id)
            await asyncio.sleep(0)
            return BackendHealth("reachable", "openmausbot", True)

    app = create_app(settings, provider, RevokeDuringCheck())
    with TestClient(app) as client:
        connection = configure(client)
        checked = post(client, f"/api/backends/{connection['id']}/check", {"consent": True}).json()
        assert checked["status"] == "revoked"
        saved = app.state.store.get("backend_connections", connection["id"])
        assert saved["status"] == "revoked"
        assert saved["test_status"] is None


@pytest.mark.parametrize("endpoint", [
    "http://localhost:8000", "https://example.com", "http://192.168.1.1:8000",
    "http://169.254.169.254", "http://127.0.0.1:0", "http://127.0.0.1:bad",
    "http://127.0.0.1:8000/api", "http://user:password@127.0.0.1:8000",
    "http://127.0.0.1:8000?token=secret", "http://127.0.0.1:8000/#secret",
    "http://127.0.0.1\\@example.com", "http://127.0.0.1:\n8000",
])
def test_endpoint_restrictions_prevent_unreviewed_origins(connected_fixture, endpoint):
    client, _, provider, _, requests = connected_fixture
    result = post(client, "/api/backends", {"name": "Bad", "endpoint": endpoint})
    assert result.status_code == 422
    assert client.get("/api/backends").json()["connections"] == []
    assert requests == provider.requests == []


@pytest.mark.parametrize("extra", [
    {"settings": {"conversations_path": "https://other.example"}},
    {"token": "raw-secret"}, {"status": "connected"}, {"kind": "unknown"},
])
def test_browser_cannot_inject_credentials_paths_status_or_adapter(connected_fixture, extra):
    client, _, _, _, requests = connected_fixture
    response = post(client, "/api/backends", {
        "name": "Rejected", "endpoint": "http://127.0.0.1:8000", **extra,
    })
    assert response.status_code == 422
    assert requests == []


def test_ipv6_loopback_configuration_never_connects(connected_fixture):
    client, _, _, _, requests = connected_fixture
    response = post(client, "/api/backends", {"name": "IPv6", "endpoint": "http://[::1]:8000/"})
    assert response.status_code == 201
    assert response.json()["endpoint"] == "http://[::1]:8000"
    assert requests == []


@pytest.mark.parametrize("response_status,payload,expected", [
    (401, {}, "backend_auth_required"), (403, {}, "backend_access_denied"),
    (503, {}, "backend_http_503"), (200, {"app": "other"}, "backend_not_openmausbot"),
    (200, {"app": "openmausbot", "static": "yes"}, "backend_schema_invalid"),
])
def test_check_error_is_safe_and_persisted(fixture, response_status, payload, expected):
    _, provider, settings = fixture

    def handler(request):
        return httpx.Response(response_status, json={**payload, "secret": "PRIVATE_UPSTREAM_BODY"})

    transport = httpx.AsyncClient(
        base_url="http://127.0.0.1:8000", transport=httpx.MockTransport(handler),
    )
    with TestClient(create_app(settings, provider, OpenMausBotNativeReadAdapter(transport))) as client:
        connection = configure(client)
        response = post(client, f"/api/backends/{connection['id']}/check", {"consent": True})
        assert response.status_code == 200
        assert response.json()["status"] == expected
        assert "PRIVATE_UPSTREAM_BODY" not in response.text
        assert response.json()["authentication"] == "unverified"
        assert client.get("/api/backends").json()["connections"][0]["test_status"] == expected
        assert provider.requests == []
    asyncio.run(transport.aclose())


@pytest.mark.parametrize("kind,expected", [
    ("redirect", "backend_redirect_denied"), ("timeout", "backend_timeout"),
    ("disconnect", "backend_unreachable"), ("oversized", "backend_response_too_large"),
    ("invalid", "backend_schema_invalid"),
])
def test_health_faults_never_retry_or_disclose_response(fixture, kind, expected):
    _, provider, settings = fixture
    requests = []

    def handler(request):
        requests.append(request)
        if kind == "timeout":
            raise httpx.ReadTimeout("PRIVATE_UPSTREAM_BODY")
        if kind == "disconnect":
            raise httpx.ConnectError("PRIVATE_UPSTREAM_BODY")
        if kind == "oversized":
            return httpx.Response(200, content=b"x" * 65537)
        if kind == "invalid":
            return httpx.Response(200, content=b"PRIVATE_UPSTREAM_BODY")
        return httpx.Response(302, headers={"Location": "https://external.example"})

    transport = httpx.AsyncClient(
        base_url="http://127.0.0.1:8000", transport=httpx.MockTransport(handler), follow_redirects=True,
    )
    with TestClient(create_app(settings, provider, OpenMausBotNativeReadAdapter(transport))) as client:
        connection = configure(client)
        response = post(client, f"/api/backends/{connection['id']}/check", {"consent": True})
        assert response.json()["status"] == expected
        assert len(requests) == 1
        assert "PRIVATE_UPSTREAM_BODY" not in response.text
    asyncio.run(transport.aclose())


def test_configuration_and_check_survive_app_recreation_without_network(fixture):
    _, provider, settings = fixture
    app = create_app(settings, provider)
    with TestClient(app) as client:
        connection = configure(client)
        app.state.store.record_backend_check(connection["id"], "reachable")
    fresh_provider = FakeProvider()
    with TestClient(create_app(settings, fresh_provider)) as client:
        health = client.get(f"/api/backends/{connection['id']}/health").json()
        assert health["status"] == "reachable"
        assert health["tested_at"]
        assert fresh_provider.requests == []


def test_backend_routes_keep_auth_and_request_boundary(fixture):
    _, provider, settings = fixture
    settings.access_token = "t" * 40
    with TestClient(create_app(settings, provider)) as client:
        assert client.get("/api/backends").status_code == 401
        assert post(client, "/api/auth", {"token": settings.access_token}).status_code == 200
        assert client.post("/api/backends", json={
            "name": "No header", "endpoint": "http://127.0.0.1:8000",
        }).status_code == 403
        assert client.get("/api/backends/missing/health").status_code == 404
        assert provider.requests == []


def test_legacy_stored_endpoint_is_revalidated_before_check(fixture):
    _, provider, settings = fixture

    class NoCheckAllowed:
        async def check_health(self, connection):
            raise AssertionError("Unsafe endpoint was contacted")

    app = create_app(settings, provider, NoCheckAllowed())
    with TestClient(app) as client:
        row = app.state.store.add_backend({
            "name": "Legacy", "kind": "openmausbot", "endpoint": "https://external.example",
            "status": "configured",
        })
        response = post(client, f"/api/backends/{row['id']}/check", {"consent": True})
        assert response.status_code == 409
        assert response.json()["detail"] == "backend_endpoint_invalid"


def test_health_absolute_deadline_bounds_slow_stream(fixture, monkeypatch):
    _, provider, settings = fixture

    class SlowStream(httpx.AsyncByteStream):
        async def __aiter__(self):
            while True:
                await asyncio.sleep(0.01)
                yield b" "

    timeout = asyncio.timeout
    monkeypatch.setattr(backend_module.asyncio, "timeout", lambda seconds: timeout(0.05))
    transport = httpx.AsyncClient(
        base_url="http://127.0.0.1:8000",
        transport=httpx.MockTransport(lambda request: httpx.Response(200, stream=SlowStream())),
    )
    with TestClient(create_app(settings, provider, OpenMausBotNativeReadAdapter(transport))) as client:
        connection = configure(client)
        response = post(client, f"/api/backends/{connection['id']}/check", {"consent": True})
        assert response.json()["status"] == "backend_timeout"
    asyncio.run(transport.aclose())
