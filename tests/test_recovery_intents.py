import copy
import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from test_workbench import FakeProvider, post, run_body, seed
from workbench.app import create_app
from workbench.config import Settings
from workbench.store import Store


@pytest.fixture
def intent_fixture(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "README.md").write_text("PRIVATE_SOURCE_BODY_NOT_IN_INTENT")
    settings = Settings(tmp_path / "data", workspace, poll_interval=0.01)
    provider = FakeProvider()
    app = create_app(settings, provider)
    # No lifespan means no worker: these tests verify queue/control receipts,
    # not execution, and cannot invoke even the injected fake provider.
    client = TestClient(app)
    project, model, task = seed(client)
    source = post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).json()
    app.state.store.finish_run(source["id"], "failed", "synthetic_failure")
    yield client, app, provider, settings, project, model, task, source["id"]
    client.close()


def intent_path(source_id, request_id=None, action=None):
    path = f"/api/runs/{source_id}/recovery-intents"
    if request_id is not None:
        path += f"/{request_id}"
    return f"{path}/{action}" if action is not None else path


def candidate(client, source_id, request_id="recovery-intent-123", mode="retry", **changes):
    preview = client.get(f"/api/runs/{source_id}/retry-preview").json()
    body = {
        "request_id": request_id, "mode": mode, "snapshot_hash": preview["snapshot_hash"],
    }
    if mode == "retry":
        body["config"] = {**preview["defaults"], "max_calls": preview["minimum_calls"]}
    return {**body, **changes}


def prepare(client, source_id, **changes):
    return post(client, intent_path(source_id), candidate(client, source_id, **changes))


def execute(client, source_id, request_id="recovery-intent-123", **changes):
    return post(client, intent_path(source_id, request_id, "execute"), {
        "consent": True, "acknowledge_replay": True, **changes,
    })


def paused_source(store, source_id):
    store.control(source_id, "resume", True)
    return store.control(source_id, "pause")


def synthetic_call(store, source_id, model, status):
    agent = store.agent(
        source_id, "plan", "coordinator", "Synthetic planning", "Synthetic checkpoint", model["id"],
    )
    call_id = store.start_call(source_id, agent, model)
    store.finish_call(call_id, status, result={
        "model": model["model"], "input_tokens": 1, "output_tokens": 1,
    } if status == "succeeded" else None)
    return call_id


def test_preparation_reads_and_abandonment_do_not_queue_call_or_copy_private_context(intent_fixture):
    client, app, provider, _, _, _, _, source_id = intent_fixture
    before = app.state.store.get("runs", source_id)
    assert client.get(intent_path(source_id)).json() == {
        "latest": None, "unresolved": None, "history": [], "total": 0, "history_truncated": False,
    }
    result = prepare(client, source_id)
    assert result.status_code == 200, result.text
    receipt = result.json()
    assert receipt["state"] == "prepared"
    assert receipt["consent_required"] is True
    assert receipt["target_run_id"] is receipt["error_code"] is receipt["settled_at"] is None
    assert len(receipt["candidate_hash"]) == len(receipt["snapshot_hash"]) == 64
    assert client.get(intent_path(source_id, receipt["request_id"])).json() == receipt
    listing = client.get(intent_path(source_id)).json()
    assert listing["latest"] == listing["unresolved"] == receipt
    assert listing["history"] == [receipt]
    with app.state.store.transaction() as db:
        stored = [dict(row) for row in db.execute("SELECT * FROM recovery_intents")]
    serialized = json.dumps([receipt, stored])
    assert "PRIVATE_SOURCE_BODY_NOT_IN_INTENT" not in serialized
    assert "Allowed notes" not in serialized
    assert "http://127.0.0.1:9999/v1" not in serialized
    assert "input_hash" not in receipt
    assert app.state.store.get("runs", source_id) == before
    assert len(client.get("/api/bootstrap").json()["runs"]) == 1
    abandoned = post(client, intent_path(source_id, receipt["request_id"], "abandon"), {}).json()
    assert abandoned["state"] == "abandoned"
    assert post(client, intent_path(source_id, receipt["request_id"], "abandon"), {}).json() == abandoned
    assert client.get(intent_path(source_id)).json()["unresolved"] is None
    assert provider.requests == []


@pytest.mark.parametrize("changes", [
    {"config": None}, {"mode": "invalid"}, {"request_id": "short"},
    {"request_id": "path/request"}, {"snapshot_hash": "bad"}, {"extra": True},
    {"consent": True},
])
def test_preparation_input_is_typed_and_has_no_authorization_bypass(intent_fixture, changes):
    client, _, provider, _, _, _, _, source_id = intent_fixture
    response = prepare(client, source_id, **changes)
    assert response.status_code == 422
    assert client.get(intent_path(source_id)).json()["history"] == []
    assert provider.requests == []


@pytest.mark.parametrize("field,value", [
    ("max_calls", 0), ("max_calls", 9), ("parallel", 3), ("minutes", 31),
    ("max_output_tokens", 4097), ("call_timeout_seconds", 301), ("notes", "not-allowed"),
    ("endpoint", "https://not-a-model.example"),
])
def test_prepared_resource_candidate_rejects_invalid_or_extra_fields(intent_fixture, field, value):
    client, _, provider, _, _, _, _, source_id = intent_fixture
    body = candidate(client, source_id)
    body["config"][field] = value
    assert post(client, intent_path(source_id), body).status_code == 422
    assert provider.requests == []


def test_execute_requires_registration_and_fresh_explicit_consent(intent_fixture):
    client, _, provider, _, _, _, _, source_id = intent_fixture
    assert execute(client, source_id, "unregistered-request").status_code == 404
    receipt = prepare(client, source_id).json()
    response = execute(client, source_id, consent=False)
    assert response.status_code == 422
    assert response.json()["detail"] == "recovery_intent_consent_required"
    assert client.get(intent_path(source_id, receipt["request_id"])).json() == receipt
    assert len(client.get("/api/bootstrap").json()["runs"]) == 1
    assert provider.requests == []


def test_execute_cannot_replace_the_prepared_resource_candidate(intent_fixture):
    client, _, provider, _, _, _, _, source_id = intent_fixture
    prepared = prepare(client, source_id).json()
    response = post(client, intent_path(source_id, prepared["request_id"], "execute"), {
        "consent": True, "config": {**prepared["config"], "max_calls": 8},
    })
    assert response.status_code == 422
    assert client.get(intent_path(source_id, prepared["request_id"])).json() == prepared
    assert provider.requests == []


def test_same_preparation_is_idempotent_but_different_candidate_mode_or_source_conflicts(intent_fixture):
    client, app, provider, _, _, _, _, source_id = intent_fixture
    body = candidate(client, source_id)
    first = post(client, intent_path(source_id), body).json()
    assert post(client, intent_path(source_id), body).json() == first
    changed = copy.deepcopy(body)
    changed["config"]["max_calls"] += 1
    assert post(client, intent_path(source_id), changed).status_code == 409
    assert post(client, intent_path(source_id), {
        **body, "mode": "resume", "config": None,
    }).status_code == 409
    _, other_model, other_task = seed(client)
    other = post(client, f"/api/tasks/{other_task['id']}/runs",
                 run_body(other_model, request_id="other-source-request")).json()
    app.state.store.finish_run(other["id"], "failed")
    assert post(client, intent_path(other["id"]), candidate(
        client, other["id"], request_id=first["request_id"],
    )).status_code == 409
    assert client.get(intent_path(other["id"], first["request_id"])).status_code == 409
    assert execute(client, other["id"], first["request_id"]).status_code == 409
    assert post(client, intent_path(other["id"], first["request_id"], "abandon"), {}).status_code == 409
    assert provider.requests == []


def test_two_tabs_can_register_only_one_unresolved_source_candidate(intent_fixture):
    client, _, provider, _, _, _, _, source_id = intent_fixture
    bodies = [candidate(client, source_id, request_id=f"recovery-tab-{index}") for index in range(2)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda body: post(client, intent_path(source_id), body), bodies))
    assert sorted(response.status_code for response in responses) == [200, 409]
    failed = next(response for response in responses if response.status_code == 409)
    assert failed.json()["detail"] == "recovery_intent_pending"
    assert client.get(intent_path(source_id)).json()["total"] == 1
    assert provider.requests == []


def test_applied_retry_has_exact_target_and_replay_never_enqueues_twice(intent_fixture):
    client, app, provider, _, _, _, _, source_id = intent_fixture
    before = app.state.store.get("runs", source_id)
    prepared = prepare(client, source_id).json()
    applied = execute(client, source_id).json()
    assert applied["state"] == "applied"
    assert applied["candidate_hash"] == prepared["candidate_hash"]
    assert applied["target_run_id"] != source_id
    assert applied["consent_required"] is applied["outcome_unknown"] is False
    target = app.state.store.get("runs", applied["target_run_id"])
    assert target["status"] == "queued"
    assert target["source_run_id"] == source_id
    assert target["request_id"] == applied["request_id"]
    for _ in range(3):
        assert execute(client, source_id).json() == applied
        assert client.get(intent_path(source_id, applied["request_id"])).json() == applied
    assert app.state.store.get("runs", source_id) == before
    assert len(client.get("/api/bootstrap").json()["runs"]) == 2
    assert client.get(intent_path(source_id)).json()["unresolved"] is None
    assert post(client, intent_path(source_id, applied["request_id"], "abandon"), {}).status_code == 409
    assert provider.requests == []


@pytest.mark.parametrize("mutation,error", [
    ("source", "recovery_intent_snapshot_changed"),
    ("model", "recovery_intent_candidate_changed"),
])
def test_changed_source_or_model_is_rejected_without_switching_candidate(intent_fixture, mutation, error):
    client, app, provider, _, _, model, _, source_id = intent_fixture
    prepare(client, source_id)
    if mutation == "source":
        app.state.store.finish_run(source_id, "failed", "changed-after-preparation")
    else:
        with app.state.store.transaction() as db:
            db.execute("UPDATE models SET endpoint=? WHERE id=?", (
                "https://changed-definition.example/v1", model["id"],
            ))
    rejected = execute(client, source_id).json()
    assert rejected["state"] == "rejected"
    assert rejected["error_code"] == error
    assert rejected["target_run_id"] is None
    assert execute(client, source_id).json() == rejected
    assert len(client.get("/api/bootstrap").json()["runs"]) == 1
    assert client.get(intent_path(source_id)).json()["unresolved"] is None
    assert provider.requests == []


def test_replay_acknowledgement_is_required_without_consuming_prepared_intent(intent_fixture):
    client, app, provider, _, _, model, _, source_id = intent_fixture
    synthetic_call(app.state.store, source_id, model, "failed")
    receipt = prepare(client, source_id).json()
    assert receipt["requires_acknowledgement"] is True
    rejected = execute(client, source_id, acknowledge_replay=False)
    assert rejected.status_code == 422
    assert rejected.json()["detail"] == "retry_replay_confirmation_required"
    assert client.get(intent_path(source_id, receipt["request_id"])).json() == receipt
    assert execute(client, source_id).json()["state"] == "applied"
    assert provider.requests == []


def test_key_becoming_unavailable_rejects_execution_without_storing_key_material(intent_fixture, monkeypatch):
    client, app, provider, _, _, model, _, source_id = intent_fixture
    variable = "WORKBENCH_MODEL_RECOVERY_TEST_KEY"
    monkeypatch.setenv(variable, "private-recovery-key")
    with app.state.store.transaction() as db:
        db.execute("UPDATE models SET key_env=? WHERE id=?", (variable, model["id"]))
    prepared = prepare(client, source_id).json()
    monkeypatch.delenv(variable)
    rejected = execute(client, source_id).json()
    assert rejected["state"] == "rejected" and rejected["error_code"] == "missing_api_key"
    assert rejected["candidate_hash"] == prepared["candidate_hash"]
    assert len(client.get("/api/bootstrap").json()["runs"]) == 1
    with app.state.store.transaction() as db:
        intents = [dict(row) for row in db.execute("SELECT * FROM recovery_intents")]
    assert "private-recovery-key" not in json.dumps(intents)
    assert variable not in json.dumps(intents)
    assert provider.requests == []


def test_reused_roles_stay_locked_and_reused_facts_are_copied_only_to_authorized_retry(intent_fixture):
    client, app, provider, _, _, model, _, source_id = intent_fixture
    store = app.state.store
    store.plan(source_id, [{"title": "Study", "objective": "Synthetic read-only study"}])
    agent = store.agent(source_id, "plan", "coordinator", "Planning", "Synthetic plan", model["id"])
    store.agent_status(agent["id"], "succeeded", '{"tasks":[{"title":"Study","objective":"Synthetic read-only study"}]}')
    other = post(client, "/api/models", {
        "name": "Other", "endpoint": "http://127.0.0.1:9999/v1", "model": "other-fixture",
    }).json()
    body = candidate(client, source_id)
    changed = copy.deepcopy(body)
    changed["config"]["coordinator_model"] = other["id"]
    rejected = post(client, intent_path(source_id), changed)
    assert rejected.status_code == 409
    assert rejected.json()["detail"] == "retry_completed_role_model_locked"
    before = store.get("runs", source_id)
    prepared = post(client, intent_path(source_id), body).json()
    applied = execute(client, source_id).json()
    assert prepared["config"]["max_calls"] == 2
    assert applied["state"] == "applied"
    copied = store.list("agents", applied["target_run_id"])
    assert len(copied) == 1
    assert copied[0]["source_agent_id"] == agent["id"]
    assert copied[0]["status"] == "succeeded"
    assert copied[0]["started_at"] is copied[0]["ended_at"] is None
    assert store.get("runs", source_id) == before
    assert provider.requests == []


def test_abandoned_candidate_cannot_execute_and_explicit_replacement_can_be_prepared(intent_fixture):
    client, _, provider, _, _, _, _, source_id = intent_fixture
    receipt = prepare(client, source_id).json()
    abandoned = post(client, intent_path(source_id, receipt["request_id"], "abandon"), {}).json()
    assert execute(client, source_id).json() == abandoned
    assert prepare(client, source_id, request_id="explicit-replacement").json()["state"] == "prepared"
    assert len(client.get("/api/bootstrap").json()["runs"]) == 1
    assert provider.requests == []


@pytest.mark.parametrize("state", ["prepared", "applying", "unknown"])
def test_unresolved_intent_blocks_legacy_retry_and_resume(intent_fixture, state):
    client, app, provider, _, _, _, _, source_id = intent_fixture
    receipt = prepare(client, source_id).json()
    if state != "prepared":
        app.state.store._claim_recovery_execution(source_id, receipt["request_id"], True)
    if state == "unknown":
        app.state.store.recover()
    old_body = candidate(client, source_id, request_id="legacy-retry-request")
    response = post(client, f"/api/runs/{source_id}/retry", {
        **old_body["config"], "snapshot_hash": old_body["snapshot_hash"],
        "request_id": old_body["request_id"], "consent": True, "acknowledge_replay": True,
    })
    assert response.status_code == 409
    assert response.json()["detail"] == "recovery_intent_pending"
    response = post(client, f"/api/runs/{source_id}/resume", {"acknowledge_replay": True})
    assert response.status_code == 409
    assert response.json()["detail"] == "recovery_intent_pending"
    assert len(client.get("/api/bootstrap").json()["runs"]) == 1
    assert provider.requests == []


def test_strict_resume_applies_same_run_and_original_resources_once(intent_fixture):
    client, app, provider, _, _, _, _, source_id = intent_fixture
    source = paused_source(app.state.store, source_id)
    original = copy.deepcopy(source["config"])
    receipt = prepare(client, source_id, mode="resume").json()
    assert receipt["mode"] == "resume"
    assert receipt["config"] == original
    assert "call_timeout_seconds" not in receipt["config"]
    applied = execute(client, source_id).json()
    assert applied["state"] == "applied" and applied["target_run_id"] == source_id
    assert app.state.store.get("runs", source_id)["status"] == "queued"
    assert app.state.store.get("runs", source_id)["config"] == original
    assert execute(client, source_id).json() == applied
    assert len(client.get("/api/bootstrap").json()["runs"]) == 1
    assert provider.requests == []


@pytest.mark.parametrize("condition,expected", [
    ("failed", "recovery_resume_not_paused"),
    ("call_failed", "recovery_resume_ambiguous_calls"),
    ("budget", "recovery_resume_budget_insufficient"),
    ("model", "recovery_resume_model_changed"),
    ("child", "recovery_resume_has_child"),
])
def test_resume_rejects_unsafe_checkpoint_without_authorization(intent_fixture, condition, expected):
    client, app, provider, _, _, model, _, source_id = intent_fixture
    if condition != "failed":
        paused_source(app.state.store, source_id)
    if condition in {"call_failed", "budget"}:
        synthetic_call(app.state.store, source_id, model, "failed" if condition == "call_failed" else "succeeded")
    if condition == "budget":
        with app.state.store.transaction() as db:
            config = json.loads(db.execute("SELECT config FROM runs WHERE id=?", (source_id,)).fetchone()["config"])
            config["max_calls"] = 3
            db.execute("UPDATE runs SET config=? WHERE id=?", (json.dumps(config), source_id))
    if condition == "model":
        with app.state.store.transaction() as db:
            db.execute("UPDATE models SET model='changed-model' WHERE id=?", (model["id"],))
    if condition == "child":
        old = candidate(client, source_id, request_id="older-child-request")
        response = post(client, f"/api/runs/{source_id}/retry", {
            **old["config"], "snapshot_hash": old["snapshot_hash"], "request_id": old["request_id"],
            "consent": True, "acknowledge_replay": True,
        })
        assert response.status_code == 201
    response = prepare(client, source_id, mode="resume")
    assert response.status_code == 409, response.text
    assert response.json()["detail"] == expected
    assert client.get(intent_path(source_id)).json()["history"] == []
    assert provider.requests == []


def test_resume_resources_are_not_editable_in_preparation(intent_fixture):
    client, _, _, _, _, _, _, source_id = intent_fixture
    assert prepare(client, source_id, mode="resume", config={}).status_code == 422


@pytest.mark.parametrize("error,state,code", [
    (RuntimeError("private-intent-error"), "unknown", "recovery_intent_execution_outcome_unknown"),
    (ValueError("private-intent-error"), "rejected", "recovery_intent_validation_failed"),
])
def test_application_failure_rolls_back_run_and_redacts_error(intent_fixture, monkeypatch, error, state, code):
    client, app, provider, _, _, _, _, source_id = intent_fixture
    prepare(client, source_id)
    original = app.state.store._create_retry

    def interrupted(*args, **kwargs):
        original(*args, **kwargs)
        raise error

    monkeypatch.setattr(app.state.store, "_create_retry", interrupted)
    receipt = execute(client, source_id).json()
    assert receipt["state"] == state
    assert receipt["error_code"] == code
    assert receipt["target_run_id"] is None
    assert len(client.get("/api/bootstrap").json()["runs"]) == 1
    assert execute(client, source_id).json() == receipt
    with app.state.store.transaction() as db:
        rows = [dict(row) for row in db.execute("SELECT * FROM recovery_intents")]
        events = [dict(row) for row in db.execute("SELECT * FROM events WHERE kind LIKE 'recovery.%'")]
    assert "private-intent-error" not in json.dumps([receipt, rows, events])
    assert provider.requests == []


def test_restart_recovers_applying_to_unknown_and_never_replays_or_accepts_late_completion(intent_fixture):
    client, app, provider, settings, _, _, _, source_id = intent_fixture
    prepared = prepare(client, source_id).json()
    applying, claimed = app.state.store._claim_recovery_execution(source_id, prepared["request_id"], True)
    assert claimed and applying["state"] == "applying"
    assert Store(settings.data_dir).recovery_intent(source_id, prepared["request_id"])["state"] == "applying"
    restarted_provider = FakeProvider()
    with TestClient(create_app(settings, restarted_provider)) as restarted:
        unknown = restarted.get(intent_path(source_id, prepared["request_id"])).json()
        assert unknown["state"] == "unknown"
        assert unknown["error_code"] == "recovery_intent_interrupted_outcome_unknown"
        assert unknown["outcome_unknown"] is True
        assert restarted.get(intent_path(source_id)).json()["unresolved"] == unknown
        assert execute(restarted, source_id).json() == unknown
        assert post(restarted, intent_path(source_id, prepared["request_id"], "abandon"), {}).status_code == 409
        assert prepare(restarted, source_id, request_id="must-not-replace-unknown").status_code == 409
        assert app.state.store._apply_recovery_intent(source_id, prepared["request_id"], settings.workspace) == unknown
        assert len(restarted.get("/api/bootstrap").json()["runs"]) == 1
        assert restarted_provider.requests == []
    assert provider.requests == []


def test_prepared_and_applied_receipts_survive_store_recreation_without_execution(intent_fixture):
    client, app, provider, settings, _, _, _, source_id = intent_fixture
    prepared = prepare(client, source_id).json()
    recreated = Store(settings.data_dir)
    recreated.recover()
    assert recreated.recovery_intent(source_id, prepared["request_id"]) == prepared
    assert execute(client, source_id, consent=False).status_code == 422
    applied = execute(client, source_id).json()
    recreated = Store(settings.data_dir)
    recreated.recover()
    assert recreated.recovery_intent(source_id, prepared["request_id"]) == applied
    assert recreated.get("runs", applied["target_run_id"])["status"] == "queued"
    assert provider.requests == []
