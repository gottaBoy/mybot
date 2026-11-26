import json
import sqlite3

import pytest

from test_devices import (
    DEVICE_SECRET, claim, create_pair, device_case, revoke, rows,
)
from test_workbench import HEADERS
from workbench.devices import DeviceError, DeviceService
from workbench.store import dump


def history_fixture(case, count=23):
    owner, companion, app, provider, settings, project, model, task = case
    create_pair(owner, task)
    device = claim(companion).json()
    with app.state.store.transaction() as db:
        db.execute(
            "INSERT INTO tasks VALUES('other-task',?,'Private task','Private goal','','[]',?)",
            (project["id"], "2026-11-24T00:00:00Z"),
        )
        for number in range(count):
            identifier = f"history-{number:03}"
            db.execute(
                "INSERT INTO runs(id,task_id,request_id,status,config,context,created_at)"
                " VALUES(?,?,?,'succeeded',?,?,?)",
                (identifier, task["id"], identifier, dump({"hidden_model": model["id"]}),
                 dump({"private_text": "HIDDEN FILES"}), f"2026-11-24T00:{number:02}:00Z"),
            )
        db.execute(
            "INSERT INTO runs(id,task_id,request_id,status,config,context,created_at)"
            " VALUES('other-run','other-task','other-run','failed','{}','{}',?)",
            ("2026-11-24T01:00:00Z",),
        )
        if count:
            for number in (0, count - 1):
                db.execute(
                    "INSERT INTO artifacts(id,run_id,agent_id,title,kind,content,created_at)"
                    " VALUES(?,?,NULL,?,'report',?,?)",
                    (f"artifact-{number}", f"history-{number:03}", f"Report {number}",
                     "中" * 20001 if number == 0 else "Latest output",
                     "2026-11-24T01:00:00Z"),
                )
    return device


def test_history_paging_exact_bound_and_selected_old_report(device_case):
    device = history_fixture(device_case)
    owner, companion, app, provider, _, _, _, task = device_case
    before = {name: rows(app.state.store, name) for name in ("runs", "events", "devices", "task_turns")}
    assert owner.get("/api/bootstrap").json()["capabilities"]["device_run_history"] is True
    page = companion.get("/api/device/runs").json()
    assert set(page) == {
        "schema_version", "device_id", "task_id", "items", "total", "requested_page",
        "page", "page_size", "total_pages", "has_more",
    }
    assert page["device_id"] == device["id"] and page["task_id"] == task["id"]
    assert page["total"] == 23 and page["page_size"] == 20 and page["has_more"] is True
    assert [run["id"] for run in page["items"]] == [f"history-{i:03}" for i in range(22, 2, -1)]
    last = companion.get("/api/device/runs?page=999").json()
    assert last["requested_page"] == 999 and last["page"] == 2 and last["has_more"] is False
    assert [run["id"] for run in last["items"]] == ["history-002", "history-001", "history-000"]
    selected = companion.get("/api/device/runs/history-000").json()
    assert set(selected) == {"schema_version", "device_id", "task_id", "run", "report"}
    assert selected["run"] == {
        "id": "history-000", "task_id": task["id"], "status": "succeeded",
        "created_at": "2026-11-24T00:00:00Z",
    }
    assert selected["report"]["title"] == "Report 0"
    assert selected["report"]["truncated"] is True and len(selected["report"]["content"]) == 20000
    assert companion.get("/api/device/runs/history-001").json()["report"] is None
    assert "HIDDEN FILES" not in json.dumps(selected) and "hidden_model" not in json.dumps(page)
    assert {name: rows(app.state.store, name) for name in before} == before
    assert provider.requests == []


def test_empty_history_is_distinct_from_missing_or_cross_task_selection(device_case):
    history_fixture(device_case, count=0)
    companion = device_case[1]
    empty = companion.get("/api/device/runs").json()
    assert empty["items"] == [] and empty["total"] == 0 and empty["total_pages"] == 1
    for identifier in ("missing-run", "other-run"):
        response = companion.get(f"/api/device/runs/{identifier}")
        assert response.status_code == 404
        assert response.json() == {"detail": {"code": "device_run_unavailable"}}


@pytest.mark.parametrize("suffix", [
    "?page=0", "?page=-1", "?page=1&page=2", "?unknown=1", "?page_size=100",
    "?page=999999999999999999999999999", "/history-000?bad=1", "/%20",
])
def test_history_rejects_unsupported_parameters(device_case, suffix):
    history_fixture(device_case)
    assert device_case[1].get(f"/api/device/runs{suffix}").status_code == 422


@pytest.mark.parametrize("suffix", ["", "/history-000"])
def test_scoped_history_requires_exact_cookie_identity_and_active_grant(device_case, suffix):
    device = history_fixture(device_case)
    owner, companion, app, provider, _, _, _, _ = device_case
    path = f"/api/device/runs{suffix}"
    assert owner.get(path).status_code == 401
    companion.headers.pop("X-Workbench-Device-Id")
    assert companion.get(path).status_code == 422
    companion.headers["X-Workbench-Device-Id"] = "other-device"
    assert companion.get(path).status_code == 409
    companion.headers["X-Workbench-Device-Id"] = device["id"]
    assert companion.get(path).status_code == 200
    assert revoke(owner, device).status_code == 200
    assert companion.get(path).status_code == 401
    assert companion.get("/api/bootstrap").status_code == 403
    assert companion.post(path, json={}, headers=HEADERS).status_code == 405
    assert provider.requests == []


def test_history_reader_closes_query_only_snapshots_and_rechecks_expiry(device_case, monkeypatch):
    device = history_fixture(device_case)
    app = device_case[2]
    service = app.state.devices
    connections, closed = [], []
    connect = sqlite3.connect

    class Tracked(sqlite3.Connection):
        def close(self):
            closed.append(self)
            super().close()

    def track(*args, **kwargs):
        connection = connect(*args, factory=Tracked, **kwargs)
        connections.append(connection)
        return connection

    monkeypatch.setattr("workbench.devices.sqlite3.connect", track)
    service.runs(DEVICE_SECRET, 1, device["id"])
    service.run(DEVICE_SECRET, "history-000", device["id"])
    with service.reader() as db:
        assert db.in_transaction and db.execute("PRAGMA query_only").fetchone()[0] == 1
        with pytest.raises(sqlite3.OperationalError):
            db.execute("DELETE FROM runs")
    assert len(connections) == len(closed) == 3
    with app.state.store.transaction() as db:
        db.execute("UPDATE devices SET expires_at='2000-01-01T00:00:00Z'")
    for read in (
        lambda: service.runs(DEVICE_SECRET, 1, device["id"]),
        lambda: service.run(DEVICE_SECRET, "history-000", device["id"]),
    ):
        with pytest.raises(DeviceError) as error:
            read()
        assert error.value.status == 401
