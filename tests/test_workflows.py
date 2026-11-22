import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from test_workbench import FakeProvider, HEADERS, post, run_body, seed, wait_status
from test_task_turns import path as turn_path, prepare_body, save as save_turn
from workbench.app import create_app
from workbench.config import Settings
from workbench.store import Store
from workbench.workflows import (
    WorkflowError, WorkflowPublish, WorkflowSave, WorkflowService, builtin_definition, fingerprint,
)


ROOT = "/api/workflows/local-research"
TABLES = ("workflow_drafts", "workflow_versions", "workflow_operations")


@pytest.fixture
def workflow_case(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "README.md").write_text("Selected source 研发资料", encoding="utf-8")
    settings = Settings(tmp_path / "data", workspace, poll_interval=0.01)
    provider = FakeProvider()
    app = create_app(settings, provider)
    client = TestClient(app)
    project, model, task = seed(client)
    yield client, app, provider, settings, project, model, task
    client.close()


def all_rows(store, table):
    with store.transaction() as db:
        return [dict(row) for row in db.execute(f"SELECT * FROM {table} ORDER BY rowid")]


def definition(model, **changes):
    value = builtin_definition()
    for stage in value["stages"]:
        stage["model_id"] = model["id"]
    return {**value, **changes}


def saved(client, value, request_id="workflow-save-request"):
    before = client.get(ROOT).json()
    body = {"request_id": request_id, "expected_revision": before["revision"], "definition": value}
    response = post(client, f"{ROOT}/draft", body)
    assert response.status_code == 200, response.text
    return response.json()["result"], body


def impact(client, bundle):
    return client.get(f"{ROOT}/impact", params={
        "revision": bundle["revision"], "definition_hash": bundle["definition_hash"],
    })


def publication(client, bundle, request_id="workflow-publish-request"):
    result = impact(client, bundle)
    assert result.status_code == 200, result.text
    return {
        "request_id": request_id, "expected_revision": bundle["revision"],
        "definition_hash": bundle["definition_hash"], "impact_hash": result.json()["impact_hash"],
        "consent": True,
    }


def published(client, value, suffix="one"):
    bundle, _ = saved(client, value, f"workflow-save-{suffix}")
    body = publication(client, bundle, f"workflow-publish-{suffix}")
    response = post(client, f"{ROOT}/publish", body)
    assert response.status_code == 200, response.text
    return response.json()["result"]


def test_default_draft_migration_only_adds_new_tables_and_no_old_rows_or_events(workflow_case):
    client, app, provider, settings, _, _, _ = workflow_case
    store = app.state.store
    with store.transaction() as db:
        names = [row[0] for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        ) if row[0] not in TABLES]
        columns = {name: [dict(row) for row in db.execute(f"PRAGMA table_info({name})")] for name in names}
        original = {name: [dict(row) for row in db.execute(f"SELECT * FROM {name} ORDER BY rowid")] for name in names}
        for name in reversed(TABLES):
            db.execute(f"DROP TABLE {name}")
    recreated = Store(settings.data_dir)
    with recreated.transaction() as db:
        assert {name: [dict(row) for row in db.execute(f"PRAGMA table_info({name})")] for name in names} == columns
        assert {name: [dict(row) for row in db.execute(f"SELECT * FROM {name} ORDER BY rowid")] for name in names} == original
    bundle = client.get(ROOT).json()
    assert set(bundle) == {
        "schema_version", "workflow_id", "revision", "definition", "definition_hash", "updated_at", "published",
    }
    assert bundle["schema_version"] == bundle["revision"] == 1
    assert bundle["workflow_id"] == "local-research" and bundle["published"] is None
    assert bundle["definition"] == builtin_definition()
    assert bundle["definition_hash"] == fingerprint(bundle["definition"])
    assert client.get("/api/bootstrap").json()["capabilities"]["workflow_versions"] is True
    assert WorkflowService(Store(settings.data_dir)).read() == bundle
    assert all_rows(recreated, "workflow_versions") == all_rows(recreated, "workflow_operations") == []
    assert impact(client, bundle).status_code == 422
    assert provider.requests == []


def test_save_cas_idempotent_ledger_and_read_are_distinct_facts(workflow_case):
    client, app, provider, settings, _, model, _ = workflow_case
    value = definition(model, name="  研发研究  ")
    value["stages"][0]["instructions"] = "  Preserve this stage whitespace\n"
    bundle, body = saved(client, value)
    receipt = client.get(f"{ROOT}/operations/{body['request_id']}").json()
    assert set(receipt) == {"request_id", "kind", "candidate_hash", "state", "result"}
    assert receipt["kind"] == "save" and receipt["state"] == "applied"
    assert receipt["result"] == bundle and bundle["revision"] == 2
    assert bundle["definition"]["name"] == "研发研究"
    assert bundle["definition"]["stages"][0]["instructions"] == value["stages"][0]["instructions"]
    normalized = {**body, "definition": bundle["definition"]}
    assert receipt["candidate_hash"] == fingerprint(["save", {
        key: val for key, val in normalized.items() if key != "request_id"
    }])
    assert post(client, f"{ROOT}/draft", body).json() == receipt
    newer, _ = saved(client, definition(model, name="Newer draft"), "workflow-save-newer")
    assert newer["revision"] == 3
    assert client.get(ROOT).json() != receipt["result"]
    assert client.get(f"{ROOT}/operations/{body['request_id']}").json() == receipt
    assert WorkflowService(Store(settings.data_dir)).operation(body["request_id"]) == receipt
    stale = post(client, f"{ROOT}/draft", {**body, "request_id": "workflow-stale-revision"})
    assert stale.status_code == 409 and stale.json()["detail"]["code"] == "workflow_revision_conflict"
    conflict = post(client, f"{ROOT}/draft", {**body, "definition": definition(model, name="Changed candidate")})
    assert conflict.status_code == 409 and conflict.json()["detail"]["code"] == "workflow_request_conflict"
    assert len(all_rows(app.state.store, "workflow_operations")) == 2
    assert provider.requests == []


def invalid_definition(case, model):
    value = definition(model)
    if case == "extra": value["unknown"] = True
    elif case == "bool-schema": value["schema_version"] = True
    elif case == "schema": value["schema_version"] = 2
    elif case == "blank-name": value["name"] = " \n "
    elif case == "long-name": value["name"] = "中" * 81
    elif case == "harness": value["harness"] = "shell-executor"
    elif case == "stage-order": value["stages"].reverse()
    elif case == "stage-role": value["stages"][1]["role"] = "reviewer"
    elif case == "stage-extra": value["stages"][1]["tools"] = ["shell"]
    elif case == "stage-missing": value["stages"].pop()
    elif case == "instruction-long": value["stages"][0]["instructions"] = "中" * 2001
    elif case == "instruction-type": value["stages"][0]["instructions"] = False
    elif case == "model-empty": value["stages"][0]["model_id"] = ""
    elif case == "model-space": value["stages"][0]["model_id"] = " model-id "
    elif case == "model-type": value["stages"][0]["model_id"] = 1
    elif case == "limit-extra": value["limits"]["call_timeout_seconds"] = 300
    elif case == "limit-bool": value["limits"]["max_calls"] = True
    elif case == "calls-low": value["limits"]["max_calls"] = 2
    elif case == "calls-high": value["limits"]["max_calls"] = 9
    elif case == "parallel": value["limits"]["parallel"] = 3
    elif case == "minutes": value["limits"]["minutes"] = 31
    elif case == "tokens": value["limits"]["max_output_tokens"] = 4097
    elif case == "research-zero": value["limits"]["research_tasks"] = 0
    elif case == "research-three": value["limits"]["research_tasks"] = 3
    elif case == "review": value["review"] = "automatic"
    return value


@pytest.mark.parametrize("case", [
    "extra", "bool-schema", "schema", "blank-name", "long-name", "harness",
    "stage-order", "stage-role", "stage-extra", "stage-missing", "instruction-long",
    "instruction-type", "model-empty", "model-space", "model-type", "limit-extra",
    "limit-bool", "calls-low", "calls-high", "parallel", "minutes", "tokens",
    "research-zero", "research-three", "review",
])
def test_fixed_definition_rejects_unknown_or_invalid_metadata(workflow_case, case):
    client, app, provider, _, _, model, _ = workflow_case
    before = client.get(ROOT).json()
    response = post(client, f"{ROOT}/draft", {
        "request_id": "invalid-workflow-save", "expected_revision": before["revision"],
        "definition": invalid_definition(case, model),
    })
    assert response.status_code == 422, response.text
    assert client.get(ROOT).json() == before
    assert all_rows(app.state.store, "workflow_operations") == []
    assert provider.requests == []


@pytest.mark.parametrize("changes", [
    {"expected_revision": True}, {"expected_revision": 0}, {"expected_revision": "1"},
    {"request_id": "short"}, {"request_id": "invalid/request"}, {"request_id": "valid-id\n"},
    {"expected_revision": 2**100},
    {"consent": True}, {"unknown": None},
])
def test_save_request_strict_and_drafts_allow_unbound_models_without_calls(workflow_case, changes):
    client, _, provider, _, _, _, _ = workflow_case
    response = post(client, f"{ROOT}/draft", {
        "request_id": "workflow-request-valid", "expected_revision": 1,
        "definition": builtin_definition(), **changes,
    })
    assert response.status_code == 422
    assert client.get(ROOT).json()["revision"] == 1
    assert provider.requests == []


def test_impact_binds_saved_revision_unique_model_order_and_workspace_run_denominators(workflow_case):
    client, app, provider, _, _, model, task = workflow_case
    another = post(client, "/api/models", {
        "name": "Second", "endpoint": "http://127.0.0.1:9999/v1", "model": "second-fixture",
    }).json()
    value = definition(model)
    value["stages"][0]["model_id"] = another["id"]
    value["stages"][2]["model_id"] = another["id"]
    bundle, _ = saved(client, value)
    first = post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).json()
    app.state.store.finish_run(first["id"], "failed", "synthetic_failure")
    second = post(client, f"/api/tasks/{task['id']}/runs", run_body(model, request_id="another-counted-run")).json()
    report = impact(client, bundle).json()
    assert set(report) == {
        "workflow_id", "revision", "definition_hash", "impact_hash", "model_ids",
        "active_runs", "historical_runs", "published_version",
    }
    assert report["model_ids"] == [another["id"], model["id"]]
    assert report["active_runs"] == report["historical_runs"] == 1
    assert report["published_version"] is None
    assert second["status"] == "queued" and provider.requests == []
    assert impact(client, {**bundle, "revision": bundle["revision"] + 1}).status_code == 409
    assert impact(client, {**bundle, "definition_hash": "0" * 64}).status_code == 409


@pytest.mark.parametrize("binding", ["unbound", "missing", "key"])
def test_publication_requires_current_configured_model_and_available_key(workflow_case, monkeypatch, binding):
    client, app, provider, _, _, model, _ = workflow_case
    value = definition(model)
    if binding == "unbound":
        value["stages"][1]["model_id"] = None
    elif binding == "missing":
        value["stages"][1]["model_id"] = "unavailable-model"
    else:
        monkeypatch.delenv("WORKBENCH_MODEL_WORKFLOW_KEY", raising=False)
        remote = post(client, "/api/models", {
            "name": "Missing key", "endpoint": "https://example.test/v1",
            "model": "fixture", "key_env": "WORKBENCH_MODEL_WORKFLOW_KEY",
        }).json()
        value["stages"][1]["model_id"] = remote["id"]
    bundle, _ = saved(client, value)
    invalid = impact(client, bundle)
    assert invalid.status_code == 422
    assert invalid.json()["detail"]["code"] in {
        "workflow_model_required", "workflow_model_unavailable", "workflow_model_key_unavailable",
    }
    assert all_rows(app.state.store, "workflow_versions") == []
    assert provider.requests == []


def test_publish_immutable_version_receipt_and_duplicate_content_does_not_create_version(workflow_case):
    client, app, provider, settings, _, model, _ = workflow_case
    value = definition(model)
    value["stages"][0]["instructions"] = "中" * 2000
    bundle, _ = saved(client, value)
    body = publication(client, bundle)
    response = post(client, f"{ROOT}/publish", body)
    assert response.status_code == 200, response.text
    receipt = response.json()
    version = receipt["result"]
    assert set(version) == {"workflow_id", "version", "definition_hash", "definition", "created_at"}
    assert version["version"] == 1 and version["definition"] == value
    assert receipt["candidate_hash"] == fingerprint(["publish", {
        key: val for key, val in body.items() if key != "request_id"
    }])
    assert post(client, f"{ROOT}/publish", body).json() == receipt
    assert client.get(f"{ROOT}/operations/{body['request_id']}").json() == receipt
    assert client.get(f"{ROOT}/versions/1").json() == version
    assert WorkflowService(Store(settings.data_dir)).operation(body["request_id"]) == receipt
    second = published(client, definition(model, name="Different content"), "second")
    assert second["version"] == 2
    again, _ = saved(client, value, "workflow-save-original")
    duplicate = post(client, f"{ROOT}/publish", publication(client, again, "publish-previous-content")).json()["result"]
    assert duplicate == version
    assert client.get(ROOT).json()["published"] == second
    assert len(all_rows(app.state.store, "workflow_versions")) == 2
    assert client.get(f"{ROOT}/versions/1").json() == version
    assert provider.requests == []


@pytest.mark.parametrize("changes", [
    {"consent": False}, {"consent": "true"}, {"consent": 1},
    {"expected_revision": True}, {"definition_hash": "bad"}, {"impact_hash": "bad"},
    {"definition": {}}, {"extra": True},
])
def test_publish_requires_exact_typed_consent_and_fields(workflow_case, changes):
    client, app, provider, _, _, model, _ = workflow_case
    bundle, _ = saved(client, definition(model))
    response = post(client, f"{ROOT}/publish", {**publication(client, bundle), **changes})
    assert response.status_code == 422
    assert all_rows(app.state.store, "workflow_versions") == []
    assert provider.requests == []


@pytest.mark.parametrize("change", ["run", "model", "revision", "key"])
def test_publish_recomputes_impact_inside_transaction_and_rejects_drift(workflow_case, monkeypatch, change):
    client, app, provider, _, _, model, task = workflow_case
    bundle, _ = saved(client, definition(model))
    body = publication(client, bundle)
    if change == "run":
        assert post(client, f"/api/tasks/{task['id']}/runs", run_body(model)).status_code == 201
    elif change == "model":
        with app.state.store.transaction() as db:
            db.execute("UPDATE models SET endpoint='http://127.0.0.1:9998/v1' WHERE id=?", (model["id"],))
    elif change == "revision":
        saved(client, definition(model, name="Concurrent change"), "workflow-concurrent-save")
    else:
        monkeypatch.delenv("WORKBENCH_MODEL_WORKFLOW_KEY", raising=False)
        with app.state.store.transaction() as db:
            db.execute("UPDATE models SET key_env='WORKBENCH_MODEL_WORKFLOW_KEY' WHERE id=?", (model["id"],))
    response = post(client, f"{ROOT}/publish", body)
    assert response.status_code == (422 if change == "key" else 409), response.text
    assert all_rows(app.state.store, "workflow_versions") == []
    assert client.get(f"{ROOT}/operations/{body['request_id']}").status_code == 404
    assert provider.requests == []


def test_model_test_metadata_is_not_a_publication_dependency(workflow_case):
    client, app, _, _, _, model, _ = workflow_case
    bundle, _ = saved(client, definition(model))
    body = publication(client, bundle)
    with app.state.store.transaction() as db:
        db.execute("UPDATE models SET test_status='ok',tested_at='2026-11-21T03:00:00Z' WHERE id=?", (model["id"],))
    assert post(client, f"{ROOT}/publish", body).status_code == 200


def test_version_history_fixed20_newest_order_and_strict_route_parameters(workflow_case):
    client, _, provider, _, _, model, _ = workflow_case
    versions = [published(client, definition(model, name=f"Definition {index}"), f"version-{index:02}") for index in range(23)]
    first = client.get(f"{ROOT}/versions").json()
    assert set(first) == {
        "schema_version", "workflow_id", "items", "total", "requested_page",
        "page", "page_size", "total_pages", "has_more",
    }
    assert [item["version"] for item in first["items"]] == list(range(23, 3, -1))
    assert first["total"] == 23 and first["page_size"] == 20
    assert first["has_more"] is True and first["total_pages"] == 2
    second = client.get(f"{ROOT}/versions?page=999").json()
    assert second["requested_page"] == 999 and second["page"] == 2
    assert second["items"] == list(reversed(versions[:3])) and second["has_more"] is False
    for suffix in [
        "?unknown=1", "/versions?page=1&page=2", "/versions?page_size=100", "/versions?page=0",
        "/versions/0", "/versions/01", "/versions/true", "/versions/1?unknown=true",
        "/operations/short", "/impact?revision=1&revision=2&definition_hash=" + "a" * 64,
    ]:
        assert client.get(f"{ROOT}{suffix}").status_code == 422, suffix
    assert client.get(f"{ROOT}/versions/24").status_code == 404
    assert client.get(f"{ROOT}/operations/missing-operation").status_code == 404
    assert provider.requests == []


def test_workflow_mutation_and_ledger_rollback_with_events(workflow_case, monkeypatch):
    client, app, provider, _, _, model, _ = workflow_case
    bundle, _ = saved(client, definition(model))
    publication_body = WorkflowPublish(**publication(client, bundle))
    before = {table: all_rows(app.state.store, table) for table in (*TABLES, "events")}

    def fail(*args, **kwargs):
        raise RuntimeError("synthetic workflow event failure")

    monkeypatch.setattr(app.state.store, "event", fail)
    with pytest.raises(RuntimeError, match="synthetic workflow event failure"):
        app.state.workflows.publish(publication_body)
    assert {table: all_rows(app.state.store, table) for table in (*TABLES, "events")} == before
    with pytest.raises(RuntimeError, match="synthetic workflow event failure"):
        app.state.workflows.save(WorkflowSave(
            request_id="rolled-back-draft", expected_revision=bundle["revision"],
            definition=definition(model, name="Must roll back"),
        ))
    assert {table: all_rows(app.state.store, table) for table in (*TABLES, "events")} == before
    assert provider.requests == []


def test_workflow_reads_are_query_only_snapshots_and_close_connections(workflow_case, monkeypatch):
    client, app, _, _, _, model, _ = workflow_case
    bundle, body = saved(client, definition(model))
    version = post(client, f"{ROOT}/publish", publication(client, bundle)).json()["result"]
    connections, closed = [], []
    connect = sqlite3.connect

    class TrackedConnection(sqlite3.Connection):
        def close(self):
            closed.append(self)
            return super().close()

    def tracked_connect(*args, **kwargs):
        connection = connect(*args, factory=TrackedConnection, **kwargs)
        connections.append(connection)
        return connection

    monkeypatch.setattr("workbench.workflows.sqlite3.connect", tracked_connect)
    service = app.state.workflows
    assert service.read()["published"] == version
    assert service.versions()["items"] == [version]
    assert service.version(1) == version
    assert service.operation(body["request_id"])["result"] == bundle
    with service.reader() as db:
        assert db.in_transaction
        assert db.execute("PRAGMA query_only").fetchone()[0] == 1
        with pytest.raises(sqlite3.OperationalError, match="readonly"):
            db.execute("DELETE FROM workflow_drafts")
    assert len(connections) == len(closed) == 5
    for db in closed:
        with pytest.raises(sqlite3.ProgrammingError):
            db.execute("SELECT 1")


def test_concurrent_cas_save_and_exact_publish_serialize_across_stores(workflow_case):
    client, app, provider, settings, _, model, _ = workflow_case
    services = [WorkflowService(Store(settings.data_dir)) for _ in range(2)]
    commands = [WorkflowSave(
        request_id=f"concurrent-workflow-{index}", expected_revision=1,
        definition=definition(model, name=f"Candidate {index}"),
    ) for index in range(2)]

    def attempt(index):
        try:
            return services[index].save(commands[index])
        except WorkflowError as error:
            return error.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, range(2)))
    assert results.count("workflow_revision_conflict") == 1
    winner = next(value for value in results if isinstance(value, dict))
    command = WorkflowPublish(**publication(client, winner["result"], "concurrent-publication"))
    with ThreadPoolExecutor(max_workers=2) as pool:
        receipts = list(pool.map(lambda service: service.publish(command), services))
    assert receipts[0] == receipts[1]
    assert len(all_rows(app.state.store, "workflow_versions")) == 1
    assert len(all_rows(app.state.store, "workflow_operations")) == 2
    assert provider.requests == []


def test_new_builtin_run_records_actual_resources_without_publishing_or_backfilling_old_runs(workflow_case):
    client, app, provider, settings, _, model, task = workflow_case
    response = post(client, f"/api/tasks/{task['id']}/runs", run_body(model, max_calls=3, parallel=1))
    assert response.status_code == 201, response.text
    run = response.json()
    snapshot = run["context"]["workflow"]
    assert set(snapshot) == {"workflow_id", "version", "definition_hash", "definition"}
    assert snapshot["version"] is None and snapshot["definition_hash"] == fingerprint(snapshot["definition"])
    assert snapshot["definition"]["limits"]["max_calls"] == 3
    assert snapshot["definition"]["limits"]["parallel"] == 1
    assert all(stage["model_id"] == model["id"] for stage in snapshot["definition"]["stages"])
    assert set(run["config"]) == {
        "coordinator_model", "researcher_model", "reviewer_model", "max_calls",
        "parallel", "minutes", "max_output_tokens",
    }
    assert all_rows(app.state.store, "workflow_versions") == []
    with app.state.store.transaction() as db:
        old_context = {key: value for key, value in run["context"].items() if key != "workflow"}
        db.execute("UPDATE runs SET context=? WHERE id=?", (json.dumps(old_context), run["id"]))
    Store(settings.data_dir)
    assert "workflow" not in app.state.store.get("runs", run["id"])["context"]
    assert provider.requests == []


@pytest.mark.parametrize("version", [True, False, 0, -1, "1", 1.0, 2**100])
def test_run_workflow_selection_is_strict_positive_integer(workflow_case, version):
    client, app, provider, _, _, model, task = workflow_case
    response = post(client, f"/api/tasks/{task['id']}/runs", run_body(model, workflow_version=version))
    assert response.status_code == 422
    assert all_rows(app.state.store, "runs") == [] and provider.requests == []


def test_selected_published_version_requires_exact_resources_and_stays_immutable(workflow_case):
    client, app, provider, _, _, model, task = workflow_case
    value = definition(model)
    value["stages"][0]["instructions"] = "Frozen publication instructions"
    version = published(client, value)
    missing = post(client, f"/api/tasks/{task['id']}/runs", run_body(model, workflow_version=99))
    assert missing.status_code == 404
    mismatch = post(client, f"/api/tasks/{task['id']}/runs", run_body(model, workflow_version=1, max_calls=5))
    assert mismatch.status_code == 409
    assert mismatch.json()["detail"]["code"] == "workflow_run_bindings_mismatch"
    body = run_body(model, workflow_version=1)
    response = post(client, f"/api/tasks/{task['id']}/runs", body)
    assert response.status_code == 201, response.text
    run = response.json()
    assert run["context"]["workflow"] == {key: val for key, val in version.items() if key != "created_at"}
    newer = published(client, definition(model, name="Newer version"), "newer")
    assert newer["version"] == 2
    assert post(client, f"/api/tasks/{task['id']}/runs", body).json() == run
    assert app.state.store.get("runs", run["id"]) == run
    conflict = post(client, f"/api/tasks/{task['id']}/runs", {**body, "workflow_version": 2})
    assert conflict.status_code == 409
    assert provider.requests == []


def test_task_turn_freezes_workflow_as_additional_exact_candidate_outside_context_hash(workflow_case):
    client, app, provider, _, _, model, task = workflow_case
    version = published(client, definition(model))
    turn = save_turn(client, task)
    body = prepare_body(client, task, turn, model, workflow_version=1)
    preview = post(client, turn_path(task, turn, "preview"), {}).json()
    assert "workflow" not in preview
    response = post(client, turn_path(task, turn, "prepare"), body)
    assert response.status_code == 200, response.text
    prepared = response.json()
    selected = prepared["candidate"]["snapshot"]
    assert selected["context_hash"] == preview["context_hash"]
    assert selected["workflow"] == {key: val for key, val in version.items() if key != "created_at"}
    assert "workflow_version" not in prepared["candidate"]["config"]
    assert post(client, turn_path(task, turn, "prepare"), body).json() == prepared
    assert post(client, turn_path(task, turn, "prepare"), {**body, "workflow_version": None}).status_code == 409
    applied = post(client, turn_path(task, turn, "execute"), {
        "candidate_hash": prepared["candidate"]["candidate_hash"], "consent": True,
    }).json()
    assert app.state.store.get("runs", applied["run_id"])["context"]["workflow"] == selected["workflow"]
    assert provider.requests == []


def test_recovery_preserves_original_workflow_and_uses_explicit_override_resources(workflow_case):
    client, app, provider, _, _, model, task = workflow_case
    published(client, definition(model))
    source = post(client, f"/api/tasks/{task['id']}/runs", run_body(model, workflow_version=1)).json()
    app.state.store.finish_run(source["id"], "failed", "synthetic_failure")
    resumed = post(client, f"/api/runs/{source['id']}/resume", {"acknowledge_replay": True})
    assert resumed.status_code == 200
    assert resumed.json()["context"]["workflow"] == source["context"]["workflow"]
    app.state.store.finish_run(source["id"], "failed", "synthetic_failure")
    preview = client.get(f"/api/runs/{source['id']}/retry-preview").json()
    retry = post(client, f"/api/runs/{source['id']}/retry", {
        **preview["defaults"], "max_calls": 5,
        "request_id": "workflow-recovery-run", "snapshot_hash": preview["snapshot_hash"],
        "consent": True, "acknowledge_replay": True,
    })
    assert retry.status_code == 201, retry.text
    child = retry.json()
    assert child["config"]["max_calls"] == 5
    assert child["context"]["workflow"] == source["context"]["workflow"]
    assert child["context"]["workflow"]["definition"]["limits"]["max_calls"] == 4
    assert provider.requests == []


def test_actual_harness_honors_all_three_instructions_and_research_task_limit(workflow_case):
    client, app, provider, _, _, model, task = workflow_case
    value = definition(model)
    value["limits"]["research_tasks"] = 1
    markers = ["PLANNING_CUSTOM_INSTRUCTION", "RESEARCH_CUSTOM_INSTRUCTION", "SYNTHESIS_CUSTOM_INSTRUCTION"]
    for stage, marker in zip(value["stages"], markers):
        stage["instructions"] = marker
    published(client, value)
    with TestClient(app) as worker:
        response = post(worker, f"/api/tasks/{task['id']}/runs", run_body(model, workflow_version=1))
        assert response.status_code == 201, response.text
        run = wait_status(worker, response.json()["id"], {"succeeded", "failed"})
        assert run["run"]["status"] == "succeeded", run
        assert len(run["run"]["plan"]) == 1
        assert len(provider.requests) == len(run["calls"]) == 3
        for index, marker in enumerate(markers):
            prompt = provider.requests[index][1][-1]["content"]
            assert marker in prompt
            assert all(other not in prompt for other in markers if other != marker)
        assert "只读分析任务" in provider.requests[0][1][-1]["content"]
        assert "仅返回 JSON" in provider.requests[0][1][-1]["content"]
        assert "研究计划：" in provider.requests[1][1][-1]["content"]
        assert "不能声称测试通过或代码已经修改" in provider.requests[2][1][-1]["content"]


def test_invalid_recorded_workflow_cannot_reach_a_provider(workflow_case):
    client, app, provider, _, _, model, task = workflow_case
    response = post(client, f"/api/tasks/{task['id']}/runs", run_body(model))
    run = response.json()
    context = run["context"]
    context["workflow"]["definition_hash"] = "0" * 64
    with app.state.store.transaction() as db:
        db.execute("UPDATE runs SET context=? WHERE id=?", (json.dumps(context), run["id"]))
    with TestClient(app) as worker:
        failed = wait_status(worker, run["id"], {"succeeded", "failed"})
        assert failed["run"]["status"] == "failed"
        assert failed["calls"] == [] and provider.requests == []


def test_workflow_api_auth_csrf_and_no_provider_calls_without_run(workflow_case):
    client, app, provider, settings, _, model, _ = workflow_case
    body = {"request_id": "csrf-workflow-request", "expected_revision": 1, "definition": definition(model)}
    assert client.post(f"{ROOT}/draft", json=body).status_code == 403
    assert client.post(f"{ROOT}/draft", json=body, headers={
        **HEADERS, "Origin": "https://other.example",
    }).status_code == 403
    protected = TestClient(create_app(Settings(settings.data_dir, settings.workspace, access_token="a" * 32), provider))
    assert protected.get(ROOT).status_code == 401
    assert post(protected, f"{ROOT}/draft", body).status_code == 401
    protected.close()
    assert all_rows(app.state.store, "workflow_operations") == []
    assert provider.requests == []
