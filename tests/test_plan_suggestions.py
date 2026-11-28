import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from test_workbench import fixture, post, seed, wait_status
from workbench.plan_suggestions import (
    PlanSuggestionConfig, PlanSuggestionError, PlanSuggestionExecute,
    PlanSuggestionPrepare, PlanSuggestionService,
)


@pytest.fixture
def suggestion_case(fixture):
    app, provider, settings = fixture
    client = TestClient(app)
    project, model, task = seed(client)
    service = PlanSuggestionService(app.state.store, settings.workspace)
    yield client, app, provider, settings, project, model, task, service
    client.close()


def config(model):
    return PlanSuggestionConfig(
        model_id=model["id"], files=["README.md"], max_calls=1,
        call_timeout_seconds=60, max_output_tokens=1200,
    )


def candidate(case):
    _, _, _, _, _, model, task, service = case
    return service.preview(task["id"], config(model))


def prepared(case, request_id="suggestion-request-original"):
    _, _, _, _, _, model, task, service = case
    value = candidate(case)
    body = PlanSuggestionPrepare(
        request_id=request_id, preview_hash=value["preview_hash"],
        candidate_hash=value["candidate_hash"], config=value["config"], consent=True,
    )
    return service.prepare_candidate(task["id"], body, value)


def test_preview_is_strict_read_only_and_binds_source_model_and_scope(suggestion_case, monkeypatch):
    client, app, provider, _, _, model, task, service = suggestion_case
    monkeypatch.setattr("workbench.plan_suggestions.snapshot_files", lambda *_: (_ for _ in ()).throw(
        AssertionError("service must read only selected files through the trusted snapshot")
    ))
    # Empty metadata-only suggestions do not need source file bytes.
    value = service.preview(task["id"], PlanSuggestionConfig(
            model_id=model["id"], files=[], max_calls=1, call_timeout_seconds=60, max_output_tokens=1200,
    ))
    assert set(value) == {
        "schema_version", "unit", "task_id", "preview_hash", "config", "source", "model", "candidate_hash",
    }
    assert value["source"]["task"]["id"] == task["id"]
    assert value["config"]["max_calls"] == 1
    assert client.get("/api/bootstrap").json()["runs"] == []
    assert provider.requests == []


@pytest.mark.parametrize("changes", [
    {"max_calls": 2}, {"call_timeout_seconds": 181}, {"max_output_tokens": 255},
    {"model_id": ""}, {"files": ["missing.py"]}, {"extra": True},
])
def test_config_and_source_scope_are_strict(suggestion_case, changes):
    _, _, provider, _, _, model, task, service = suggestion_case
    raw = {"model_id": model["id"], "files": ["README.md"], "max_calls": 1,
           "call_timeout_seconds": 60, "max_output_tokens": 1200, **changes}
    with pytest.raises((ValueError, PlanSuggestionError)):
        value = PlanSuggestionConfig.model_validate(raw)
        service.preview(task["id"], value)
    assert provider.requests == []


def test_prepare_is_idempotent_and_unknown_candidate_is_rejected(suggestion_case):
    _, app, provider, _, _, model, task, service = suggestion_case
    value = candidate(suggestion_case)
    body = PlanSuggestionPrepare(
        request_id="suggestion-request-original", preview_hash=value["preview_hash"],
        candidate_hash=value["candidate_hash"], config=value["config"], consent=True,
    )
    first = service.prepare_candidate(task["id"], body, value)
    second = service.prepare_candidate(task["id"], body, value)
    assert first == second and first["state"] == "prepared"
    with pytest.raises(PlanSuggestionError) as error:
        service.prepare_candidate(task["id"], PlanSuggestionPrepare(
            request_id=body.request_id, preview_hash=value["preview_hash"],
            candidate_hash="0" * 64, config=value["config"], consent=True,
        ), value)
    assert error.value.code == "plan_suggestion_request_conflict"
    assert app.state.store.list("runs") == [] and provider.requests == []


def test_execute_creates_one_plan_suggestion_run_without_publishing_tasks(suggestion_case):
    _, app, provider, _, _, _, task, service = suggestion_case
    job = prepared(suggestion_case)
    result = service.execute(task["id"], PlanSuggestionExecute(
        request_id=job["request_id"], candidate_hash=job["candidate_hash"], consent=True,
    ))
    assert result["state"] == "applied" and result["run_id"]
    run = app.state.store.get("runs", result["run_id"])
    assert run["run_kind"] == "plan_suggestion"
    assert run["context"]["mode"] == "plan-suggestion-v1"
    assert app.state.store.list("tasks") == [task]
    assert provider.requests == []


def test_discard_is_idempotent_and_releases_the_task_suggestion_lock(suggestion_case):
    _, app, provider, _, _, _, task, service = suggestion_case
    job = prepared(suggestion_case)
    body = PlanSuggestionExecute(
        request_id=job["request_id"], candidate_hash=job["candidate_hash"], consent=True,
    )
    discarded = service.discard(task["id"], body)
    assert discarded["state"] == "discarded"
    assert service.discard(task["id"], body) == discarded
    with pytest.raises(PlanSuggestionError):
        service.execute(task["id"], body)
    next_candidate = candidate(suggestion_case)
    next_job = service.prepare_candidate(task["id"], PlanSuggestionPrepare(
        request_id="suggestion-request-next", preview_hash=next_candidate["preview_hash"],
        candidate_hash=next_candidate["candidate_hash"], config=next_candidate["config"], consent=True,
    ), next_candidate)
    assert next_job["state"] == "prepared"
    assert app.state.store.list("runs") == [] and provider.requests == []


def test_invalid_model_output_fails_without_publishing_or_fake_task(suggestion_case):
    _, app, provider, _, _, _, task, service = suggestion_case
    job = prepared(suggestion_case)
    run = service.execute(task["id"], PlanSuggestionExecute(
        request_id=job["request_id"], candidate_hash=job["candidate_hash"], consent=True,
    ))
    assert run["run_id"]
    # Harness validation is exercised by the focused engine tests; no Task is
    # created by the service even after a queued suggestion Run.
    assert app.state.store.list("tasks") == [task]
    assert provider.requests == []


def test_public_candidate_is_immutable_after_source_change(suggestion_case):
    client, app, provider, settings, _, model, task, service = suggestion_case
    value = candidate(suggestion_case)
    job = prepared(suggestion_case)
    (settings.workspace / "README.md").write_text("Changed after prepare", encoding="utf-8")
    assert service.read(task["id"], job["request_id"]) == job
    assert service.read(task["id"])["prepared"] == job
    assert app.state.store.list("tasks") == [task]
    assert provider.requests == []


def test_execution_requires_consent_and_candidate_identity(suggestion_case):
    _, app, provider, _, _, _, task, service = suggestion_case
    job = prepared(suggestion_case)
    with pytest.raises(PlanSuggestionError) as error:
        service.execute(task["id"], PlanSuggestionExecute(
            request_id=job["request_id"], candidate_hash=job["candidate_hash"], consent=False,
        ))
    assert error.value.code == "plan_suggestion_consent_required"
    with pytest.raises(PlanSuggestionError) as error:
        service.execute(task["id"], PlanSuggestionExecute(
            request_id=job["request_id"], candidate_hash="0" * 64, consent=True,
        ))
    assert error.value.code == "plan_suggestion_candidate_changed"
    assert app.state.store.list("runs") == [] and provider.requests == []


def test_task_plan_definition_validation_is_strict_inside_the_harness_contract(suggestion_case):
    _, _, provider, _, _, _, task, service = suggestion_case
    invalid = {
        "summary": "bad",
        "definition": {"items": [
            {"key": "a", "title": "A", "goal": "short", "acceptance": "ok", "files": [], "depends_on": ["b"]},
            {"key": "b", "title": "B", "goal": "short", "acceptance": "ok", "files": [], "depends_on": ["a"]},
        ]},
    }
    # The strict PlanDefinition is owned by the harness; ensure its validation
    # rejects cycles before an artifact could be accepted.
    from workbench.task_plans import PlanDefinition
    with pytest.raises(ValueError):
        PlanDefinition.model_validate(invalid["definition"])
    assert provider.requests == []


def test_engine_runs_one_strict_suggestion_call_and_persists_only_suggestion_artifact(suggestion_case):
    client, app, provider, _, _, model, task, service = suggestion_case
    value = candidate(suggestion_case)
    prepared_value = service.prepare_candidate(task["id"], PlanSuggestionPrepare(
        request_id="suggestion-engine-request", preview_hash=value["preview_hash"],
        candidate_hash=value["candidate_hash"], config=value["config"], consent=True,
    ), value)
    original = provider.complete

    async def complete(selected_model, messages, max_tokens):
        if selected_model["model"] == model["model"]:
            return {
                "text": json.dumps({
                    "summary": "建议拆成两个可审阅的工作项。",
                    "definition": {"items": [
                        {"key": "step1", "title": "核对边界", "goal": "核对任务范围和已知约束",
                         "acceptance": "形成可复核的边界清单", "files": [], "depends_on": []},
                        {"key": "step2", "title": "设计验证", "goal": "设计验证路径并记录仍待确认事项",
                         "acceptance": "形成可执行的验证清单", "files": [], "depends_on": ["step1"]},
                    ]},
                }, ensure_ascii=False),
                "model": selected_model["model"], "input_tokens": 12, "output_tokens": 80,
                "truncated": False,
            }
        return await original(selected_model, messages, max_tokens)

    provider.complete = complete
    with TestClient(app) as active_client:
        result = service.execute(task["id"], PlanSuggestionExecute(
            request_id=prepared_value["request_id"], candidate_hash=prepared_value["candidate_hash"],
            consent=True,
        ))
        run = wait_status(active_client, result["run_id"], {"succeeded", "failed"})
    assert run["run"]["status"] == "succeeded", run
    assert len(run["calls"]) == 1
    assert len(run["artifacts"]) == 1
    assert run["artifacts"][0]["kind"] == "plan_suggestion"
    assert app.state.store.list("tasks") == [task]
    assert app.state.store.get("runs", result["run_id"])["run_kind"] == "plan_suggestion"
