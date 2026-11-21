import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from test_workbench import FakeProvider, HEADERS, post, run_body, seed, wait_status
from workbench.app import create_app
from workbench.config import Settings
from workbench.store import Store
from workbench.task_turns import (
    TaskTurnCreate, TaskTurnError, TaskTurnExecute, TaskTurnPrepare, TaskTurnService,
)


@pytest.fixture
def turn_case(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "README.md").write_text("Selected source\n中文资料", encoding="utf-8")
    settings = Settings(tmp_path / "data", workspace, poll_interval=0.01)
    provider = FakeProvider()
    app = create_app(settings, provider)
    # Omit lifespan: queue receipts must not start even the injected fake Provider.
    client = TestClient(app)
    project, model, task = seed(client)
    yield client, app, provider, settings, project, model, task
    client.close()


def path(task, turn=None, action=None):
    value = f"/api/tasks/{task['id']}/turns"
    if turn is not None:
        value += f"/{turn['id']}"
    return f"{value}/{action}" if action is not None else value


def save(client, task, content="只分析这一条补充要求", request_id="task-turn-request-123"):
    response = post(client, path(task), {"request_id": request_id, "content": content})
    assert response.status_code == 201, response.text
    return response.json()


def prepare_body(client, task, turn, model, **changes):
    response = post(client, path(task, turn, "preview"), {})
    assert response.status_code == 200, response.text
    return {
        "coordinator_model": model["id"], "researcher_model": model["id"],
        "reviewer_model": model["id"], "max_calls": 4, "parallel": 2,
        "minutes": 10, "max_output_tokens": 1800,
        "context_hash": response.json()["context_hash"], **changes,
    }


def prepare(client, task, turn, model, **changes):
    response = post(client, path(task, turn, "prepare"), prepare_body(client, task, turn, model, **changes))
    assert response.status_code == 200, response.text
    return response.json()


def execute(client, task, turn, **changes):
    return post(client, path(task, turn, "execute"), {
        "candidate_hash": turn["candidate"]["candidate_hash"], "consent": True, **changes,
    })


def rows(store, table):
    with store.transaction() as db:
        return [dict(row) for row in db.execute(f"SELECT * FROM {table} ORDER BY rowid")]


def failed_source(client, app, task, model):
    response = post(client, f"/api/tasks/{task['id']}/runs", run_body(model))
    assert response.status_code == 201, response.text
    source = response.json()
    app.state.store.finish_run(source["id"], "failed", "synthetic_failure")
    return source


def recovery_body(client, source):
    preview = client.get(f"/api/runs/{source['id']}/retry-preview").json()
    return {
        "request_id": "recovery-for-turn-123", "mode": "retry",
        "snapshot_hash": preview["snapshot_hash"],
        "config": {**preview["defaults"], "max_calls": max(3, preview["minimum_calls"])},
    }


def test_save_is_immutable_local_persistence_and_exact_request_receipt(turn_case, monkeypatch):
    client, app, provider, _, _, _, task = turn_case

    def no_snapshot(*args):
        raise AssertionError("Saving must not read source files")

    monkeypatch.setattr("workbench.task_turns.snapshot", no_snapshot)
    original_task = app.state.store.get("tasks", task["id"])
    turn = save(client, task, "  中文补充\nonly this message  ")
    assert set(turn) == {
        "id", "task_id", "request_id", "content", "created_at", "state", "run_id", "candidate",
    }
    assert turn["content"] == "中文补充\nonly this message"
    assert turn["task_id"] == task["id"]
    assert turn["state"] == "saved"
    assert turn["candidate"] is turn["run_id"] is None
    assert client.get(path(task, turn)).json() == turn
    assert client.get(f"{path(task)}/requests/{turn['request_id']}").json() == turn
    repeated = save(client, task, "中文补充\nonly this message")
    assert repeated == turn
    assert len(rows(app.state.store, "task_turns")) == 1
    events = [event for event in rows(app.state.store, "events") if event["kind"] == "task.turn.saved"]
    assert len(events) == 1
    assert json.loads(events[0]["payload"])["execution_authorized"] is False
    assert rows(app.state.store, "runs") == []
    assert provider.requests == []
    assert app.state.store.get("tasks", task["id"]) == original_task


@pytest.mark.parametrize("changes", [
    {"content": ""}, {"content": " \n\t "}, {"content": "x" * 8001},
    {"content": 42}, {"content": True}, {"content": None},
    {"request_id": "short"}, {"request_id": "request/invalid"},
    {"request_id": "request-中文"}, {"request_id": "request-valid\n"},
    {"request_id": "r" * 101}, {"request_id": False}, {"extra": True},
    {"consent": True}, {"candidate": {}}, {"run_id": "fake-run"},
])
def test_save_strict_input_cannot_authorize_or_change_state(turn_case, changes):
    client, app, provider, _, _, _, task = turn_case
    response = post(client, path(task), {
        "request_id": "task-turn-request-123", "content": "Valid content", **changes,
    })
    assert response.status_code == 422, response.text
    assert rows(app.state.store, "task_turns") == []
    assert provider.requests == []


def test_content_limit_is_unicode_codepoints_and_invalid_utf8_is_rejected(turn_case):
    client, _, _, _, _, _, task = turn_case
    saved = save(client, task, "中" * 8000)
    assert len(saved["content"]) == 8000
    with pytest.raises(ValidationError):
        TaskTurnCreate(request_id="invalid-utf8-turn", content="\ud800")


def test_save_id_conflicts_across_content_task_run_and_recovery(turn_case):
    client, app, provider, _, project, model, task = turn_case
    turn = save(client, task)
    other = post(client, "/api/tasks", {
        "project_id": project["id"], "title": "Other", "goal": "A different long goal",
    }).json()
    for target, content in [(task, "Changed content"), (other, turn["content"])]:
        response = post(client, path(target), {
            "request_id": turn["request_id"], "content": content,
        })
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "task_turn_request_conflict"
    ordinary = post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).json()
    response = post(client, path(task), {
        "request_id": ordinary["request_id"], "content": "Collision with a normal Run",
    })
    assert response.status_code == 409
    app.state.store.finish_run(ordinary["id"], "failed", "synthetic_failure")
    recovery = recovery_body(client, ordinary)
    assert post(client, f"/api/runs/{ordinary['id']}/recovery-intents", recovery).status_code == 200
    response = post(client, path(task), {
        "request_id": recovery["request_id"], "content": "Collision with recovery",
    })
    assert response.status_code == 409
    assert len(rows(app.state.store, "task_turns")) == 1
    assert provider.requests == []


def test_list_fixed_bound_order_and_prepared_receipt_outside_page(turn_case):
    client, app, _, _, _, model, task = turn_case
    saved = [save(client, task, f"Message {index}", f"task-turn-{index:08}") for index in range(25)]
    with app.state.store.transaction() as db:
        db.execute("UPDATE task_turns SET created_at='2026-11-21T00:00:00+00:00'")
    locked = prepare(client, task, saved[-1], model)
    first = client.get(path(task)).json()
    assert set(first) == {
        "schema_version", "unit", "task_id", "items", "prepared", "total", "requested_page",
        "page", "page_size", "total_pages", "has_more", "order",
    }
    assert first["schema_version"] == 1 and first["unit"] == "task_turns"
    assert first["task_id"] == task["id"] and first["order"] == "turns-created-v1"
    assert [item["id"] for item in first["items"]] == [item["id"] for item in saved[:20]]
    assert first["prepared"] == locked
    assert locked["id"] not in [item["id"] for item in first["items"]]
    assert first["total"] == 25 and first["page_size"] == 20
    assert first["page"] == first["requested_page"] == 1
    assert first["total_pages"] == 2 and first["has_more"] is True
    second = client.get(f"{path(task)}?page=2").json()
    assert second["items"][-1] == second["prepared"] == locked
    clamped = client.get(f"{path(task)}?page=999").json()
    assert clamped["requested_page"] == 999 and clamped["page"] == 2
    assert clamped["has_more"] is False
    assert clamped["items"] == second["items"]


def test_list_empty_missing_scoped_receipts_and_strict_parameters(turn_case):
    client, _, _, _, project, _, task = turn_case
    empty = client.get(path(task)).json()
    assert empty["items"] == [] and empty["prepared"] is None
    assert empty["total"] == 0 and empty["total_pages"] == empty["page"] == 1
    assert empty["has_more"] is False
    turn = save(client, task)
    other = post(client, "/api/tasks", {
        "project_id": project["id"], "title": "Other", "goal": "A different long goal",
    }).json()
    assert client.get(path(other, turn)).status_code == 404
    assert client.get(f"{path(other)}/requests/{turn['request_id']}").status_code == 404
    assert client.get("/api/tasks/missing/turns").status_code == 404
    for query in ["?page=0", "?page=true", "?page=1&page=2", "?page_size=100", "?unknown=1"]:
        assert client.get(f"{path(task)}{query}").status_code == 422
    assert client.get(f"{path(task, turn)}?page=1").status_code == 422
    assert post(client, f"{path(task)}?page=1", {
        "request_id": "another-turn-request", "content": "No query parameters on save",
    }).status_code == 422


def test_ro_reads_use_query_only_snapshot_and_close_connections(turn_case, monkeypatch):
    client, app, _, _, _, _, task = turn_case
    turn = save(client, task)
    opened, closed = [], []
    connect = sqlite3.connect

    class TrackedConnection(sqlite3.Connection):
        def close(self):
            closed.append(self)
            return super().close()

    def tracked_connect(*args, **kwargs):
        kwargs["factory"] = TrackedConnection
        db = connect(*args, **kwargs)
        opened.append(db)
        return db

    monkeypatch.setattr("workbench.task_turns.sqlite3.connect", tracked_connect)
    service = app.state.task_turns
    assert service.list(task["id"])["total"] == 1
    assert service.read(task["id"], turn["id"]) == turn
    assert service.by_request(task["id"], turn["request_id"]) == turn
    with service.reader() as db:
        assert db.in_transaction
        assert db.execute("PRAGMA query_only").fetchone()[0] == 1
        with pytest.raises(sqlite3.OperationalError, match="readonly"):
            db.execute("DELETE FROM task_turns")
    assert len(opened) == len(closed) == 4
    for db in closed:
        with pytest.raises(sqlite3.ProgrammingError):
            db.execute("SELECT 1")


def test_preview_only_selected_supplement_and_has_no_provider_or_event_effect(turn_case):
    client, app, provider, settings, project, _, task = turn_case
    first = save(client, task, "PRIVATE_PREVIOUS_SUPPLEMENT", "previous-turn-request")
    selected = save(client, task, "ONLY_SELECTED_SUPPLEMENT", "selected-turn-request")
    before_events = rows(app.state.store, "events")
    preview = post(client, path(task, selected, "preview"), {}).json()
    assert set(preview) == {
        "goal", "acceptance", "notes", "text", "evidence", "bytes", "context_hash",
        "access", "tools", "supplement",
    }
    assert preview["supplement"] == {"id": selected["id"], "content": selected["content"]}
    assert task["goal"] in preview["goal"] and selected["content"] in preview["goal"]
    assert first["content"] not in json.dumps(preview)
    assert preview["notes"] == project["notes"]
    assert preview["access"] == "read_only" and preview["tools"] == []
    assert preview["bytes"] == len(preview["text"].encode("utf-8"))
    assert preview["bytes"] > len(preview["text"])
    assert rows(app.state.store, "events") == before_events
    assert rows(app.state.store, "runs") == [] and provider.requests == []
    assert app.state.store.get("tasks", task["id"]) == task
    assert post(client, path(task, selected, "preview"), {"consent": True}).status_code == 422
    (settings.workspace / "README.md").write_text("Changed source", encoding="utf-8")
    changed = post(client, path(task, selected, "preview"), {}).json()
    assert changed["context_hash"] != preview["context_hash"]


def test_prepare_freezes_exact_candidate_and_hides_private_model_data(turn_case):
    client, app, provider, settings, _, model, task = turn_case
    turn = save(client, task)
    body = prepare_body(client, task, turn, model)
    prepared = post(client, path(task, turn, "prepare"), body).json()
    assert prepared["state"] == "prepared" and prepared["run_id"] is None
    candidate = prepared["candidate"]
    assert set(candidate) == {"candidate_hash", "config", "snapshot"}
    assert set(candidate["config"]) == {
        "coordinator_model", "researcher_model", "reviewer_model", "max_calls",
        "parallel", "minutes", "max_output_tokens",
    }
    serialized = json.dumps(prepared)
    assert model["endpoint"] not in serialized and "key_env" not in serialized
    assert "models" not in candidate["snapshot"]
    assert client.get(path(task)).json()["prepared"] == prepared
    assert client.get(path(task, turn)).json() == prepared
    (settings.workspace / "README.md").write_text("New source after preparation")
    assert post(client, path(task, turn, "preview"), {}).json() == candidate["snapshot"]
    repeated = post(client, path(task, turn, "prepare"), body)
    assert repeated.status_code == 200 and repeated.json() == prepared
    changed = post(client, path(task, turn, "prepare"), {**body, "max_calls": 5})
    assert changed.status_code == 409
    assert changed.json()["detail"]["code"] == "task_turn_candidate_conflict"
    assert rows(app.state.store, "runs") == [] and provider.requests == []
    assert len([event for event in rows(app.state.store, "events") if event["kind"] == "task.turn.prepared"]) == 1
    recreated = TaskTurnService(Store(settings.data_dir), settings.workspace)
    assert recreated.read(task["id"], turn["id"]) == prepared


@pytest.mark.parametrize("changes", [
    {"max_calls": 2}, {"max_calls": 9}, {"max_calls": True}, {"parallel": 3},
    {"minutes": 0}, {"minutes": 31}, {"max_output_tokens": 255},
    {"max_output_tokens": 4097}, {"coordinator_model": 3}, {"reviewer_model": " padded "},
    {"context_hash": "invalid"}, {"consent": True}, {"request_id": "another-request"},
    {"extra": True},
])
def test_prepare_body_is_strict_and_cannot_accept_execution_consent(turn_case, changes):
    client, app, provider, _, _, model, task = turn_case
    turn = save(client, task)
    body = prepare_body(client, task, turn, model, **changes)
    response = post(client, path(task, turn, "prepare"), body)
    assert response.status_code == 422, response.text
    assert client.get(path(task, turn)).json()["state"] == "saved"
    assert rows(app.state.store, "runs") == [] and provider.requests == []


def test_prepare_rechecks_exact_context_model_and_key_availability(turn_case, monkeypatch):
    client, _, provider, settings, _, model, task = turn_case
    turn = save(client, task)
    body = prepare_body(client, task, turn, model)
    (settings.workspace / "README.md").write_text("Files changed before preparation")
    changed = post(client, path(task, turn, "prepare"), body)
    assert changed.status_code == 409
    assert changed.json()["detail"] == {"code": "task_turn_context_changed"}
    invalid_model = post(client, path(task, turn, "prepare"),
                         prepare_body(client, task, turn, model, reviewer_model="missing-model"))
    assert invalid_model.status_code == 422
    assert invalid_model.json()["detail"]["code"] == "task_turn_model_unavailable"
    monkeypatch.delenv("WORKBENCH_MODEL_TURNTEST_KEY", raising=False)
    remote = post(client, "/api/models", {
        "name": "Unavailable", "endpoint": "https://example.test/v1",
        "model": "example-model", "key_env": "WORKBENCH_MODEL_TURNTEST_KEY",
    }).json()
    missing_key = post(client, path(task, turn, "prepare"),
                       prepare_body(client, task, turn, model, researcher_model=remote["id"]))
    assert missing_key.status_code == 422
    assert missing_key.json()["detail"]["code"] == "task_turn_model_key_unavailable"
    assert client.get(path(task, turn)).json()["state"] == "saved"
    assert provider.requests == []


def test_codex_binding_uses_existing_cli_workspace_without_reading_credentials(turn_case, monkeypatch):
    client, app, provider, settings, _, model, task = turn_case
    monkeypatch.delenv("WORKBENCH_MODEL_TURNCODEX_KEY", raising=False)
    codex = post(client, "/api/models", {
        "name": "Local Codex", "kind": "codex_cli", "endpoint": "codex://local",
        "model": "configured-codex", "key_env": "WORKBENCH_MODEL_TURNCODEX_KEY",
    }).json()
    turn = save(client, task)
    prepared = prepare(client, task, turn, model, coordinator_model=codex["id"])
    assert "workspace" not in json.dumps(prepared)
    assert "WORKBENCH_MODEL_TURNCODEX_KEY" not in json.dumps(prepared)
    applied = execute(client, task, prepared)
    assert applied.status_code == 200, applied.text
    run = app.state.store.get("runs", applied.json()["run_id"])
    assert run["context"]["models"][codex["id"]]["workspace"] == str(settings.workspace)
    assert provider.requests == []


def test_prepared_turn_blocks_other_preparation_ordinary_run_and_recovery_paths(turn_case):
    client, app, provider, _, _, model, task = turn_case
    source = failed_source(client, app, task, model)
    recovery = recovery_body(client, source)
    first = save(client, task)
    locked = prepare(client, task, first, model)
    second = save(client, task, "Another message", "another-turn-request")
    denied = post(client, path(task, second, "prepare"), prepare_body(client, task, second, model))
    assert denied.status_code == 409
    assert denied.json()["detail"]["code"] == "task_turn_prepared_pending"
    ordinary = post(client, f"/api/tasks/{task['id']}/runs",
                    run_body(model, request_id="ordinary-while-prepared"))
    assert ordinary.status_code == 409
    assert ordinary.json()["detail"] == "task_turn_prepared_pending"
    assert post(client, f"/api/runs/{source['id']}/resume", {
        "acknowledge_replay": True,
    }).json()["detail"] == "task_turn_prepared_pending"
    assert post(client, f"/api/runs/{source['id']}/recovery-intents", recovery).json()["detail"] == "task_turn_prepared_pending"
    legacy = post(client, f"/api/runs/{source['id']}/retry", {
        **recovery["config"], "snapshot_hash": recovery["snapshot_hash"],
        "request_id": "legacy-while-prepared", "consent": True, "acknowledge_replay": True,
    })
    assert legacy.status_code == 409 and legacy.json()["detail"] == "task_turn_prepared_pending"
    assert client.get(path(task)).json()["prepared"] == locked
    assert len(rows(app.state.store, "runs")) == 1 and provider.requests == []


def test_pending_recovery_and_active_run_prevent_turn_preparation(turn_case):
    client, app, provider, _, _, model, task = turn_case
    turn = save(client, task)
    source = post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).json()
    active = post(client, path(task, turn, "prepare"), prepare_body(client, task, turn, model))
    assert active.status_code == 409
    assert active.json()["detail"]["code"] == "task_turn_run_unfinished"
    app.state.store.finish_run(source["id"], "failed", "synthetic_failure")
    recovery = recovery_body(client, source)
    assert post(client, f"/api/runs/{source['id']}/recovery-intents", recovery).status_code == 200
    pending = post(client, path(task, turn, "prepare"), prepare_body(client, task, turn, model))
    assert pending.status_code == 409
    assert pending.json()["detail"]["code"] == "task_turn_recovery_pending"
    assert client.get(path(task, turn)).json()["state"] == "saved"
    assert provider.requests == []


def test_frozen_preparation_does_not_mutate_an_older_run_or_follow_later_task_edits(turn_case):
    client, app, _, _, _, model, task = turn_case
    old = failed_source(client, app, task, model)
    old_run = app.state.store.get("runs", old["id"])
    prepared = prepare(client, task, save(client, task), model)
    frozen = prepared["candidate"]["snapshot"]
    with app.state.store.transaction() as db:
        db.execute(
            "UPDATE tasks SET goal='Later goal must not be executed',acceptance='Later acceptance' WHERE id=?",
            (task["id"],),
        )
        db.execute(
            "UPDATE projects SET notes='Later project notes' WHERE id=?",
            (task["project_id"],),
        )
    applied = execute(client, task, prepared)
    assert applied.status_code == 200, applied.text
    new_run = app.state.store.get("runs", applied.json()["run_id"])
    assert new_run["context"]["goal"] == frozen["goal"]
    assert new_run["context"]["acceptance"] == frozen["acceptance"]
    assert new_run["context"]["notes"] == frozen["notes"]
    assert app.state.store.get("runs", old["id"]) == old_run
    assert post(client, path(task, prepared, "preview"), {}).json() == frozen


@pytest.mark.parametrize("changes", [
    {"consent": False}, {"consent": 1}, {"consent": "true"}, {"candidate_hash": "invalid"},
    {"extra": True}, {"request_id": "new-id-for-execution"}, {"max_calls": 5},
])
def test_execute_requires_exact_typed_consent_and_candidate(turn_case, changes):
    client, app, provider, _, _, model, task = turn_case
    prepared = prepare(client, task, save(client, task), model)
    response = execute(client, task, prepared, **changes)
    assert response.status_code == 422, response.text
    assert client.get(path(task, prepared)).json() == prepared
    assert rows(app.state.store, "runs") == [] and provider.requests == []


def test_execute_exactly_once_frozen_snapshot_and_response_loss_reconciliation(turn_case):
    client, app, provider, settings, _, model, task = turn_case
    save(client, task, "PREVIOUS_MESSAGE_NEVER_SENT", "previous-turn-request")
    original_task = app.state.store.get("tasks", task["id"])
    prepared = prepare(client, task, save(client, task, "SELECTED_MESSAGE"), model)
    (settings.workspace / "README.md").write_text("Later unconfirmed source")
    wrong = execute(client, task, prepared, candidate_hash="0" * 64)
    assert wrong.status_code == 409
    assert wrong.json()["detail"]["code"] == "task_turn_candidate_conflict"
    # Discard the successful mutation body, as if its response were lost.
    assert execute(client, task, prepared).status_code == 200
    recreated = TaskTurnService(Store(settings.data_dir), settings.workspace)
    applied = recreated.read(task["id"], prepared["id"])
    assert applied["state"] == "applied" and applied["run_id"]
    assert applied["candidate"] == prepared["candidate"]
    assert recreated.by_request(task["id"], prepared["request_id"]) == applied
    assert execute(client, task, prepared).json() == applied
    assert post(client, path(task, prepared, "prepare"), {
        **prepared["candidate"]["config"],
        "context_hash": prepared["candidate"]["snapshot"]["context_hash"],
    }).json() == applied
    assert client.get(path(task)).json()["prepared"] is None
    runs = rows(app.state.store, "runs")
    assert len(runs) == 1
    run = app.state.store.get("runs", applied["run_id"])
    assert run["request_id"] == prepared["request_id"] and run["status"] == "queued"
    assert run["task_id"] == task["id"]
    assert run["config"] == prepared["candidate"]["config"]
    assert run["context"]["hash"] == prepared["candidate"]["snapshot"]["context_hash"]
    assert run["context"]["text"] == prepared["candidate"]["snapshot"]["text"]
    assert "SELECTED_MESSAGE" in run["context"]["goal"]
    assert "PREVIOUS_MESSAGE_NEVER_SENT" not in json.dumps(run["context"])
    assert "Later unconfirmed source" not in json.dumps(run["context"])
    assert app.state.store.get("tasks", task["id"]) == original_task
    assert len([event for event in rows(app.state.store, "events") if event["kind"] == "task.turn.applied"]) == 1
    assert len([event for event in rows(app.state.store, "events") if event["kind"] == "run.queued"]) == 1
    assert provider.requests == []


def test_execute_revalidates_model_definition_but_does_not_reread_files(turn_case, monkeypatch):
    client, app, provider, _, _, model, task = turn_case
    prepared = prepare(client, task, save(client, task), model)
    with app.state.store.transaction() as db:
        db.execute("UPDATE models SET model='changed-unconfirmed-model' WHERE id=?", (model["id"],))

    def no_snapshot(*args):
        raise AssertionError("Execution uses the frozen context")

    monkeypatch.setattr("workbench.task_turns.snapshot", no_snapshot)
    response = execute(client, task, prepared)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "task_turn_model_changed"
    assert client.get(path(task, prepared)).json() == prepared
    assert rows(app.state.store, "runs") == [] and provider.requests == []


def test_model_test_metadata_does_not_invalidate_an_exact_execution_candidate(turn_case):
    client, app, provider, _, _, model, task = turn_case
    prepared = prepare(client, task, save(client, task), model)
    with app.state.store.transaction() as db:
        db.execute(
            "UPDATE models SET tested_at='2026-11-21T00:00:00+00:00',test_status='ok' WHERE id=?",
            (model["id"],),
        )
    response = execute(client, task, prepared)
    assert response.status_code == 200, response.text
    assert response.json()["state"] == "applied"
    assert provider.requests == []


def test_concurrent_saves_preparations_and_execution_are_serialized_across_stores(turn_case):
    client, app, provider, settings, _, model, task = turn_case
    services = [TaskTurnService(Store(settings.data_dir), settings.workspace) for _ in range(2)]
    body = TaskTurnCreate(request_id="concurrent-turn-save", content="Same immutable message")
    with ThreadPoolExecutor(max_workers=2) as pool:
        values = list(pool.map(lambda service: service.save(task["id"], body), services))
    assert values[0] == values[1]
    first = values[0]
    second = save(client, task, "Another preparation", "concurrent-turn-other")
    bodies = [
        TaskTurnPrepare(**prepare_body(client, task, turn, model))
        for turn in (first, second)
    ]

    def attempt_prepare(index):
        try:
            return services[index].prepare(task["id"], (first, second)[index]["id"], bodies[index])
        except TaskTurnError as error:
            return error.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        prepared = list(pool.map(attempt_prepare, range(2)))
    winners = [value for value in prepared if isinstance(value, dict)]
    assert len(winners) == 1
    assert prepared.count("task_turn_prepared_pending") == 1
    winner = winners[0]
    execution = TaskTurnExecute(candidate_hash=winner["candidate"]["candidate_hash"], consent=True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(
            lambda service: service.execute(task["id"], winner["id"], execution), services,
        ))
    assert results[0] == results[1] and results[0]["state"] == "applied"
    assert len(rows(app.state.store, "runs")) == 1 and provider.requests == []


@pytest.mark.parametrize("operation", ["save", "prepare", "execute"])
def test_turn_mutation_and_events_rollback_together(turn_case, monkeypatch, operation):
    client, app, provider, _, _, model, task = turn_case
    service = app.state.task_turns
    if operation != "save":
        turn = save(client, task)
        body = TaskTurnPrepare(**prepare_body(client, task, turn, model))
    if operation == "execute":
        turn = service.prepare(task["id"], turn["id"], body)
    tables = ("task_turns", "runs", "events")
    before = {table: rows(app.state.store, table) for table in tables}
    event = app.state.store.event

    def fail_event(db, kind, *args, **kwargs):
        if kind == f"task.turn.{ {'save': 'saved', 'prepare': 'prepared', 'execute': 'applied'}[operation]}":
            raise RuntimeError("synthetic event failure")
        return event(db, kind, *args, **kwargs)

    monkeypatch.setattr(app.state.store, "event", fail_event)
    with pytest.raises(RuntimeError, match="synthetic event failure"):
        if operation == "save":
            service.save(task["id"], TaskTurnCreate(
                request_id="rollback-turn-request", content="Must not persist without its event",
            ))
        elif operation == "prepare":
            service.prepare(task["id"], turn["id"], body)
        else:
            service.execute(task["id"], turn["id"], TaskTurnExecute(
                candidate_hash=turn["candidate"]["candidate_hash"], consent=True,
            ))
    assert {table: rows(app.state.store, table) for table in tables} == before
    assert provider.requests == []


def test_task_turn_endpoints_inherit_auth_and_csrf_boundary(turn_case):
    client, _, _, settings, _, _, task = turn_case
    assert client.post(path(task), json={
        "request_id": "csrf-rejected-turn", "content": "Must not save without boundary",
    }).status_code == 403
    assert client.post(path(task), json={
        "request_id": "origin-rejected-turn", "content": "Must not save cross origin",
    }, headers={**HEADERS, "Origin": "https://other.example"}).status_code == 403
    protected = create_app(Settings(
        settings.data_dir, settings.workspace, access_token="a" * 32,
    ), FakeProvider())
    with TestClient(protected) as private:
        assert private.get(path(task)).status_code == 401
        assert post(private, path(task), {
            "request_id": "auth-rejected-turn", "content": "Must not save without session",
        }).status_code == 401


def test_explicit_turn_execution_reaches_existing_harness_with_selected_context(turn_case):
    client, app, provider, _, _, model, task = turn_case
    save(client, task, "PREVIOUS_SUPPLEMENT_EXCLUDED", "previous-turn-request")
    prepared = prepare(client, task, save(client, task, "SELECTED_SUPPLEMENT_FOR_HARNESS"), model)
    assert provider.requests == []
    with TestClient(app) as worker:
        response = execute(worker, task, prepared)
        assert response.status_code == 200, response.text
        run_id = response.json()["run_id"]
        completed = wait_status(worker, run_id, {"succeeded", "failed"})
        assert completed["run"]["status"] == "succeeded", completed
        assert len(completed["calls"]) == len(provider.requests) == 4
        sent = json.dumps(provider.requests, ensure_ascii=False)
        assert "SELECTED_SUPPLEMENT_FOR_HARNESS" in sent
        assert "PREVIOUS_SUPPLEMENT_EXCLUDED" not in sent
        assert worker.get(path(task, prepared)).json()["run_id"] == run_id
