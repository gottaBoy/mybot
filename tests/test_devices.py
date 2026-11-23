import hashlib
import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing

import pytest
from fastapi.testclient import TestClient

from test_workbench import FakeProvider, HEADERS, post, seed
from workbench.app import create_app
from workbench.config import Settings
from workbench.devices import (
    DEVICE_COOKIE, SCOPES, DeviceClaim, DeviceError, DeviceRevoke, DeviceService,
    PairingCreate, command_hash, secret_hash,
)
from workbench.store import Store, dump, now, uid
from workbench.task_turns import TaskTurnCreate, TaskTurnService


TABLES = ("device_pairings", "devices", "device_operations", "device_messages")
PAIR_SECRET = "A" * 43
DEVICE_SECRET = "B" * 43
SECOND_SECRET = "C" * 43


@pytest.fixture
def device_case(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "README.md").write_text("Shared task source", encoding="utf-8")
    settings = Settings(tmp_path / "data", workspace, poll_interval=0.01)
    provider = FakeProvider()
    app = create_app(settings, provider)
    owner = TestClient(app)
    project, model, task = seed(owner)
    companion = TestClient(app)
    yield owner, companion, app, provider, settings, project, model, task
    companion.close()
    owner.close()


def pair_body(task, request_id="device-pair-request", **changes):
    return {
        "request_id": request_id, "task_id": task["id"], "label": "My mobile",
        "pair_secret": PAIR_SECRET, "consent": True, **changes,
    }


def create_pair(owner, task, **changes):
    response = post(owner, "/api/devices/pairings", pair_body(task, **changes))
    assert response.status_code == 200, response.text
    return response.json()


def claim_body(pairing_id="device-pair-request", **changes):
    return {
        "request_id": "device-claim-request", "pairing_id": pairing_id,
        "pair_secret": PAIR_SECRET, "device_name": "Mobile",
        "device_secret": DEVICE_SECRET, **changes,
    }


def claim(companion, **changes):
    response = post(companion, "/api/device/claim", claim_body(**changes))
    assert response.status_code == 200, response.text
    companion.headers["X-Workbench-Device-Id"] = response.json()["id"]
    return response


def revoke(owner, device, **changes):
    return post(owner, f"/api/devices/{device['id']}/revoke", {
        "request_id": "device-revoke-request", "expected_revision": 1, "consent": True, **changes,
    })


def rows(store, table):
    with store.transaction() as db:
        return [dict(row) for row in db.execute(f'SELECT * FROM "{table}" ORDER BY rowid')]


def test_pair_receipt_exact_hash_no_secrets_and_default_migration_preserves_records(device_case):
    owner, companion, app, provider, settings, _, _, task = device_case
    store = app.state.store
    with store.transaction() as db:
        original_tables = [row[0] for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        ) if row[0] not in TABLES]
        original = {table: [dict(row) for row in db.execute(f'SELECT * FROM "{table}"')] for table in original_tables}
        for table in ("device_messages", "devices", "device_pairings", "device_operations"):
            db.execute(f'DROP TABLE "{table}"')
    recreated = Store(settings.data_dir)
    with recreated.transaction() as db:
        assert {table: [dict(row) for row in db.execute(f'SELECT * FROM "{table}"')] for table in original_tables} == original
    assert owner.get("/api/bootstrap").json()["capabilities"]["device_continuation"] is True
    body = pair_body(task)
    receipt = create_pair(owner, task)
    expected = command_hash({"kind": "pair", **body, "pair_secret": secret_hash(PAIR_SECRET)})
    assert receipt == {
        "request_id": body["request_id"], "kind": "pair", "candidate_hash": expected,
        "state": "applied", "result": receipt["result"],
    }
    assert set(receipt["result"]) == {
        "id", "task_id", "label", "created_at", "expires_at", "state", "device_id",
    }
    assert receipt["result"]["state"] == "available"
    assert receipt["result"]["device_id"] is None
    assert receipt["result"]["id"] == body["request_id"]
    assert owner.get(f"/api/devices/operations/{body['request_id']}").json() == receipt
    assert create_pair(owner, task) == receipt
    assert len(rows(store, "device_operations")) == len(rows(store, "device_pairings")) == 1
    private = json.dumps({table: rows(store, table) for table in TABLES})
    assert PAIR_SECRET not in private
    assert secret_hash(PAIR_SECRET) in private
    assert rows(store, "events") == original["events"]
    assert provider.requests == []
    assert companion.get("/api/device/session").json() == {"schema_version": 1, "device": None}


@pytest.mark.parametrize("change", [
    {"label": "Changed device"}, {"task_id": "another-task"}, {"pair_secret": "D" * 43},
])
def test_pair_same_request_changed_candidate_conflicts(device_case, change):
    owner, _, _, _, _, _, _, task = device_case
    create_pair(owner, task)
    response = post(owner, "/api/devices/pairings", pair_body(task, **change))
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "device_request_conflict"


def test_claim_exact_retry_cookie_session_and_one_use_after_response_loss(device_case):
    owner, companion, app, provider, _, _, _, task = device_case
    create_pair(owner, task)
    response = claim(companion)
    device = response.json()
    assert set(device) == {
        "id", "name", "task_id", "pairing_id", "claim_request_id", "scopes",
        "created_at", "expires_at", "revoked_at", "revision",
    }
    assert device["scopes"] == SCOPES
    assert device["task_id"] == task["id"]
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie and "max-age=2592000" in cookie
    assert response.cookies[DEVICE_COOKIE] == DEVICE_SECRET
    assert DEVICE_SECRET not in response.text and PAIR_SECRET not in response.text
    assert companion.get("/api/device/session").json() == {"schema_version": 1, "device": device}
    companion.cookies.clear()
    assert companion.get("/api/device/session").json()["device"] is None
    assert claim(companion).json() == device
    assert companion.cookies[DEVICE_COOKIE] == DEVICE_SECRET
    assert len(rows(app.state.store, "devices")) == 1
    assert post(companion, "/api/device/claim", claim_body(
        request_id="different-claim-request", device_secret=SECOND_SECRET,
    )).status_code == 409
    assert post(companion, "/api/device/claim", claim_body(
        device_name="Changed name",
    )).status_code == 409
    current = owner.get("/api/devices/pairings/device-pair-request").json()
    assert current["state"] == "claimed" and current["device_id"] == device["id"]
    assert owner.get("/api/devices/operations/device-pair-request").json()["result"]["state"] == "available"
    assert provider.requests == []


@pytest.mark.parametrize("cookie", ["", "invalid", DEVICE_SECRET])
def test_device_cookie_presence_never_falls_back_to_loopback_owner(device_case, cookie):
    owner, companion, _, _, _, _, _, task = device_case
    create_pair(owner, task)
    claim(companion)
    companion.cookies.clear()
    companion.cookies.set(DEVICE_COOKIE, cookie)
    auth = companion.get("/api/auth/state").json()
    assert auth["authenticated"] is False and auth["mode"] == "device"
    assert companion.get("/api/bootstrap").status_code == 403
    assert companion.get("/api/projects/query").status_code == 403
    assert owner.get("/api/bootstrap").status_code == 200


@pytest.mark.parametrize("method,path", [
    ("GET", "/api/bootstrap"), ("GET", "/api/tasks/query"), ("GET", "/api/projects/query"),
    ("GET", "/api/models"), ("GET", "/api/workflows/local-research"),
    ("GET", "/api/devices"), ("GET", "/api/devices/operations/device-pair-request"),
    ("GET", "/api/devices/pairings/device-pair-request"),
    ("POST", "/api/projects"), ("POST", "/api/tasks"),
    ("POST", "/api/models/enable-codex"), ("POST", "/api/workflows/local-research/draft"),
    ("POST", "/api/devices/pairings"), ("GET", "/api/device/messages/requests/x/extra"),
])
def test_paired_device_cannot_access_general_api_or_execution(device_case, method, path):
    owner, companion, app, provider, _, _, _, task = device_case
    create_pair(owner, task)
    claim(companion)
    before = {table: rows(app.state.store, table) for table in ("tasks", "runs", "events", "models")}
    response = companion.request(method, path, headers=HEADERS, json={} if method == "POST" else None)
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "device_scope_forbidden"
    assert {table: rows(app.state.store, table) for table in before} == before
    assert provider.requests == []


def test_pairing_expiry_bad_secret_rate_limit_and_no_token_material_in_errors(device_case):
    owner, companion, app, _, _, _, _, task = device_case
    create_pair(owner, task)
    with app.state.store.transaction() as db:
        db.execute("UPDATE device_pairings SET expires_at='2000-01-01T00:00:00+00:00'")
    assert owner.get("/api/devices/pairings/device-pair-request").json()["state"] == "expired"
    expired = post(companion, "/api/device/claim", claim_body())
    assert expired.status_code == 409
    assert expired.json()["detail"]["code"] == "device_pairing_expired"
    for _ in range(7):
        wrong = post(companion, "/api/device/claim", claim_body(pair_secret="Z" * 43))
        assert wrong.status_code == 403
        assert PAIR_SECRET not in wrong.text and DEVICE_SECRET not in wrong.text
    limited = post(companion, "/api/device/claim", claim_body())
    assert limited.status_code == 429
    assert limited.json()["detail"]["code"] == "device_claim_rate_limited"
    assert rows(app.state.store, "devices") == []


@pytest.mark.parametrize("path,body", [
    ("/api/devices/pairings", {"pair_secret": PAIR_SECRET, "bad_secret": DEVICE_SECRET}),
    ("/api/device/claim", {**claim_body(), "device_name": "\ud800"}),
    ("/api/device/claim", {**claim_body(), "pair_secret": PAIR_SECRET + "invalid"}),
    ("/api/device/claim", {**claim_body(), "device_name": {"nested": DEVICE_SECRET}}),
    ("/api/device/logout", {"device_secret": DEVICE_SECRET}),
])
def test_device_validation_never_echoes_secret_inputs(device_case, path, body):
    owner, companion, _, _, _, _, _, _ = device_case
    response = (owner if path.startswith("/api/devices") else companion).post(
        path, headers={**HEADERS, "Content-Type": "application/json"},
        content=json.dumps(body, ensure_ascii=True).encode(),
    )
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "device_input_invalid"}}
    assert PAIR_SECRET not in response.text and DEVICE_SECRET not in response.text


def test_revoke_cas_exact_ledger_and_immediate_future_read_write_denial(device_case):
    owner, companion, app, provider, _, _, _, task = device_case
    create_pair(owner, task)
    device = claim(companion).json()
    assert post(companion, "/api/device/messages", {
        "request_id": "before-device-revoke", "content": "Preserved supplemental requirement",
    }).status_code == 200
    assert revoke(owner, device, expected_revision=2).status_code == 409
    response = revoke(owner, device)
    assert response.status_code == 200
    receipt = response.json()
    assert receipt["result"]["revision"] == 2 and receipt["result"]["revoked_at"] is not None
    assert receipt["candidate_hash"] == command_hash({
        "kind": "revoke", "device_id": device["id"], "request_id": "device-revoke-request",
        "expected_revision": 1, "consent": True,
    })
    assert revoke(owner, device).json() == receipt
    assert owner.get("/api/devices/operations/device-revoke-request").json() == receipt
    assert owner.get("/api/devices").json()["items"][0] == receipt["result"]
    assert companion.get("/api/device/session").json()["device"] is None
    assert companion.get("/api/device/task").status_code == 401
    assert companion.get("/api/device/events", params={"after": 0}).status_code == 401
    assert companion.get("/api/device/messages/requests/before-device-revoke").status_code == 401
    assert post(companion, "/api/device/messages", {
        "request_id": "after-device-revoke", "content": "Must not persist",
    }).status_code == 401
    assert companion.get("/api/bootstrap").status_code == 403
    assert post(companion, "/api/device/claim", claim_body()).status_code == 401
    assert len(rows(app.state.store, "task_turns")) == 1
    assert rows(app.state.store, "runs") == [] and provider.requests == []


def test_expired_device_session_denied_and_logout_only_clears_cookie(device_case):
    owner, companion, app, _, _, _, _, task = device_case
    create_pair(owner, task)
    claim(companion)
    assert post(companion, "/api/device/logout", {}).json() == {"ok": True}
    assert DEVICE_COOKIE not in companion.cookies
    assert rows(app.state.store, "devices")[0]["revoked_at"] is None
    claim(companion)
    with app.state.store.transaction() as db:
        db.execute("UPDATE devices SET expires_at='2000-01-01T00:00:00+00:00'")
    assert companion.get("/api/device/session").json()["device"] is None
    assert companion.get("/api/device/task").status_code == 401
    assert companion.get("/api/bootstrap").status_code == 403


def test_scoped_task_snapshot_is_bounded_minimal_and_read_only(device_case):
    owner, companion, app, provider, _, project, model, task = device_case
    create_pair(owner, task)
    device = claim(companion).json()
    store = app.state.store
    with store.transaction() as db:
        other_task = "private-other-task"
        db.execute(
            "INSERT INTO tasks(id,project_id,title,goal,acceptance,files,created_at) VALUES(?,?,?,?,?,?,?)",
            (other_task, project["id"], "PRIVATE OTHER", "Do not share", "", "[]", now()),
        )
        for number in range(25):
            app.state.task_turns.save_in_transaction(db, task["id"], TaskTurnCreate(
                request_id=f"owner-message-{number:02}", content=f"Message {number}",
            ))
        run_id = uid()
        db.execute(
            "INSERT INTO runs(id,task_id,request_id,status,config,context,created_at) VALUES(?,?,?,'succeeded','{}',?,?)",
            (run_id, task["id"], "device-report-run", dump({"secret": "PRIVATE CONTEXT"}), now()),
        )
        report_id = uid()
        db.execute(
            "INSERT INTO artifacts(id,run_id,agent_id,title,kind,content,created_at)"
            " VALUES(?,?,?,'A report','report',?,?)",
            (report_id, run_id, None, "中" * 20001, now()),
        )
    before = {table: rows(store, table) for table in ("events", "devices", "task_turns")}
    result = companion.get("/api/device/task").json()
    assert set(result) == {"schema_version", "device_id", "task", "latest_run", "messages", "report", "cursor"}
    assert result["device_id"] == device["id"]
    assert result["task"] == {key: task[key] for key in ("id", "title", "goal", "acceptance")}
    assert set(result["latest_run"]) == {"id", "task_id", "status", "created_at"}
    assert result["messages"]["total"] == 25 and len(result["messages"]["items"]) == 20
    assert len(result["report"]["content"]) == 20000 and result["report"]["truncated"] is True
    assert set(result["report"]) == {"id", "run_id", "title", "content", "decision", "truncated"}
    text = json.dumps(result)
    assert "PRIVATE OTHER" not in text and "PRIVATE CONTEXT" not in text
    assert project["notes"] not in text and model["endpoint"] not in text
    assert {table: rows(store, table) for table in before} == before
    assert provider.requests == []


def test_event_cursor_filters_tasks_bounds_pages_and_recovers_watermark(device_case):
    owner, companion, app, _, _, project, _, task = device_case
    create_pair(owner, task)
    device = claim(companion).json()
    store = app.state.store
    with store.transaction() as db:
        for index in range(62):
            store.event(db, "device.fixture.event", {"task_id": task["id"], "private_payload": "HIDDEN"}, entity_id=f"synthetic-{index}")
            store.event(db, "other.private.event", {"task_id": "other-task", "private_payload": "OTHER"}, entity_id="other-task")
    first = companion.get("/api/device/events", params={"after": 0}).json()
    assert set(first) == {
        "schema_version", "device_id", "task_id", "after", "items", "next_cursor", "watermark", "has_more",
    }
    assert len(first["items"]) == 50 and first["has_more"] is True
    assert first["device_id"] == device["id"] and first["task_id"] == task["id"]
    assert first["next_cursor"] == first["items"][-1]["seq"]
    assert all(set(item) == {"seq", "id", "run_id", "kind", "created_at"} for item in first["items"])
    second = companion.get("/api/device/events", params={"after": first["next_cursor"]}).json()
    assert second["has_more"] is False and second["next_cursor"] == first["watermark"] == second["watermark"]
    assert all(item["kind"] != "other.private.event" for item in first["items"] + second["items"])
    assert "HIDDEN" not in json.dumps(first) and "OTHER" not in json.dumps(second)
    assert len({item["id"] for item in first["items"] + second["items"]}) == len(first["items"] + second["items"])
    empty = companion.get("/api/device/events", params={"after": second["next_cursor"]}).json()
    assert empty["items"] == [] and empty["next_cursor"] == second["watermark"]
    assert companion.get("/api/device/events", params={"after": second["watermark"] + 1}).status_code == 409
    snapshot = companion.get("/api/device/task").json()
    assert snapshot["cursor"] == second["watermark"]


def test_message_save_exact_receipt_owner_visibility_no_files_or_provider(device_case, monkeypatch):
    owner, companion, app, provider, _, _, _, task = device_case
    create_pair(owner, task)
    device = claim(companion).json()
    def forbidden(*args):
        raise AssertionError("Device message save cannot read files")
    monkeypatch.setattr("workbench.task_turns.snapshot", forbidden)
    body = {"request_id": "device-message-request", "content": "  From mobile 中文  "}
    saved = post(companion, "/api/device/messages", body)
    assert saved.status_code == 200, saved.text
    message = saved.json()
    assert set(message) == {"id", "request_id", "content", "created_at", "state", "run_id"}
    assert message["content"] == "From mobile 中文" and message["state"] == "saved" and message["run_id"] is None
    assert post(companion, "/api/device/messages", body).json() == message
    assert companion.get("/api/device/messages/requests/device-message-request").json() == message
    assert companion.get("/api/device/messages/requests/owner-request").status_code == 404
    assert post(companion, "/api/device/messages", {**body, "content": "Different text"}).status_code == 409
    turns = owner.get(f"/api/tasks/{task['id']}/turns").json()
    assert turns["items"][0]["id"] == message["id"]
    assert len(rows(app.state.store, "task_turns")) == len(rows(app.state.store, "device_messages")) == 1
    event = [row for row in rows(app.state.store, "events") if row["kind"] == "task.turn.saved"][0]
    assert event["actor"] == f"device:{device['id']}"
    assert rows(app.state.store, "runs") == [] and provider.requests == []


def test_message_receipts_are_bound_to_originating_device_and_task(device_case):
    owner, companion, app, _, _, _, _, task = device_case
    create_pair(owner, task)
    claim(companion)
    body = {"request_id": "device-private-receipt", "content": "Message shared in Task"}
    assert post(companion, "/api/device/messages", body).status_code == 200
    create_pair(owner, task, request_id="second-device-pair")
    second = TestClient(app)
    claim(second, pairing_id="second-device-pair", request_id="second-device-claim", device_secret=SECOND_SECRET)
    assert second.get("/api/device/messages/requests/device-private-receipt").status_code == 404
    assert post(second, "/api/device/messages", body).status_code == 409
    assert second.get("/api/device/task").json()["messages"]["items"][0]["request_id"] == body["request_id"]
    second.close()


def test_device_owner_token_login_clears_scoped_cookie_and_remote_requires_token(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "README.md").write_text("Token-owner test fixture", encoding="utf-8")
    settings = Settings(tmp_path / "data", workspace, access_token="owner-token-" + "x" * 40)
    app = create_app(settings, FakeProvider())
    owner = TestClient(app)
    assert post(owner, "/api/auth", {"token": settings.access_token}).status_code == 200
    _, _, task = seed(owner)
    create_pair(owner, task)
    companion = TestClient(app)
    claim(companion)
    companion.cookies.update(owner.cookies)
    assert companion.get("/api/bootstrap").status_code == 403
    assert post(companion, "/api/auth", {"token": "wrong-token"}).status_code == 401
    assert companion.get("/api/bootstrap").status_code == 403
    assert post(companion, "/api/auth", {"token": settings.access_token}).status_code == 200
    assert DEVICE_COOKIE not in companion.cookies
    assert companion.get("/api/bootstrap").status_code == 200
    without_token = create_app(Settings(tmp_path / "second-data", workspace), FakeProvider())
    remote = TestClient(without_token, client=("198.51.100.2", 1234))
    assert remote.get("/api/device/session").status_code == 403
    assert post(remote, "/api/device/claim", claim_body()).status_code == 403
    for client in (owner, companion, remote):
        client.close()


def test_secure_cookie_host_origin_body_and_parameter_boundaries(device_case):
    owner, companion, app, _, settings, _, _, task = device_case
    create_pair(owner, task)
    settings.secure_cookie = True
    assert "secure" in claim(companion).headers["set-cookie"].lower()
    assert companion.get("/api/device/session", headers={"Host": "hostile.example"}).status_code == 400
    assert post(companion, "/api/device/logout", {}).status_code == 200
    assert companion.post("/api/device/claim", json=claim_body()).status_code == 403
    assert companion.post("/api/device/claim", headers={**HEADERS, "Origin": "https://attacker.test"}, json=claim_body()).status_code == 403
    assert companion.get("/api/device/session", headers={"sec-fetch-site": "cross-site"}).status_code == 403
    for path in ("/api/devices?page=1&page=2", "/api/devices?unknown=1",
                 "/api/device/session?extra=1", "/api/device/events?after=0&after=1"):
        assert owner.get(path).status_code == 422
    for path in ("/api/devices/pairings?extra=1", "/api/device/claim?extra=1"):
        assert post(owner, path, pair_body(task) if "pairings" in path else claim_body()).status_code == 422


def test_concurrent_claim_message_and_revoke_have_atomic_ownership(device_case):
    owner, _, app, provider, settings, _, _, task = device_case
    create_pair(owner, task)
    service = app.state.devices
    bodies = [
        DeviceClaim(**claim_body(request_id=f"concurrent-claim-{index}", device_secret=secret))
        for index, secret in enumerate((DEVICE_SECRET, SECOND_SECRET))
    ]
    def attempt(body):
        try:
            return service.claim(body)
        except DeviceError as error:
            return error.code
    with ThreadPoolExecutor(2) as workers:
        results = list(workers.map(attempt, bodies))
    winners = [result for result in results if isinstance(result, dict)]
    assert len(winners) == 1
    assert "device_pairing_used" in results
    device = winners[0]
    secret = DEVICE_SECRET if device["claim_request_id"] == bodies[0].request_id else SECOND_SECRET
    other_service = DeviceService(Store(settings.data_dir), TaskTurnService(Store(settings.data_dir), settings.workspace))
    def save_then_revoke(operation):
        if operation == "save":
            try:
                return other_service.save_message(secret, TaskTurnCreate(
                    request_id="concurrent-message", content="An atomic supplement",
                ), device["id"])
            except DeviceError as error:
                return error.code
        return service.revoke(device["id"], DeviceRevoke(
            request_id="concurrent-revoke", expected_revision=1, consent=True,
        ))
    with ThreadPoolExecutor(2) as workers:
        outcomes = list(workers.map(save_then_revoke, ("save", "revoke")))
    assert outcomes[1]["result"]["revoked_at"] is not None
    saved = rows(app.state.store, "task_turns")
    assert len(saved) == (1 if isinstance(outcomes[0], dict) else 0)
    with pytest.raises(DeviceError, match="device_session_unavailable"):
        service.save_message(secret, TaskTurnCreate(request_id="after-race-message", content="Cannot bypass revocation"), device["id"])
    assert rows(app.state.store, "runs") == [] and provider.requests == []


def test_device_catalog_pages_twenty_and_keeps_revoked_history(device_case):
    owner, _, app, _, _, _, _, task = device_case
    service = app.state.devices
    devices = []
    for index in range(23):
        pair_id = f"catalog-pair-{index:03}"
        secret = hashlib.sha256(f"catalog-secret-{index}".encode()).hexdigest()[:43]
        service.pair(PairingCreate(**pair_body(task, request_id=pair_id)))
        devices.append(service.claim(DeviceClaim(**claim_body(
            pairing_id=pair_id, request_id=f"catalog-claim-{index:03}", device_secret=secret,
        ))))
    service.revoke(devices[0]["id"], DeviceRevoke(
        request_id="catalog-revoked-device", expected_revision=1, consent=True,
    ))
    first = owner.get("/api/devices?page=1").json()
    second = owner.get("/api/devices?page=2").json()
    assert set(first) == {
        "schema_version", "unit", "items", "total", "requested_page", "page",
        "page_size", "total_pages", "has_more",
    }
    assert first["total"] == second["total"] == 23
    assert first["page_size"] == 20 and first["total_pages"] == 2
    assert len(first["items"]) == 20 and len(second["items"]) == 3
    assert first["has_more"] is True and second["has_more"] is False
    assert len({item["id"] for item in first["items"] + second["items"]}) == 23
    assert second["items"][-1]["id"] == devices[0]["id"]
    assert second["items"][-1]["revoked_at"] is not None
    assert owner.get("/api/devices?page=100").json()["page"] == 2
    assert owner.get("/api/devices?page=100").json()["requested_page"] == 100


def test_public_cookie_grant_survives_backend_restart_but_not_revocation(device_case):
    owner, companion, app, provider, settings, _, _, task = device_case
    create_pair(owner, task)
    device = claim(companion).json()
    recreated = create_app(settings, provider)
    new_companion = TestClient(recreated)
    new_companion.cookies.update(companion.cookies)
    assert new_companion.get("/api/device/session").json()["device"] == device
    assert new_companion.get("/api/device/task").json()["task"]["id"] == task["id"]
    assert revoke(owner, device).status_code == 200
    assert new_companion.get("/api/device/session").json()["device"] is None
    assert new_companion.get("/api/device/task").status_code == 401
    new_companion.close()


@pytest.mark.parametrize("endpoint,method", [
    ("/api/device/task", "GET"), ("/api/device/events?after=0", "GET"),
    ("/api/device/messages/requests/missing-request", "GET"),
    ("/api/device/messages", "POST"),
])
def test_unpaired_scoped_endpoints_do_not_inherit_owner_auth(device_case, endpoint, method):
    owner, _, _, provider, _, _, _, _ = device_case
    body = {"request_id": "unpaired-message", "content": "Must not save"}
    response = owner.request(method, endpoint, headers=HEADERS, json=body if method == "POST" else None)
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "device_session_unavailable"
    assert provider.requests == []


def test_scoped_run_control_preview_artifact_and_task_reads_are_forbidden(device_case):
    owner, companion, app, provider, _, _, model, task = device_case
    create_pair(owner, task)
    claim(companion)
    for method, path in (
        ("GET", f"/api/tasks/{task['id']}/detail"),
        ("GET", f"/api/tasks/{task['id']}/turns"),
        ("POST", f"/api/tasks/{task['id']}/preview"),
        ("POST", f"/api/tasks/{task['id']}/runs"),
        ("POST", f"/api/tasks/{task['id']}/turns"),
        ("GET", "/api/runs/arbitrary"),
        ("GET", "/api/runs/arbitrary/events"),
        ("POST", "/api/runs/arbitrary/pause"),
        ("POST", "/api/runs/arbitrary/cancel"),
        ("POST", "/api/runs/arbitrary/recovery-intents"),
        ("POST", "/api/artifacts/arbitrary/decision"),
        ("POST", f"/api/models/{model['id']}/test"),
    ):
        response = companion.request(method, path, headers=HEADERS, json={} if method == "POST" else None)
        assert response.status_code == 403, (path, response.text)
    assert rows(app.state.store, "runs") == rows(app.state.store, "task_turns") == []
    assert provider.requests == []


def test_ro_device_reads_use_one_query_only_snapshot_and_close_on_success_error(device_case, monkeypatch):
    owner, companion, app, _, _, _, _, task = device_case
    create_pair(owner, task)
    claim(companion)
    service = app.state.devices
    service.save_message(DEVICE_SECRET, TaskTurnCreate(
        request_id="ro-device-message", content="A saved requirement",
    ), companion.headers["X-Workbench-Device-Id"])
    opened, closed = [], []
    original_connect = sqlite3.connect

    class TrackedConnection(sqlite3.Connection):
        def close(self):
            closed.append(self)
            return super().close()

    def connect(*args, **kwargs):
        kwargs["factory"] = TrackedConnection
        connection = original_connect(*args, **kwargs)
        opened.append(connection)
        return connection

    monkeypatch.setattr("workbench.devices.sqlite3.connect", connect)
    service.session(DEVICE_SECRET)
    service.task(DEVICE_SECRET)
    service.events(DEVICE_SECRET, 0)
    service.list()
    service.pairing("device-pair-request")
    service.operation("device-pair-request")
    service.message_receipt(DEVICE_SECRET, "ro-device-message", companion.headers["X-Workbench-Device-Id"])
    with pytest.raises(DeviceError):
        service.operation("unavailable-request")
    with pytest.raises(DeviceError):
        service.task("invalid")
    with service.reader() as db:
        assert db.in_transaction
        assert db.execute("PRAGMA query_only").fetchone()[0] == 1
        with pytest.raises(sqlite3.OperationalError, match="readonly"):
            db.execute("DELETE FROM devices")
    assert len(opened) == len(closed) == 10
    for connection in closed:
        with pytest.raises(sqlite3.ProgrammingError):
            connection.execute("SELECT 1")


def test_message_intent_cannot_follow_a_cookie_switched_by_another_tab(device_case):
    owner, companion, app, provider, _, project, _, task = device_case
    create_pair(owner, task)
    original = claim(companion).json()
    other_task = post(owner, "/api/tasks", {
        "project_id": project["id"], "title": "Other Task",
        "goal": "Different task outside the displayed intent", "files": [],
    }).json()
    create_pair(owner, other_task, request_id="switched-device-pair")
    other_tab = TestClient(app)
    switched = claim(other_tab, pairing_id="switched-device-pair",
                     request_id="switched-device-claim", device_secret=SECOND_SECRET).json()
    # Cookies are shared across real tabs; the visible form still binds the old ID.
    companion.cookies.clear()
    companion.cookies.update(other_tab.cookies)
    body = {"request_id": "old-tab-message", "content": "Intended for the original Task only"}
    mismatch = post(companion, "/api/device/messages", body)
    assert mismatch.status_code == 409
    assert mismatch.json()["detail"]["code"] == "device_identity_changed"
    assert companion.get("/api/device/messages/requests/old-tab-message").status_code == 409
    assert rows(app.state.store, "task_turns") == rows(app.state.store, "device_messages") == []
    companion.headers.pop("X-Workbench-Device-Id")
    assert post(companion, "/api/device/messages", body).status_code == 422
    assert companion.get("/api/device/messages/requests/old-tab-message").status_code == 422
    companion.headers["X-Workbench-Device-Id"] = switched["id"]
    assert post(companion, "/api/device/messages", body).status_code == 200
    saved = rows(app.state.store, "task_turns")
    assert saved[0]["task_id"] == other_task["id"]
    assert saved[0]["task_id"] != original["task_id"]
    assert provider.requests == []
    other_tab.close()
