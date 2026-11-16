import asyncio
import json
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from workbench.app import create_app
from workbench.model_test_service import ModelTestService
from workbench.provider import ProviderError
from workbench.store import Store
from test_workbench import FakeProvider, fixture, post


def model(client, name="Connection"):
    return post(client, "/api/models", {
        "name": name, "endpoint": "http://127.0.0.1:9999/v1", "model": "fixture-only",
    }).json()


def model_test_body(request_id="connection-request-123", **overrides):
    return {"request_id": request_id, "consent": True, **overrides}


@pytest.mark.parametrize("body", [
    {}, {"consent": True}, {"request_id": "connection-request-123"},
    model_test_body(consent=False), model_test_body(request_id="short"),
    model_test_body(request_id="bad/request-id"), model_test_body(extra="not-supported"),
])
def test_confirmation_and_valid_request_id_are_required_without_provider_call(fixture, body):
    app, provider, _ = fixture
    with TestClient(app) as client:
        configured = model(client)
        response = post(client, f"/api/models/{configured['id']}/test", body)
        assert response.status_code == 422
        assert provider.requests == []
        with app.state.store.transaction() as db:
            assert db.execute("SELECT COUNT(*) FROM model_tests").fetchone()[0] == 0


def test_completed_request_and_get_reconciliation_never_repeat_provider(fixture):
    app, provider, _ = fixture
    with TestClient(app) as client:
        configured = model(client)
        assert configured["latest_test"] is None
        path = f"/api/models/{configured['id']}/test"
        first = post(client, path, model_test_body()).json()
        assert first["state"] == "succeeded"
        assert first["status"] == "reachable"
        assert first["usage_unknown"] is False
        assert (first["input_tokens"], first["output_tokens"]) == (20, 10)
        assert first["outcome_unknown"] is False
        assert post(client, path, model_test_body()).json() == first
        events_before = None
        with app.state.store.transaction() as db:
            events_before = db.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        for _ in range(3):
            assert client.get(
                f"/api/models/{configured['id']}/tests/{first['request_id']}",
            ).json() == first
        with app.state.store.transaction() as db:
            assert db.execute("SELECT COUNT(*) FROM events").fetchone()[0] == events_before
        assert len(provider.requests) == 1
        refreshed = client.get("/api/bootstrap").json()["models"][0]
        assert refreshed["latest_test"] == first
        assert len(provider.requests) == 1


def test_running_duplicate_returns_durable_state_without_parallel_provider_call(fixture):
    app, provider, _ = fixture
    started, release = threading.Event(), threading.Event()
    original = provider.complete

    async def waiting(*args):
        started.set()
        while not release.is_set():
            await asyncio.sleep(0.005)
        return await original(*args)

    provider.complete = waiting
    with TestClient(app) as client:
        configured = model(client)
        path = f"/api/models/{configured['id']}/test"
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(post, client, path, model_test_body())
            try:
                assert started.wait(timeout=2)
                duplicate = post(client, path, model_test_body()).json()
                assert duplicate["state"] == duplicate["status"] == "running"
                assert duplicate["usage_unknown"] is True
                assert duplicate["ended_at"] is None
                assert client.get(
                    f"/api/models/{configured['id']}/tests/{duplicate['request_id']}",
                ).json() == duplicate
            finally:
                release.set()
            assert future.result(timeout=3).json()["state"] == "succeeded"
        assert len(provider.requests) == 1


def test_request_id_cannot_be_reused_for_another_model_or_changed_candidate(fixture):
    app, provider, _ = fixture
    with TestClient(app) as client:
        first, other = model(client), model(client, "Other connection")
        post(client, f"/api/models/{first['id']}/test", model_test_body())
        response = post(client, f"/api/models/{other['id']}/test", model_test_body())
        assert response.status_code == 409
        assert response.json()["detail"] == "model_test_request_id_conflict"
        assert client.get(
            f"/api/models/{other['id']}/tests/connection-request-123",
        ).status_code == 409
        with app.state.store.transaction() as db:
            db.execute("UPDATE models SET model='changed-candidate' WHERE id=?", (first["id"],))
        response = post(client, f"/api/models/{first['id']}/test", model_test_body())
        assert response.status_code == 409
        assert len(provider.requests) == 1


@pytest.mark.parametrize("code,state", [
    ("provider_http_503", "failed"),
    ("missing_api_key", "failed"),
    ("provider_timeout_outcome_unknown", "unknown"),
    ("codex_cli_timeout_outcome_unknown", "unknown"),
    ("provider_connection_error", "unknown"),
])
def test_failure_outcome_and_usage_unknown_are_distinct_and_persisted(fixture, code, state):
    app, provider, _ = fixture
    attempts = []

    async def fail(*args):
        attempts.append(1)
        raise ProviderError(code, detail={"raw_body": "secret-provider-body"})

    provider.complete = fail
    with TestClient(app) as client:
        configured = model(client)
        first = post(client, f"/api/models/{configured['id']}/test", model_test_body()).json()
        assert first["state"] == state
        assert first["status"] == code
        assert first["outcome_unknown"] is (state == "unknown")
        assert first["usage_unknown"] is True
        assert first["input_tokens"] is first["output_tokens"] is None
        assert post(client, f"/api/models/{configured['id']}/test", model_test_body()).json() == first
        assert attempts == [1]
        assert "secret-provider-body" not in json.dumps(first)


@pytest.mark.parametrize("error", [
    RuntimeError("private-secret-value"),
    ProviderError("private-secret-value", detail={"key": "private-secret-value"}),
])
def test_arbitrary_errors_are_redacted_and_provider_output_is_never_stored(fixture, error):
    app, provider, _ = fixture

    async def fail(*args):
        raise error

    provider.complete = fail
    with TestClient(app) as client:
        configured = model(client)
        result = post(client, f"/api/models/{configured['id']}/test", model_test_body()).json()
        assert result["state"] == "unknown"
        assert result["status"] == "model_test_execution_outcome_unknown"
        with app.state.store.transaction() as db:
            records = [dict(row) for row in db.execute("SELECT * FROM model_tests")]
            events = [dict(row) for row in db.execute("SELECT * FROM events")]
        assert "private-secret-value" not in json.dumps([result, records, events])


def test_success_keeps_real_zero_usage_but_discards_output_diagnostics_and_keys(fixture, monkeypatch):
    app, provider, _ = fixture
    monkeypatch.setenv("WORKBENCH_MODEL_PRIVATE_KEY", "private-secret-value")

    async def complete(*args):
        return {
            "text": "private-provider-output", "input_tokens": 0, "output_tokens": 0,
            "truncated": False, "diagnostics": {"raw": "private-secret-value"},
        }

    provider.complete = complete
    with TestClient(app) as client:
        configured = post(client, "/api/models", {
            "name": "Private", "endpoint": "https://model.example/v1",
            "model": "fixture-only", "key_env": "WORKBENCH_MODEL_PRIVATE_KEY",
        }).json()
        result = post(client, f"/api/models/{configured['id']}/test", model_test_body()).json()
        assert result["state"] == "succeeded"
        assert result["input_tokens"] == result["output_tokens"] == 0
        assert result["usage_unknown"] is False
        with app.state.store.transaction() as db:
            records = [dict(row) for row in db.execute("SELECT * FROM model_tests")]
            events = [dict(row) for row in db.execute("SELECT * FROM events")]
        serialized = json.dumps([result, records, events])
        assert "private-secret-value" not in serialized
        assert "private-provider-output" not in serialized
        assert "WORKBENCH_MODEL_PRIVATE_KEY" not in serialized


def test_restart_marks_running_unknown_without_replay_and_preserves_finished_tests(fixture):
    app, provider, settings = fixture
    with TestClient(app) as client:
        configured = model(client)
        finished = post(client, f"/api/models/{configured['id']}/test", model_test_body()).json()
        record, claimed, _ = app.state.store.claim_model_test(
            configured["id"], "interrupted-test-request",
        )
        assert record["state"] == "running" and claimed
    replacement = FakeProvider()
    restarted = create_app(settings, replacement)
    with TestClient(restarted) as client:
        unknown = client.get(
            f"/api/models/{configured['id']}/tests/interrupted-test-request",
        ).json()
        assert unknown["state"] == "unknown"
        assert unknown["status"] == "model_test_interrupted_outcome_unknown"
        assert unknown["outcome_unknown"] is unknown["usage_unknown"] is True
        refreshed = client.get("/api/bootstrap").json()["models"][0]
        assert refreshed["latest_test"] == unknown
        assert refreshed["latest_test"]["request_id"] == "interrupted-test-request"
        assert post(client, f"/api/models/{configured['id']}/test",
                    model_test_body("interrupted-test-request")).json() == unknown
        assert client.get(
            f"/api/models/{configured['id']}/tests/{finished['request_id']}",
        ).json() == finished
        assert replacement.requests == []
        assert len(provider.requests) == 1


def test_cancellation_records_unknown_and_late_completion_cannot_replace_it(tmp_path):
    store = Store(tmp_path / "data")
    configured = store.add("models", {
        "name": "Fixture", "endpoint": "http://127.0.0.1:9999/v1",
        "model": "fixture", "key_env": "", "kind": "chat_completions",
    }, "model.configured")
    calls = []

    async def scenario():
        started = asyncio.Event()

        class WaitingProvider:
            async def complete(self, *args):
                calls.append(1)
                started.set()
                await asyncio.Event().wait()

        service = ModelTestService(store, WaitingProvider(), tmp_path)
        task = asyncio.create_task(service.start(configured["id"], "canceled-test-request"))
        await started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        result = service.read(configured["id"], "canceled-test-request")
        assert result["state"] == "unknown"
        assert result["usage_unknown"] is True
        assert await service.start(configured["id"], "canceled-test-request") == result
        late = store.finish_model_test(
            configured["id"], "canceled-test-request", "succeeded", "reachable", 1, 1,
        )
        assert late["state"] == "unknown"

    asyncio.run(scenario())
    assert calls == [1]


def test_status_read_for_unregistered_request_is_missing_without_provider_call(fixture):
    app, provider, _ = fixture
    with TestClient(app) as client:
        configured = model(client)
        response = client.get(f"/api/models/{configured['id']}/tests/missing-request")
        assert response.status_code == 404
        assert provider.requests == []
