import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient

import pytest

from test_devices import (
    DEVICE_SECRET, SECOND_SECRET, claim, create_pair, device_case, revoke, rows,
)
from test_task_turns import execute, prepare, save
from test_workbench import HEADERS, post
from workbench.device_execution import ExecutionGrantCreate, ExecutionGrantRevoke
from workbench.devices import DeviceError
from workbench.store import Store
from workbench.task_turns import TaskTurnExecute


def setup(case):
    owner, paired, app, provider, settings, project, model, task = case
    create_pair(owner, task)
    device = claim(paired).json()
    turn = prepare(owner, task, save(owner, task), model)
    body = {
        "request_id": "exact-execution-grant", "turn_id": turn["id"],
        "candidate_hash": turn["candidate"]["candidate_hash"],
        "expected_device_revision": 1, "consent": True,
    }
    return device, turn, body


def grant(case, device, body):
    response = post(case[0], f"/api/devices/{device['id']}/execution-grants", body)
    assert response.status_code == 200, response.text
    return response.json()


def start(case, grant_id, turn, **changes):
    return post(case[1], f"/api/device/execution-grants/{grant_id}/execute", {
        "candidate_hash": turn["candidate"]["candidate_hash"], "consent": True, **changes,
    })


def test_exact_grant_no_execution_or_source_body_leak_and_one_run_receipt(device_case):
    device, turn, body = setup(device_case)
    owner, paired, app, provider, _, _, _, task = device_case
    before = rows(app.state.store, "runs")
    receipt = grant(device_case, device, body)
    public = receipt["grant"]
    assert rows(app.state.store, "runs") == before == []
    assert provider.requests == []
    assert public["state"] == "authorized" and public["run_id"] is None
    assert public["device_id"] == device["id"] and public["task_id"] == task["id"]
    assert public["context_hash"] == turn["candidate"]["snapshot"]["context_hash"]
    assert public["resources"]["max_calls"] == 4
    assert public["source_count"] == 1 and public["source_bytes"] > 0
    assert set(public["models"][0]) == {"role", "id", "name", "model", "kind"}
    serialized = json.dumps(public)
    for secret in ("Shared task source", "README.md", "key_env", "endpoint", DEVICE_SECRET):
        assert secret not in serialized
    assert grant(device_case, device, body) == receipt
    assert owner.get(f"/api/devices/{device['id']}/execution-operations/{body['request_id']}").json() == receipt
    scoped = paired.get("/api/device/execution-grants").json()
    assert scoped["grant"] == public
    result = start(device_case, public["id"], turn)
    assert result.status_code == 200, result.text
    assert result.json()["grant"]["state"] == "applied"
    assert start(device_case, public["id"], turn).json() == result.json()
    assert len(rows(app.state.store, "runs")) == 1 and provider.requests == []
    assert execute(owner, task, turn).json()["run_id"] == result.json()["grant"]["run_id"]
    assert len(rows(app.state.store, "runs")) == 1
    actors = [row["actor"] for row in rows(app.state.store, "events")
              if row["kind"] in ("run.queued", "task.turn.applied", "device.execution.applied")]
    assert actors == [f"device:{device['id']}"] * 3
    Store(device_case[4].data_dir)
    assert paired.get(f"/api/device/execution-grants/{public['id']}").json() == result.json()


@pytest.mark.parametrize("changes", [
    {"consent": False}, {"consent": 1}, {"expected_device_revision": 2},
    {"candidate_hash": "x"}, {"turn_id": ""}, {"request_id": "short"}, {"extra": 1},
])
def test_grant_requires_strict_consent_and_candidate(device_case, changes):
    device, turn, body = setup(device_case)
    response = post(device_case[0], f"/api/devices/{device['id']}/execution-grants", {**body, **changes})
    assert response.status_code == 422
    assert rows(device_case[2].state.store, "device_execution_grants") == []
    assert device_case[3].requests == []


def test_conflicting_candidate_turn_device_scope_and_owner_only_endpoints(device_case):
    device, turn, body = setup(device_case)
    owner, paired, app, provider, _, project, model, task = device_case
    receipt = grant(device_case, device, body)
    for changes in ({"candidate_hash": "0" * 64}, {"turn_id": "missing"}):
        assert post(owner, f"/api/devices/{device['id']}/execution-grants", {**body, **changes}).status_code == 409
    assert post(owner, f"/api/devices/{device['id']}/execution-grants", {
        **body, "request_id": "second-execution-grant",
    }).status_code == 409
    for endpoint in (
        f"/api/devices/{device['id']}/execution",
        f"/api/devices/{device['id']}/execution-operations/{body['request_id']}",
        "/api/bootstrap",
    ):
        assert paired.get(endpoint).status_code == 403
    assert post(paired, f"/api/devices/{device['id']}/execution-grants", body).status_code == 403
    for changes in ({"consent": False}, {"consent": 1}, {"extra": 1}):
        assert start(device_case, receipt["grant"]["id"], turn, **changes).status_code == 422
    assert start(device_case, receipt["grant"]["id"], turn, candidate_hash="0" * 64).status_code == 409
    assert paired.get("/api/device/execution-grants/missing-grant").status_code == 404
    paired.headers["X-Workbench-Device-Id"] = "other-device"
    assert start(device_case, receipt["grant"]["id"], turn).status_code == 409
    assert paired.get("/api/device/execution-grants").status_code == 409
    assert rows(app.state.store, "runs") == [] and provider.requests == []


def test_revoke_before_execute_durable_receipt_and_same_candidate_regrant(device_case):
    device, turn, body = setup(device_case)
    owner, paired, app, provider, *_ = device_case
    public = grant(device_case, device, body)["grant"]
    revoke_body = {"request_id": "execution-revoke-once", "expected_revision": 1, "consent": True}
    endpoint = f"/api/devices/{device['id']}/execution-grants/{public['id']}/revoke"
    receipt = post(owner, endpoint, revoke_body)
    assert receipt.status_code == 200 and receipt.json()["grant"]["state"] == "revoked"
    assert post(owner, endpoint, revoke_body).json() == receipt.json()
    assert start(device_case, public["id"], turn).status_code == 409
    assert paired.get(f"/api/device/execution-grants/{public['id']}").json()["grant"]["state"] == "revoked"
    assert post(owner, endpoint, {**revoke_body, "expected_revision": 2}).status_code == 422
    another = grant(device_case, device, {**body, "request_id": "new-execution-grant"})
    assert another["grant"]["state"] == "authorized"
    assert rows(app.state.store, "runs") == [] and provider.requests == []


def test_expiry_revoked_device_and_changed_models_fail_without_queue(device_case):
    device, turn, body = setup(device_case)
    owner, paired, app, provider, _, _, model, _ = device_case
    public = grant(device_case, device, body)["grant"]
    with app.state.store.transaction() as db:
        db.execute("UPDATE device_execution_grants SET expires_at='2000-01-01T00:00:00+00:00'")
    assert start(device_case, public["id"], turn).status_code == 409
    assert paired.get("/api/device/execution-grants").json()["grant"]["state"] == "expired"
    second = grant(device_case, device, {**body, "request_id": "post-expiry-grant"})["grant"]
    with app.state.store.transaction() as db:
        db.execute("UPDATE models SET model='changed' WHERE id=?", (model["id"],))
    assert start(device_case, second["id"], turn).status_code == 409
    assert rows(app.state.store, "runs") == []
    assert revoke(owner, device).status_code == 200
    assert start(device_case, second["id"], turn).status_code == 401
    assert paired.get("/api/device/execution-grants").status_code == 401
    assert provider.requests == []


def test_owner_execution_supersedes_unused_grant_and_no_device_receipt(device_case):
    device, turn, body = setup(device_case)
    public = grant(device_case, device, body)["grant"]
    assert execute(device_case[0], device_case[-1], turn).status_code == 200
    assert device_case[1].get("/api/device/execution-grants").json()["grant"]["state"] == "superseded"
    assert start(device_case, public["id"], turn).status_code == 409
    assert len(rows(device_case[2].state.store, "runs")) == 1


def test_owner_and_device_concurrent_execution_create_only_one_run(device_case):
    device, turn, body = setup(device_case)
    app = device_case[2]
    grant(device_case, device, body)
    execution = TaskTurnExecute(candidate_hash=body["candidate_hash"], consent=True)

    def invoke(index):
        try:
            if index % 2:
                return app.state.device_execution.execute(DEVICE_SECRET, device["id"], body["request_id"], execution)
            return app.state.task_turns.execute(device["task_id"], turn["id"], execution)
        except DeviceError as error:
            assert error.code == "device_execution_grant_changed"
            return None

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(invoke, range(18)))
    assert any(results)
    assert len(rows(app.state.store, "runs")) == 1
    assert len([r for r in rows(app.state.store, "events") if r["kind"] == "run.queued"]) == 1
    assert device_case[3].requests == []


def test_atomic_revoke_and_execute_race(device_case):
    device, turn, body = setup(device_case)
    app = device_case[2]
    grant(device_case, device, body)

    def invoke(action):
        try:
            if action == "execute":
                return app.state.device_execution.execute(
                    DEVICE_SECRET, device["id"], body["request_id"],
                    TaskTurnExecute(candidate_hash=body["candidate_hash"], consent=True),
                )["grant"]["state"]
            return app.state.device_execution.revoke(device["id"], body["request_id"], ExecutionGrantRevoke(
                request_id="race-revoke-grant", expected_revision=1, consent=True,
            ))["grant"]["state"]
        except DeviceError:
            return "conflict"

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(invoke, ["execute", "revoke"]))
    assert sorted(results) in (["applied", "conflict"], ["conflict", "revoked"])
    assert len(rows(app.state.store, "runs")) == (1 if "applied" in results else 0)


def test_other_recipient_cannot_read_or_execute_grant_even_on_same_task(device_case):
    device, turn, body = setup(device_case)
    owner, paired, app, provider, _, _, _, task = device_case
    grant(device_case, device, body)
    create_pair(owner, task, request_id="another-device-pairing")
    with TestClient(app) as other:
        second = claim(
            other, request_id="another-device-claim", pairing_id="another-device-pairing",
            device_secret=SECOND_SECRET,
        ).json()
        assert other.get(f"/api/device/execution-grants/{body['request_id']}").status_code == 404
        response = post(other, f"/api/device/execution-grants/{body['request_id']}/execute", {
            "candidate_hash": body["candidate_hash"], "consent": True,
        })
        assert response.status_code == 404
        assert other.get("/api/device/execution-grants").json()["grant"] is None
        conflicting = post(owner, f"/api/devices/{second['id']}/execution-grants", {
            **body, "request_id": "other-recipient-grant",
        })
        assert conflicting.status_code == 409
    assert rows(app.state.store, "runs") == [] and provider.requests == []


def test_grant_expiry_is_bounded_by_device_expiry_and_reads_do_not_mutate(device_case):
    device, turn, body = setup(device_case)
    owner, paired, app, provider, *_ = device_case
    expires = (datetime.now(timezone.utc) + timedelta(seconds=120)).isoformat()
    with app.state.store.transaction() as db:
        db.execute("UPDATE devices SET expires_at=? WHERE id=?", (expires, device["id"]))
    public = grant(device_case, device, body)["grant"]
    assert public["expires_at"] == expires
    tables = ("device_execution_grants", "device_execution_operations", "events", "runs", "task_turns")
    before = {table: rows(app.state.store, table) for table in tables}
    owner.get(f"/api/devices/{device['id']}/execution")
    paired.get("/api/device/execution-grants")
    paired.get(f"/api/device/execution-grants/{body['request_id']}")
    assert {table: rows(app.state.store, table) for table in tables} == before
    assert provider.requests == []


def test_unprepared_or_cross_task_candidate_cannot_be_granted(device_case):
    device, turn, body = setup(device_case)
    owner, paired, app, provider, _, project, model, task = device_case
    saved = save(owner, task, request_id="unprepared-execution-turn")
    response = post(owner, f"/api/devices/{device['id']}/execution-grants", {
        **body, "turn_id": saved["id"],
    })
    assert response.status_code == 409
    other = post(owner, "/api/tasks", {
        "project_id": project["id"], "title": "Private other", "goal": "Do not grant across Task boundaries",
    }).json()
    other_turn = prepare(owner, other, save(owner, other, request_id="other-execution-turn"), model)
    response = post(owner, f"/api/devices/{device['id']}/execution-grants", {
        **body, "turn_id": other_turn["id"], "candidate_hash": other_turn["candidate"]["candidate_hash"],
    })
    assert response.status_code == 404
    assert rows(app.state.store, "device_execution_grants") == []
    assert provider.requests == []
