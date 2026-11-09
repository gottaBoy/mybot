import asyncio
import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from workbench.app import create_app
from workbench.config import Settings
from workbench.context import ContextError, snapshot, validate_directory
from workbench.engine import Engine, parse_plan
from workbench.provider import ProviderError
from workbench.schemas import ModelCreate, ProjectCreate
from workbench.store import Store


HEADERS = {"X-Workbench-Request": "1"}


class FakeProvider:
    """Test fixture only. Not selectable from the production UI."""
    def __init__(self, delay=0.01, fail=False, invalid=False):
        self.requests = []
        self.delay = delay
        self.fail = fail
        self.invalid = invalid

    async def complete(self, model, messages, max_tokens):
        self.requests.append((model["model"], messages))
        await asyncio.sleep(self.delay)
        if self.fail:
            raise ProviderError("test_provider_failure")
        text = '{"tasks":[{"title":"分析边界","objective":"检查提供资料中的实现约束与风险"},{"title":"设计验证","objective":"设计尚待执行的验证条件与测试建议"}]}' if "仅返回 JSON" in messages[-1]["content"] else "这是测试输出；没有执行任何测试。\n待验证：需要人工确认。"
        if self.invalid:
            text = "Not JSON"
        return {"text": text, "model": model["model"], "input_tokens": 20, "output_tokens": 10, "truncated": False}


@pytest.fixture
def fixture(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "README.md").write_text("# Example\nSource context.", encoding="utf-8")
    settings = Settings(tmp_path / "data", workspace, poll_interval=0.01)
    provider = FakeProvider()
    app = create_app(settings, provider)
    return app, provider, settings


def post(client, path, body):
    return client.post(path, json=body, headers=HEADERS)


def seed(client):
    project = post(client, "/api/projects", {"name": "Test", "directory": ".", "notes": "Allowed notes"}).json()
    model = post(client, "/api/models", {"name": "Test model", "endpoint": "http://127.0.0.1:9999/v1", "model": "fake-test"}).json()
    task = post(client, "/api/tasks", {"project_id": project["id"], "title": "Research",
                                    "goal": "分析提供资料的实现边界与风险", "files": ["README.md"]}).json()
    model["context_hash"] = post(client, f"/api/tasks/{task['id']}/preview", {}).json()["context_hash"]
    return project, model, task


def run_body(model, **override):
    return {"coordinator_model": model["id"], "researcher_model": model["id"],
            "reviewer_model": model["id"], "consent": True, "request_id": "request-test-123",
            "context_hash": model["context_hash"], **override}


def wait_status(client, identifier, statuses):
    for _ in range(300):
        value = client.get(f"/api/runs/{identifier}").json()
        if value["run"]["status"] in statuses:
            return value
        time.sleep(0.01)
    raise AssertionError(value)


def test_real_closed_loop_and_audit(fixture):
    app, provider, _ = fixture
    with TestClient(app) as client:
        project, model, task = seed(client)
        preview = post(client, f"/api/tasks/{task['id']}/preview", {}).json()
        assert "Source context" in preview["text"]
        run = post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).json()
        value = wait_status(client, run["id"], {"succeeded", "failed"})
        assert value["run"]["status"] == "succeeded", value
        assert value["harness"]["id"] == "local-superagent"
        assert value["harness"]["parallel_limit"] == 2
        assert [stage["key"] for stage in value["harness"]["stages"]] == [
            "planning", "research", "synthesis",
        ]
        assert all(stage["status"] == "succeeded" for stage in value["harness"]["stages"])
        assert len(value["agents"]) == 4
        assert len(provider.requests) == len(value["calls"]) == 4
        assert all(c["status"] == "succeeded" for c in value["calls"])
        assert sum(c["input_tokens"] for c in value["calls"]) == 80
        assert len(value["artifacts"]) == 3
        assert len({e["seq"] for e in value["events"]}) == len(value["events"])
        assert client.get(f"/api/runs/{run['id']}/events?after={value['events'][-1]['seq']}").json() == {"events": []}
        artifact = next(a for a in value["artifacts"] if a["kind"] == "report")
        reviewed = post(client, f"/api/artifacts/{artifact['id']}/decision", {"decision": "accepted"}).json()
        assert reviewed["decision"] == "accepted"
        assert app.state.store.get("projects", project["id"])["name"] == "Test"


def test_no_provider_call_without_explicit_consent(fixture):
    app, provider, _ = fixture
    with TestClient(app) as client:
        _, model, task = seed(client)
        response = post(client, f"/api/tasks/{task['id']}/runs", run_body(model, consent=False))
        assert response.status_code == 422
        assert provider.requests == []


def test_idempotent_submission_and_conflict(fixture):
    app, _, _ = fixture
    with TestClient(app) as client:
        _, model, task = seed(client)
        first = post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).json()
        second = post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).json()
        assert first["id"] == second["id"]
        assert post(client, f"/api/tasks/{task['id']}/runs", run_body(model, max_calls=5)).status_code == 409


def test_request_id_cannot_be_reused_with_different_confirmed_context(fixture):
    app, _, settings = fixture
    with TestClient(app) as client:
        _, model, task = seed(client)
        post(client, f"/api/tasks/{task['id']}/runs", run_body(model))
        (settings.workspace / "README.md").write_text("New explicit input")
        new_hash = post(client, f"/api/tasks/{task['id']}/preview", {}).json()["context_hash"]
        assert post(client, f"/api/tasks/{task['id']}/runs", run_body(model, context_hash=new_hash)).status_code == 409


def test_budget_limits_plan_and_calls(fixture):
    app, provider, _ = fixture
    with TestClient(app) as client:
        _, model, task = seed(client)
        run = post(client, f"/api/tasks/{task['id']}/runs", run_body(model, max_calls=3)).json()
        value = wait_status(client, run["id"], {"succeeded", "failed"})
        assert value["run"]["status"] == "succeeded"
        assert len(value["run"]["plan"]) == 1
        assert len(provider.requests) == 3


def test_planner_retry_reserves_synthesis_budget(fixture):
    app, provider, _ = fixture
    original = provider.complete
    failed = True

    async def fail_planner_once(model, messages, max_tokens):
        nonlocal failed
        if failed and "仅返回 JSON" in messages[-1]["content"]:
            failed = False
            raise ProviderError("test_planner_retry")
        return await original(model, messages, max_tokens)

    provider.complete = fail_planner_once
    with TestClient(app) as client:
        _, model, task = seed(client)
        run = post(client, f"/api/tasks/{task['id']}/runs", run_body(model, max_calls=4)).json()
        first = wait_status(client, run["id"], {"succeeded", "failed"})
        assert first["run"]["status"] == "failed"
        assert first["run"]["error"] == "test_planner_retry"
        post(client, f"/api/runs/{run['id']}/resume", {"acknowledge_replay": True})
        result = wait_status(client, run["id"], {"succeeded", "failed"})
        assert result["run"]["status"] == "succeeded", result
        assert len(result["calls"]) == 4
        assert len(result["run"]["plan"]) == 1
        assert len(result["artifacts"]) == 2  # research + synthesis
        assert any(event["kind"] == "plan.adjusted" for event in result["events"])


def test_cancel_inflight_preserves_call(fixture):
    app, provider, _ = fixture
    provider.delay = 3
    with TestClient(app) as client:
        _, model, task = seed(client)
        run = post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).json()
        wait_status(client, run["id"], {"running"})
        for _ in range(100):
            if provider.requests:
                break
            time.sleep(0.01)
        assert post(client, f"/api/runs/{run['id']}/cancel", {}).status_code == 200
        value = wait_status(client, run["id"], {"canceled"})
        assert value["calls"][0]["status"] == "canceled"
        assert value["calls"][0]["input_tokens"] is None
        assert value["artifacts"] == []
        assert post(client, f"/api/runs/{run['id']}/cancel", {}).status_code == 200


def test_pause_then_resume_checkpoint(fixture):
    app, provider, _ = fixture
    provider.delay = 0.12
    with TestClient(app) as client:
        _, model, task = seed(client)
        run = post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).json()
        wait_status(client, run["id"], {"running"})
        post(client, f"/api/runs/{run['id']}/pause", {})
        value = wait_status(client, run["id"], {"paused"})
        assert len(value["calls"]) == 1
        assert post(client, f"/api/runs/{run['id']}/resume", {}).status_code == 200
        done = wait_status(client, run["id"], {"succeeded", "failed"})
        assert done["run"]["status"] == "succeeded"
        assert len(done["calls"]) == 4  # completed planner was not replayed


def test_invalid_plan_is_failure_not_fake_success(fixture):
    app, provider, _ = fixture
    provider.invalid = True
    with TestClient(app) as client:
        _, model, task = seed(client)
        run = post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).json()
        value = wait_status(client, run["id"], {"failed"})
        assert value["run"]["error"] == "planner_invalid_json"
        assert not value["artifacts"]
        assert post(client, f"/api/runs/{run['id']}/resume", {}).status_code == 409


def test_restart_marks_interrupted_requires_acknowledgement(fixture):
    app, _, settings = fixture
    with TestClient(app) as client:
        _, model, task = seed(client)
    store = Store(settings.data_dir)
    config = run_body(model)
    config.pop("consent")
    config.pop("request_id")
    config.pop("context_hash")
    run = store.create_run(task["id"], "restart-request", config, {"evidence": []})
    store.claim()
    store.recover()
    assert store.get("runs", run["id"])["status"] == "interrupted"
    with pytest.raises(ValueError):
        store.control(run["id"], "resume")
    assert store.control(run["id"], "resume", True)["status"] == "queued"


def test_csrf_authentication_and_host(fixture, tmp_path):
    _, _, settings = fixture
    settings.access_token = "a" * 40
    app = create_app(settings, FakeProvider())
    with TestClient(app) as client:
        assert client.get("/api/bootstrap").status_code == 401
        assert client.post("/api/auth", json={"token": settings.access_token}).status_code == 403
        assert post(client, "/api/auth", {"token": settings.access_token}).status_code == 200
        cookie = client.cookies.get("workbench_session")
        assert settings.access_token not in cookie
        assert client.get("/api/bootstrap").status_code == 200
        assert client.post("/api/projects", json={"name": "bad"}, headers={**HEADERS, "Origin": "https://attacker.example"}).status_code == 403
        assert client.get("/api/bootstrap", headers={"Host": "attacker.example"}).status_code == 400
        assert post(client, "/api/logout", {}).status_code == 200
        assert client.get("/api/bootstrap").status_code == 401


@pytest.mark.parametrize("name", ["../outside", ".git", ".runtime", "secrets", "file/../hidden"])
def test_reject_context_escape_and_sensitive(fixture, name):
    _, _, settings = fixture
    with pytest.raises((ContextError, ValueError)):
        snapshot(settings.workspace, {"directory": "."}, [name])


def test_reject_symlink_binary_large_and_allow_text(fixture):
    _, _, settings = fixture
    root = settings.workspace
    (root / "linked.md").symlink_to(root / "README.md")
    (root / "binary.txt").write_bytes(b"x\x00y")
    (root / "large.txt").write_bytes(b"a" * 33000)
    for name in ["linked.md", "binary.txt", "large.txt"]:
        with pytest.raises(ContextError):
            snapshot(root, {"directory": "."}, [name])
    text, evidence = snapshot(root, {"directory": "."}, ["README.md"])
    assert "Source context" in text and evidence[0]["path"] == "README.md"


@pytest.mark.parametrize("endpoint", [
    "http://example.com/v1", "https://user:pass@example.com/v1",
    "https://example.com/v1?key=secret", "http://169.254.169.254",
])
def test_reject_unsafe_endpoint(endpoint):
    with pytest.raises(ValidationError):
        ModelCreate(name="Example", endpoint=endpoint, model="example")


def test_raw_keys_are_not_accepted_as_key_names():
    with pytest.raises(ValidationError):
        ModelCreate(name="Model", endpoint="https://example.com/v1", model="test", key_env="sk-secret")


def test_concurrent_worker_process_lock(fixture):
    app, _, settings = fixture
    with TestClient(app):
        second = create_app(settings, FakeProvider())
        with pytest.raises(RuntimeError, match="Another workbench"):
            with TestClient(second):
                pass


def test_context_changed_after_consent_is_rejected(fixture):
    app, provider, settings = fixture
    with TestClient(app) as client:
        _, model, task = seed(client)
        (settings.workspace / "README.md").write_text("New context after preview")
        response = post(client, f"/api/tasks/{task['id']}/runs", run_body(model))
        assert response.status_code == 409
        assert provider.requests == []


def test_persistence_across_service_recreation(fixture):
    app, _, settings = fixture
    with TestClient(app) as client:
        project, model, task = seed(client)
        run = post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).json()
        wait_status(client, run["id"], {"succeeded"})
    provider = FakeProvider()
    with TestClient(create_app(settings, provider)) as client:
        result = client.get(f"/api/runs/{run['id']}").json()
        assert result["project"]["id"] == project["id"]
        assert result["run"]["status"] == "succeeded"
        assert result["artifacts"]
        assert provider.requests == []


def test_provider_failure_records_safe_error_and_no_success(fixture):
    app, provider, _ = fixture
    provider.fail = True
    with TestClient(app) as client:
        _, model, task = seed(client)
        run = post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).json()
        result = wait_status(client, run["id"], {"failed"})
        assert result["calls"][0]["error"] == "test_provider_failure"
        assert result["calls"][0]["input_tokens"] is None
        assert result["run"]["error"] == "test_provider_failure"
        assert result["artifacts"] == []


def test_provider_diagnostics_are_persisted_without_raw_output(fixture):
    app, provider, _ = fixture

    async def fail_with_diagnostics(model, messages, max_tokens):
        raise ProviderError("codex_cli_timeout_outcome_unknown", detail={
            "timeout_seconds": 90, "events": 3, "last_event": "turn_started",
            "partial_message": False,
        })

    provider.complete = fail_with_diagnostics
    with TestClient(app) as client:
        _, model, task = seed(client)
        run = post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).json()
        result = wait_status(client, run["id"], {"failed"})
        assert result["calls"][0]["error_detail"] == {
            "timeout_seconds": 90, "events": 3, "last_event": "turn_started",
            "partial_message": False,
        }
        failed_event = next(event for event in result["events"] if event["kind"] == "model.failed")
        assert failed_event["payload"]["error_detail"]["events"] == 3


def test_request_size_boundary(fixture):
    app, _, _ = fixture
    with TestClient(app) as client:
        response = client.post("/api/projects", content=b"a" * 140000, headers=HEADERS)
        assert response.status_code == 413


def test_missing_key_blocks_run_without_reading_other_env(fixture, monkeypatch):
    app, provider, _ = fixture
    monkeypatch.delenv("WORKBENCH_MODEL_REMOTE_KEY", raising=False)
    with TestClient(app) as client:
        _, model, task = seed(client)
        remote = post(client, "/api/models", {"name": "Remote", "endpoint": "https://example.com/v1",
                                            "model": "test", "key_env": "WORKBENCH_MODEL_REMOTE_KEY"}).json()
        response = post(client, f"/api/tasks/{task['id']}/runs", run_body(model, coordinator_model=remote["id"]))
        assert response.status_code == 422
        assert provider.requests == []


def test_models_are_routed_by_role(fixture):
    app, provider, _ = fixture
    with TestClient(app) as client:
        _, planner, task = seed(client)
        research = post(client, "/api/models", {"name": "Research", "endpoint": "http://127.0.0.1:9999/v1",
                                               "model": "research-model"}).json()
        reviewer = post(client, "/api/models", {"name": "Review", "endpoint": "http://127.0.0.1:9999/v1",
                                               "model": "review-model"}).json()
        run = post(client, f"/api/tasks/{task['id']}/runs", run_body(
            planner, researcher_model=research["id"], reviewer_model=reviewer["id"])).json()
        result = wait_status(client, run["id"], {"succeeded", "failed"})
        assert result["run"]["status"] == "succeeded"
        assert [model for model, _ in provider.requests] == [
            "fake-test", "research-model", "research-model", "review-model",
        ]
        for call in result["calls"]:
            agent = next(agent for agent in result["agents"] if agent["id"] == call["agent_id"])
            assert call["model_id"] == agent["model_id"]


def test_default_model_setting_persists_without_provider_call(fixture):
    app, provider, _ = fixture
    with TestClient(app) as client:
        _, model, _ = seed(client)
        result = post(client, "/api/settings/default-model", {"model_id": model["id"]})
        assert result.status_code == 200
        bootstrap = client.get("/api/bootstrap").json()
        assert bootstrap["default_model_id"] == model["id"]
        assert provider.requests == []


def test_read_only_backend_contract_is_persistent_and_empty_by_default(fixture):
    app, provider, _ = fixture
    with TestClient(app) as client:
        bootstrap = client.get("/api/bootstrap").json()
        assert bootstrap["backends"] == []
        connection = app.state.store.add_backend({
            "name": "OpenMausBot (not connected)",
            "kind": "openmausbot",
            "status": "unconfigured",
        })
        listed = client.get("/api/backends").json()
        assert listed == {"connections": [connection], "read_only": True}
        conversations = client.get(f"/api/backends/{connection['id']}/conversations").json()
        assert conversations == {"conversations": [], "read_only": True}
        assert provider.requests == []


def test_enable_codex_creates_local_adapter_without_provider_call(fixture, monkeypatch):
    app, provider, _ = fixture
    monkeypatch.setattr("workbench.app.shutil.which", lambda name: "/usr/bin/codex" if name == "codex" else None)
    with TestClient(app) as client:
        result = client.post("/api/models/enable-codex", headers=HEADERS)
        assert result.status_code == 200
        assert result.json()["model"]["kind"] == "codex_cli"
        assert result.json()["created"] is True
        assert provider.requests == []


def test_partial_failure_resume_reuses_completed_research(fixture):
    app, provider, _ = fixture
    complete = provider.complete
    fail_once = True

    async def partial_failure(model, messages, max_tokens):
        nonlocal fail_once
        result = await complete(model, messages, max_tokens)
        if "你的子任务：设计尚待" in messages[-1]["content"] and fail_once:
            fail_once = False
            await asyncio.sleep(0.08)
            raise ProviderError("test_partial_failure")
        return result

    provider.complete = partial_failure
    with TestClient(app) as client:
        _, model, task = seed(client)
        run = post(client, f"/api/tasks/{task['id']}/runs", run_body(model, max_calls=8)).json()
        failed = wait_status(client, run["id"], {"failed"})
        assert len(failed["artifacts"]) == 1
        assert len(failed["calls"]) == 3
        assert not any(call["status"] == "running" for call in failed["calls"])
        post(client, f"/api/runs/{run['id']}/resume", {"acknowledge_replay": True})
        result = wait_status(client, run["id"], {"succeeded", "failed"})
        assert result["run"]["status"] == "succeeded"
        assert len(result["artifacts"]) == 3
        assert len(provider.requests) == len(result["calls"]) == 5
        assert len([call for call in result["calls"] if call["status"] == "failed"]) == 1
        assert max(call["attempt"] for call in result["calls"]) == 2


def test_codex_single_channel_does_not_start_queued_research_after_failure(fixture):
    app, provider, _ = fixture
    original = provider.complete
    failed = False

    async def fail_first_research(model, messages, max_tokens):
        nonlocal failed
        if not failed and "你的子任务：" in messages[-1]["content"]:
            failed = True
            raise ProviderError("codex_cli_timeout_outcome_unknown")
        return await original(model, messages, max_tokens)

    provider.complete = fail_first_research
    with TestClient(app) as client:
        _, chat_model, task = seed(client)
        codex = post(client, "/api/models", {
            "kind": "codex_cli", "name": "Codex fixture",
            "endpoint": "codex://local", "model": "codex-cli",
        }).json()
        run = post(client, f"/api/tasks/{task['id']}/runs", run_body(
            chat_model, coordinator_model=codex["id"],
            researcher_model=codex["id"], reviewer_model=codex["id"],
            max_calls=4, parallel=2,
        )).json()
        result = wait_status(client, run["id"], {"failed"})
        assert result["run"]["error"] == "codex_cli_timeout_outcome_unknown"
        assert len(result["calls"]) == 2  # planner + first research only
        assert len(provider.requests) == 1  # the failed fixture short-circuits before recording
        queued = next(agent for agent in result["agents"] if agent["step_key"] == "research-1")
        assert queued["status"] == "pending"
        assert all(call["status"] != "canceled" for call in result["calls"])


def test_synthesis_resume_reuses_all_completed_research_with_last_call(fixture):
    app, provider, _ = fixture
    original = provider.complete
    failed = False

    async def fail_synthesis_once(model, messages, max_tokens):
        nonlocal failed
        if not failed and "以下是其他 Agent 的分析" in messages[-1]["content"]:
            failed = True
            raise ProviderError("test_synthesis_failure")
        return await original(model, messages, max_tokens)

    provider.complete = fail_synthesis_once
    with TestClient(app) as client:
        _, model, task = seed(client)
        run = post(client, f"/api/tasks/{task['id']}/runs", run_body(model, max_calls=5)).json()
        failed_run = wait_status(client, run["id"], {"failed"})
        assert len(failed_run["calls"]) == 4
        assert len(failed_run["artifacts"]) == 2
        assert post(client, f"/api/runs/{run['id']}/resume", {"acknowledge_replay": True}).status_code == 200
        result = wait_status(client, run["id"], {"succeeded", "failed"})
        assert result["run"]["status"] == "succeeded", result
        assert len(result["calls"]) == 5
        assert len(result["run"]["plan"]) == 2
        assert len(result["artifacts"]) == 3
        assert not any(event["kind"] == "plan.adjusted" for event in result["events"])


def test_truncated_output_preserves_usage_but_not_success(fixture):
    app, provider, _ = fixture
    complete = provider.complete

    async def truncated(model, messages, max_tokens):
        return {**await complete(model, messages, max_tokens), "truncated": True}

    provider.complete = truncated
    with TestClient(app) as client:
        _, model, task = seed(client)
        run = post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).json()
        result = wait_status(client, run["id"], {"failed"})
        assert result["run"]["error"] == "output_truncated"
        assert result["calls"][0]["input_tokens"] == 20
        assert result["calls"][0]["status"] == "failed"
        assert result["artifacts"] == []
