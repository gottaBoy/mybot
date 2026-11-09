import copy

import pytest
from fastapi.testclient import TestClient

from test_workbench import FakeProvider, fixture, post, run_body, seed, wait_status
from workbench.app import create_app
from workbench.provider import ProviderError


@pytest.fixture
def failed_source(fixture):
    app, provider, settings = fixture
    original = provider.complete
    failed = False

    async def fail_once(model, messages, max_tokens):
        nonlocal failed
        result = await original(model, messages, max_tokens)
        if not failed and "你的子任务：设计尚待" in messages[-1]["content"]:
            failed = True
            raise ProviderError("provider_timeout_outcome_unknown")
        return result

    provider.complete = fail_once
    with TestClient(app) as client:
        _, model, task = seed(client)
        source = post(client, f"/api/tasks/{task['id']}/runs", run_body(
            model, max_calls=4, parallel=1,
        )).json()
        source = wait_status(client, source["id"], {"failed"})
        assert len(source["calls"]) == 3
        assert len(source["artifacts"]) == 1
        yield client, app, provider, settings, model, source


def retry_body(client, model, source_id, **overrides):
    preview = client.get(f"/api/runs/{source_id}/retry-preview").json()
    return {
        "coordinator_model": model["id"], "researcher_model": model["id"],
        "reviewer_model": model["id"], "max_calls": preview["minimum_calls"],
        "parallel": 1, "minutes": 10, "max_output_tokens": 2048,
        "call_timeout_seconds": 180, "consent": True, "acknowledge_replay": True,
        "snapshot_hash": preview["snapshot_hash"], "request_id": "retry-request-123",
        **overrides,
    }


def test_retry_preview_has_no_side_effects_and_reserves_synthesis(failed_source):
    client, _, provider, _, _, source = failed_source
    count = len(provider.requests)
    preview = client.get(f"/api/runs/{source['run']['id']}/retry-preview").json()
    assert preview["allowed"] is True
    assert preview["minimum_calls"] == preview["defaults"]["max_calls"] == 2
    assert preview["reuse_step_keys"] == ["plan", "research-0"]
    assert preview["requires_acknowledgement"] is True
    assert [step["action"] for step in preview["steps"]] == ["reuse", "reuse", "retry", "retry"]
    assert len(provider.requests) == count
    assert len(client.get("/api/bootstrap").json()["runs"]) == 1


def test_retry_reallocates_models_reuses_success_and_preserves_source(failed_source):
    client, app, provider, _, model, source = failed_source
    source_id = source["run"]["id"]
    before = copy.deepcopy(client.get(f"/api/runs/{source_id}").json())
    research = post(client, "/api/models", {
        "name": "Retry research", "endpoint": "http://127.0.0.1:9999/v1", "model": "research-retry",
    }).json()
    review = post(client, "/api/models", {
        "name": "Retry review", "endpoint": "http://127.0.0.1:9999/v1", "model": "review-retry",
    }).json()
    captured = []
    original = provider.complete

    async def capture(model, messages, max_tokens):
        captured.append((model["_timeout_seconds"], max_tokens))
        return await original(model, messages, max_tokens)

    provider.complete = capture
    body = retry_body(client, model, source_id,
                      researcher_model=research["id"], reviewer_model=review["id"])
    response = post(client, f"/api/runs/{source_id}/retry", body)
    assert response.status_code == 201, response.text
    result = wait_status(client, response.json()["id"], {"succeeded", "failed"})
    assert result["run"]["status"] == "succeeded", result
    assert result["run"]["source_run_id"] == source_id
    assert len(result["calls"]) == 2
    assert [name for name, _ in provider.requests][-2:] == ["research-retry", "review-retry"]
    assert captured == [(180, 2048), (180, 2048)]
    reused = [agent for agent in result["agents"] if agent["source_agent_id"]]
    assert len(reused) == 2
    assert all(agent["started_at"] is None and agent["ended_at"] is None for agent in reused)
    assert len(result["artifacts"]) == 3
    inherited = next(artifact for artifact in result["artifacts"] if artifact["source_artifact_id"])
    assert inherited["source_artifact_id"] == source["artifacts"][0]["id"]
    assert inherited["content"] == source["artifacts"][0]["content"]
    assert len([event for event in result["events"] if event["kind"] == "agent.reused"]) == 2
    assert sum(call["input_tokens"] for call in result["calls"]) == 40
    after = client.get(f"/api/runs/{source_id}").json()
    for key in ("run", "agents", "calls", "artifacts", "events"):
        assert after[key] == before[key]
    assert after["retry_runs"][0]["id"] == result["run"]["id"]
    assert app.state.store.get("runs", source_id)["config"]["max_calls"] == 4


@pytest.mark.parametrize("override,expected", [
    ({"consent": False}, "retry_send_confirmation_required"),
    ({"acknowledge_replay": False}, "retry_replay_confirmation_required"),
    ({"max_calls": 1}, "retry_budget_insufficient"),
    ({"snapshot_hash": "0" * 64}, "retry_snapshot_changed"),
])
def test_retry_requires_consent_ack_snapshot_and_sufficient_budget(failed_source, override, expected):
    client, _, provider, _, model, source = failed_source
    source_id = source["run"]["id"]
    count = len(provider.requests)
    response = post(client, f"/api/runs/{source_id}/retry", retry_body(client, model, source_id, **override))
    assert response.status_code in {409, 422}
    assert response.json()["detail"] == expected
    assert len(provider.requests) == count
    assert len(client.get("/api/bootstrap").json()["runs"]) == 1


def test_retry_snapshot_rejects_changed_review(failed_source):
    client, _, provider, _, model, source = failed_source
    source_id = source["run"]["id"]
    body = retry_body(client, model, source_id)
    count = len(provider.requests)
    post(client, f"/api/artifacts/{source['artifacts'][0]['id']}/decision", {"decision": "accepted"})
    response = post(client, f"/api/runs/{source_id}/retry", body)
    assert response.status_code == 409
    assert response.json()["detail"] == "retry_snapshot_changed"
    assert len(provider.requests) == count


def test_retry_uses_original_file_snapshot_not_changed_files(failed_source):
    client, _, provider, settings, model, source = failed_source
    source_id = source["run"]["id"]
    (settings.workspace / "README.md").write_text("New text not confirmed for retry")
    response = post(client, f"/api/runs/{source_id}/retry", retry_body(client, model, source_id))
    assert response.status_code == 201
    result = wait_status(client, response.json()["id"], {"succeeded", "failed"})
    assert result["run"]["status"] == "succeeded"
    assert result["run"]["context"]["text"] == source["run"]["context"]["text"]
    assert all("New text not confirmed" not in str(messages) for _, messages in provider.requests)


def test_retry_idempotent_submission_and_conflicts(failed_source):
    client, _, provider, _, model, source = failed_source
    source_id = source["run"]["id"]
    body = retry_body(client, model, source_id)
    first = post(client, f"/api/runs/{source_id}/retry", body)
    assert first.status_code == 201
    wait_status(client, first.json()["id"], {"succeeded"})
    count = len(provider.requests)
    second = post(client, f"/api/runs/{source_id}/retry", body)
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert len(provider.requests) == count
    conflict = post(client, f"/api/runs/{source_id}/retry", {**body, "max_calls": 3})
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "retry_request_id_conflict"


def test_retry_blocks_other_active_run_and_legacy_parent_resume(failed_source):
    client, _, provider, _, model, source = failed_source
    source_id = source["run"]["id"]
    provider.delay = 0.8
    body = retry_body(client, model, source_id)
    response = post(client, f"/api/runs/{source_id}/retry", body)
    assert response.status_code == 201
    other = post(client, f"/api/runs/{source_id}/retry", {**body, "request_id": "retry-request-456"})
    assert other.status_code == 409
    assert other.json()["detail"] == "retry_other_run_active"
    legacy = post(client, f"/api/runs/{source_id}/resume", {"acknowledge_replay": True})
    assert legacy.status_code == 409
    assert legacy.json()["detail"] == "retry_source_has_child"
    post(client, f"/api/runs/{response.json()['id']}/cancel", {})


def test_retry_missing_key_and_completed_role_model_change_rejected(failed_source, monkeypatch):
    client, _, provider, _, model, source = failed_source
    source_id = source["run"]["id"]
    monkeypatch.delenv("WORKBENCH_MODEL_RETRY_KEY", raising=False)
    remote = post(client, "/api/models", {
        "name": "Unavailable retry", "endpoint": "https://model.example/v1",
        "model": "unavailable", "key_env": "WORKBENCH_MODEL_RETRY_KEY",
    }).json()
    body = retry_body(client, model, source_id)
    count = len(provider.requests)
    response = post(client, f"/api/runs/{source_id}/retry", {**body, "researcher_model": remote["id"]})
    assert response.status_code == 422
    assert response.json()["detail"] == "missing_api_key"
    response = post(client, f"/api/runs/{source_id}/retry", {**body, "coordinator_model": remote["id"]})
    assert response.status_code == 422
    assert response.json()["detail"] == "retry_completed_role_model_locked"
    assert len(provider.requests) == count


@pytest.mark.parametrize("resource,value", [
    ("max_calls", 0), ("max_calls", 9), ("parallel", 3),
    ("call_timeout_seconds", 301), ("minutes", 31), ("max_output_tokens", 4097),
])
def test_retry_resource_limits_are_enforced(failed_source, resource, value):
    client, _, _, _, model, source = failed_source
    source_id = source["run"]["id"]
    response = post(client, f"/api/runs/{source_id}/retry",
                    retry_body(client, model, source_id, **{resource: value}))
    assert response.status_code == 422


def test_retry_synthesis_only_needs_one_new_call(fixture):
    app, provider, _ = fixture
    original = provider.complete
    failed = False

    async def fail_review_once(model, messages, max_tokens):
        nonlocal failed
        if not failed and "以下是其他 Agent 的分析" in messages[-1]["content"]:
            failed = True
            raise ProviderError("review_failed")
        return await original(model, messages, max_tokens)

    provider.complete = fail_review_once
    with TestClient(app) as client:
        _, model, task = seed(client)
        source = post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).json()
        wait_status(client, source["id"], {"failed"})
        body = retry_body(client, model, source["id"])
        assert body["max_calls"] == 1
        response = post(client, f"/api/runs/{source['id']}/retry", body)
        assert response.status_code == 201
        result = wait_status(client, response.json()["id"], {"succeeded", "failed"})
        assert result["run"]["status"] == "succeeded", result
        assert len(result["calls"]) == 1
        assert len(result["artifacts"]) == 3


def test_invalid_planner_output_is_not_reused(fixture):
    app, provider, _ = fixture
    provider.invalid = True
    with TestClient(app) as client:
        _, model, task = seed(client)
        source = post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).json()
        wait_status(client, source["id"], {"failed"})
        body = retry_body(client, model, source["id"])
        assert body["max_calls"] == 3
        provider.invalid = False
        response = post(client, f"/api/runs/{source['id']}/retry", body)
        assert response.status_code == 201
        result = wait_status(client, response.json()["id"], {"succeeded", "failed"})
        assert result["run"]["status"] == "succeeded", result
        assert len(result["calls"]) == 3
        assert not any(agent["source_agent_id"] for agent in result["agents"])
        assert len(result["run"]["plan"]) == 1


def test_paused_source_can_allocate_resources_without_two_execution_authorities(fixture):
    app, provider, _ = fixture
    provider.delay = 0.15
    with TestClient(app) as client:
        _, model, task = seed(client)
        source = post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).json()
        wait_status(client, source["id"], {"running"})
        post(client, f"/api/runs/{source['id']}/pause", {})
        wait_status(client, source["id"], {"paused"})
        response = post(client, f"/api/runs/{source['id']}/retry", retry_body(client, model, source["id"]))
        assert response.status_code == 201, response.text
        assert post(client, f"/api/runs/{source['id']}/resume", {}).status_code == 409
        result = wait_status(client, response.json()["id"], {"succeeded", "failed"})
        assert result["run"]["status"] == "succeeded", result
        assert client.get(f"/api/runs/{source['id']}").json()["run"]["status"] == "paused"
        # The preserved paused ancestor is no longer an execution authority.
        fresh = post(client, f"/api/tasks/{task['id']}/runs", run_body(model, request_id="fresh-after-retry"))
        assert fresh.status_code == 201


def test_retry_rejects_running_and_completed_source(fixture):
    app, provider, _ = fixture
    provider.delay = 0.05
    with TestClient(app) as client:
        _, model, task = seed(client)
        source = post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).json()
        wait_status(client, source["id"], {"running"})
        response = post(client, f"/api/runs/{source['id']}/retry", retry_body(client, model, source["id"]))
        assert response.status_code == 409
        assert response.json()["detail"] == "retry_source_not_ready"
        wait_status(client, source["id"], {"succeeded"})
        preview = client.get(f"/api/runs/{source['id']}/retry-preview").json()
        assert preview["allowed"] is False
        assert preview["minimum_calls"] == 0


def test_repeated_explicit_retry_preserves_each_attempt_without_auto_replay(failed_source):
    client, _, provider, _, model, source = failed_source
    source_id = source["run"]["id"]
    provider.fail = True
    first = post(client, f"/api/runs/{source_id}/retry", retry_body(client, model, source_id)).json()
    failed = wait_status(client, first["id"], {"failed"})
    assert len(failed["calls"]) == 1
    provider.fail = False
    second = post(client, f"/api/runs/{first['id']}/retry", retry_body(
        client, model, first["id"], request_id="second-explicit-retry",
    ))
    assert second.status_code == 201
    result = wait_status(client, second.json()["id"], {"succeeded", "failed"})
    assert result["run"]["status"] == "succeeded"
    assert len(result["calls"]) == 2
    assert result["run"]["source_run_id"] == first["id"]
    assert len(client.get(f"/api/runs/{source_id}").json()["calls"]) == 3
    assert len(client.get(f"/api/runs/{first['id']}").json()["calls"]) == 1
    assert len(provider.requests) == 6


def test_retry_lineage_survives_service_recreation(fixture):
    app, provider, settings = fixture
    provider.fail = True
    with TestClient(app) as client:
        _, model, task = seed(client)
        source = post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).json()
        wait_status(client, source["id"], {"failed"})
        provider.fail = False
        retried = post(client, f"/api/runs/{source['id']}/retry", retry_body(client, model, source["id"])).json()
        wait_status(client, retried["id"], {"succeeded"})
    fresh_provider = FakeProvider()
    with TestClient(create_app(settings, fresh_provider)) as client:
        child = client.get(f"/api/runs/{retried['id']}").json()
        assert child["run"]["source_run_id"] == source["id"]
        assert client.get(f"/api/runs/{source['id']}").json()["retry_runs"][0]["id"] == retried["id"]
        assert fresh_provider.requests == []
