import hashlib
import json
from concurrent.futures import ThreadPoolExecutor

import pytest

from test_devices import DEVICE_SECRET, device_case
from test_device_execution import setup as setup_device, grant, start
from test_task_turns import turn_case, path, save, prepare, prepare_body, execute, rows
from test_workbench import post
from workbench.devices import DeviceError
from workbench.store import Store
from workbench.task_turns import TaskTurnError, TaskTurnExecute


def command(turn, **changes):
    return {"candidate_hash": turn["candidate"]["candidate_hash"], "consent": True, **changes}


def discard(client, task, turn, **changes):
    return post(client, path(task, turn, "discard"), command(turn, **changes))


def test_discard_archives_the_exact_candidate_without_changing_legacy_check_or_public_identity(turn_case):
    client, app, provider, _, _, model, task = turn_case
    turn = prepare(client, task, save(client, task), model)
    stored = rows(app.state.store, "task_turns")[0]
    original_candidate = stored["candidate"]
    response = discard(client, task, turn)
    assert response.status_code == 200, response.text
    result = response.json()
    assert set(result) == set(turn)
    assert result == {**turn, "state": "discarded"}
    after = rows(app.state.store, "task_turns")[0]
    assert after["state"] == "saved" and after["candidate"] is None and after["run_id"] is None
    assert after["discarded_at"] is not None
    assert after["discarded_candidate"] == original_candidate
    for field in ("id", "task_id", "request_id", "content", "created_at"):
        assert after[field] == stored[field]
    candidate = json.loads(after["discarded_candidate"])
    assert candidate["candidate_hash"] == turn["candidate"]["candidate_hash"]
    assert hashlib.sha256(json.dumps(
        [task["id"], turn["id"], candidate["config"], candidate["snapshot"]],
        ensure_ascii=False, sort_keys=True, separators=(",", ":"),
    ).encode()).hexdigest() == candidate["candidate_hash"]
    with app.state.store.transaction() as db:
        schema = db.execute("SELECT sql FROM sqlite_master WHERE name='task_turns'").fetchone()[0]
    assert "state IN ('saved','prepared','applied')" in schema
    assert rows(app.state.store, "runs") == [] and provider.requests == []
    assert client.get("/api/bootstrap").json()["capabilities"]["task_turn_discard"] is True


def test_exact_get_list_save_and_preparation_replays_retain_archived_candidate(turn_case):
    client, app, provider, settings, _, model, task = turn_case
    saved = save(client, task)
    preparation = prepare_body(client, task, saved, model)
    prepared = post(client, path(task, saved, "prepare"), preparation).json()
    result = discard(client, task, prepared).json()
    archived = rows(app.state.store, "task_turns")[0]["discarded_candidate"]
    (settings.workspace / "README.md").write_text("A later source change must not recreate the archived candidate")
    with app.state.store.transaction() as db:
        db.execute("UPDATE models SET model='changed-after-discard' WHERE id=?", (model["id"],))
    assert client.get(path(task, saved)).json() == result
    assert client.get(f"{path(task)}/requests/{saved['request_id']}").json() == result
    listed = client.get(path(task)).json()
    assert listed["items"] == [result] and listed["prepared"] is None and listed["total"] == 1
    assert save(client, task, saved["content"], saved["request_id"]) == result
    assert post(client, path(task, saved, "prepare"), preparation).json() == result
    assert rows(app.state.store, "task_turns")[0]["discarded_candidate"] == archived
    assert rows(app.state.store, "runs") == [] and provider.requests == []


@pytest.mark.parametrize("changes", [
    {"max_calls": 3}, {"context_hash": "0" * 64}, {"reviewer_model": "another-model"},
])
def test_preparation_replay_cannot_change_a_discarded_candidates_original_input(turn_case, changes):
    client, app, provider, _, _, model, task = turn_case
    saved = save(client, task)
    original = prepare_body(client, task, saved, model)
    prepared = post(client, path(task, saved, "prepare"), original).json()
    result = discard(client, task, prepared).json()
    response = post(client, path(task, saved, "prepare"), {**original, **changes})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "task_turn_candidate_conflict"
    assert client.get(path(task, saved)).json() == result
    assert rows(app.state.store, "runs") == [] and provider.requests == []


def test_discard_is_idempotent_and_changed_candidate_hash_cannot_claim_its_receipt(turn_case):
    client, app, provider, _, _, model, task = turn_case
    turn = prepare(client, task, save(client, task), model)
    first = discard(client, task, turn)
    assert first.status_code == 200
    events = rows(app.state.store, "events")
    stored = rows(app.state.store, "task_turns")
    assert discard(client, task, turn).json() == first.json()
    assert discard(client, task, turn, candidate_hash="0" * 64).status_code == 409
    assert rows(app.state.store, "events") == events
    assert rows(app.state.store, "task_turns") == stored
    discarded_events = [event for event in events if event["kind"] == "task.turn.discarded"]
    assert len(discarded_events) == 1
    assert json.loads(discarded_events[0]["payload"]) == {
        "task_id": task["id"], "turn_id": turn["id"],
        "candidate_hash": turn["candidate"]["candidate_hash"], "execution_started": False,
    }
    assert rows(app.state.store, "runs") == [] and provider.requests == []


@pytest.mark.parametrize("changes", [
    {"consent": False}, {"consent": 1}, {"consent": None},
    {"candidate_hash": "invalid"}, {"extra": True},
])
def test_discard_requires_strict_explicit_consent_and_input(turn_case, changes):
    client, app, provider, _, _, model, task = turn_case
    turn = prepare(client, task, save(client, task), model)
    before = rows(app.state.store, "task_turns")
    response = discard(client, task, turn, **changes)
    assert response.status_code == 422, response.text
    assert rows(app.state.store, "task_turns") == before
    assert provider.requests == []


def test_discard_scopes_exact_task_turn_and_owner_authorization(turn_case):
    client, app, provider, _, project, model, task = turn_case
    turn = prepare(client, task, save(client, task), model)
    other = post(client, "/api/tasks", {
        "project_id": project["id"], "title": "Different Task", "goal": "Keep discard bound to the original Task",
    }).json()
    assert discard(client, other, turn).status_code == 404
    assert post(client, path(task, {"id": "missing-turn"}, "discard"), command(turn)).status_code == 404
    assert post(client, path(task, turn, "discard") + "?unknown=1", command(turn)).status_code == 422
    assert client.post(path(task, turn, "discard"), json=command(turn)).status_code == 403
    assert client.get(path(task, turn)).json() == turn
    assert provider.requests == []


def test_saved_and_applied_turns_cannot_be_discarded(turn_case):
    client, app, provider, _, _, model, task = turn_case
    saved = save(client, task)
    assert post(client, path(task, saved, "discard"), {
        "candidate_hash": "0" * 64, "consent": True,
    }).status_code == 409
    prepared = prepare(client, task, saved, model)
    applied = execute(client, task, prepared)
    assert applied.status_code == 200
    response = discard(client, task, prepared)
    assert response.status_code == 409 and response.json()["detail"]["code"] == "task_turn_discard_conflict"
    assert client.get(path(task, prepared)).json() == applied.json()
    stored = rows(app.state.store, "task_turns")[0]
    assert stored["discarded_at"] is stored["discarded_candidate"] is None
    assert execute(client, task, prepared).json() == applied.json()
    assert len(rows(app.state.store, "runs")) == 1 and provider.requests == []


def test_discarded_turn_cannot_preview_execute_or_resurrect_and_releases_only_its_prepared_lock(turn_case):
    client, app, provider, _, _, model, task = turn_case
    first = prepare(client, task, save(client, task), model)
    second = save(client, task, "Explicitly start a different candidate", "next-task-turn-request")
    second_body = prepare_body(client, task, second, model)
    assert post(client, path(task, second, "prepare"), second_body).status_code == 409
    archived = discard(client, task, first).json()
    assert post(client, path(task, first, "preview"), {}).status_code == 409
    rejected = execute(client, task, first)
    assert rejected.status_code == 409 and rejected.json()["detail"]["code"] == "task_turn_discarded"
    prepared_second = post(client, path(task, second, "prepare"), second_body)
    assert prepared_second.status_code == 200, prepared_second.text
    assert prepared_second.json()["state"] == "prepared"
    assert prepared_second.json()["candidate"]["candidate_hash"] != first["candidate"]["candidate_hash"]
    listed = client.get(path(task)).json()
    assert listed["prepared"] == prepared_second.json()
    assert next(item for item in listed["items"] if item["id"] == first["id"]) == archived
    assert rows(app.state.store, "runs") == [] and provider.requests == []


def test_owner_discard_supersedes_current_device_grant_but_not_its_original_immutable_receipt(device_case):
    device, turn, body = setup_device(device_case)
    owner, paired, app, provider, *_ = device_case
    receipt = grant(device_case, device, body)
    public = receipt["grant"]
    grants_before = rows(app.state.store, "device_execution_grants")
    result = discard(owner, device_case[-1], turn)
    assert result.status_code == 200 and result.json()["state"] == "discarded"
    assert paired.get("/api/device/execution-grants").json()["grant"]["state"] == "superseded"
    assert paired.get(f"/api/device/execution-grants/{public['id']}").json()["grant"]["state"] == "superseded"
    owner_current = owner.get(f"/api/devices/{device['id']}/execution").json()
    assert owner_current["prepared"] is None and owner_current["grant"]["state"] == "superseded"
    assert owner.get(f"/api/devices/{device['id']}/execution-operations/{body['request_id']}").json() == receipt
    assert grant(device_case, device, body) == receipt
    assert rows(app.state.store, "device_execution_grants") == grants_before
    assert start(device_case, public["id"], turn).status_code == 409
    assert discard(paired, device_case[-1], turn).status_code == 403
    assert rows(app.state.store, "runs") == [] and provider.requests == []


def test_discard_and_device_execute_race_have_only_one_legal_winner(device_case):
    device, turn, body = setup_device(device_case)
    owner, paired, app, provider, *_ = device_case
    original = grant(device_case, device, body)
    operation = TaskTurnExecute(**command(turn))

    def invoke(action):
        try:
            if action == "execute":
                result = app.state.device_execution.execute(
                    DEVICE_SECRET, device["id"], body["request_id"], operation,
                )
                return result["grant"]["state"]
            return app.state.task_turns.discard(device["task_id"], turn["id"], operation)["state"]
        except (DeviceError, TaskTurnError):
            return "conflict"

    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(invoke, ["execute", "discard"]))
    assert sorted(results) in (["applied", "conflict"], ["conflict", "discarded"])
    executed = "applied" in results
    assert len(rows(app.state.store, "runs")) == int(executed)
    events = rows(app.state.store, "events")
    assert len([event for event in events if event["kind"] == "run.queued"]) == int(executed)
    assert len([event for event in events if event["kind"] == "task.turn.discarded"]) == int(not executed)
    assert owner.get(f"/api/devices/{device['id']}/execution-operations/{body['request_id']}").json() == original
    current = paired.get(f"/api/device/execution-grants/{body['request_id']}").json()["grant"]
    assert current["state"] == ("applied" if executed else "superseded")
    assert provider.requests == []


def test_discard_archive_migration_preserves_all_legacy_columns_rows_and_prepared_candidate(turn_case):
    client, app, provider, settings, _, model, task = turn_case
    turn = prepare(client, task, save(client, task), model)
    with app.state.store.transaction() as db:
        tables = [row[0] for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )]
        columns = {
            name: [row["name"] for row in db.execute(f'PRAGMA table_info("{name}")')
                   if name != "task_turns" or row["name"] not in {"discarded_at", "discarded_candidate"}]
            for name in tables
        }
        before = {
            name: [dict(row) for row in db.execute(
                f'SELECT {",".join(columns[name])} FROM "{name}" ORDER BY rowid',
            )] for name in tables
        }
        db.execute("ALTER TABLE task_turns DROP COLUMN discarded_candidate")
        db.execute("ALTER TABLE task_turns DROP COLUMN discarded_at")
    Store(settings.data_dir)
    with app.state.store.transaction() as db:
        after = {
            name: [dict(row) for row in db.execute(
                f'SELECT {",".join(columns[name])} FROM "{name}" ORDER BY rowid',
            )] for name in tables
        }
        assert after == before
        migrated = dict(db.execute("SELECT * FROM task_turns WHERE id=?", (turn["id"],)).fetchone())
        assert migrated["discarded_at"] is migrated["discarded_candidate"] is None
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert client.get(path(task, turn)).json() == turn
    result = discard(client, task, turn)
    assert result.status_code == 200
    assert result.json()["candidate"] == turn["candidate"]
    assert rows(app.state.store, "runs") == [] and provider.requests == []
