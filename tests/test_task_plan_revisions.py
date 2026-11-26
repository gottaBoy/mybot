import copy
import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from test_task_plans import (
    plan_case, create, endpoint, source_run, succeed_and_review, child_run,
)
from test_task_turns import save, prepare_body, path as turn_path
from test_devices import device_case, create_pair, claim
from test_workbench import fixture, post, run_body, wait_status
from workbench.store import Store
from workbench.task_plan_revisions import PlanRevisionCreate, TaskPlanRevisionService


TABLES = ("task_plan_versions", "task_plan_memberships", "task_plan_revision_operations")
LEGACY = ("task_plans", "task_plan_items", "task_plan_dependencies", "task_plan_operations")


def rows(store, tables):
    with store.transaction() as db:
        return {
            table: [dict(row) for row in db.execute(f"SELECT * FROM {table} ORDER BY rowid")]
            for table in tables
        }


def revision_body(case, items=None):
    current = case[0].get(endpoint(case)).json()["plan"]
    return {
        "expected_version": current["version"], "expected_plan_hash": current["plan_hash"],
        "items": copy.deepcopy(items if items is not None else current["definition"]["items"]),
    }


def revision_preview(case, body):
    return post(case[0], endpoint(case, "/revisions/preview"), body)


def revision_command(case, body, request_id="plan-revision-original"):
    response = revision_preview(case, body)
    assert response.status_code == 200, response.text
    return {**body, "request_id": request_id, "preview_hash": response.json()["preview_hash"], "consent": True}


def revise(case, body, request_id="plan-revision-original"):
    command = revision_command(case, body, request_id)
    response = post(case[0], endpoint(case, "/revisions"), command)
    assert response.status_code == 200, response.text
    return response.json(), command


def add_independent(case):
    case[7]["items"].append({
        "key": "independent", "title": "Independent work", "goal": "Analyze an independent source question",
        "acceptance": "An independently reviewed source report", "files": ["README.md"], "depends_on": [],
    })


def test_v1_and_legacy_rows_remain_exact_after_additive_store_migration(plan_case):
    client, app, _, settings, *_ = plan_case
    created = create(plan_case)
    before = rows(app.state.store, (*LEGACY, "tasks", "events"))
    with app.state.store.transaction() as db:
        columns = {table: [dict(row) for row in db.execute(f"PRAGMA table_info({table})")] for table in before}
        for table in reversed(TABLES):
            db.execute(f"DROP TABLE {table}")
    Store(settings.data_dir)
    assert rows(app.state.store, before) == before
    with app.state.store.transaction() as db:
        assert {
            table: [dict(row) for row in db.execute(f"PRAGMA table_info({table})")]
            for table in before
        } == columns
    assert rows(app.state.store, TABLES) == {table: [] for table in TABLES}
    assert client.get(endpoint(plan_case)).json() == created["result"]
    assert created["result"]["schema_version"] == 1
    historical = client.get(endpoint(plan_case, "/versions/1")).json()
    assert set(historical) == {
        "version", "parent_task_id", "plan_hash", "created_at", "definition", "parent_snapshot", "bindings",
    }
    assert [item["task"] for item in historical["bindings"]] == [
        item["task"] for item in created["result"]["plan"]["items"]
    ]
    assert client.get("/api/bootstrap").json()["capabilities"]["task_plan_revisions"] is True


def test_changed_source_replaces_downstream_without_reusing_old_report_or_task_identity(plan_case):
    client, app, provider, *_ = plan_case
    add_independent(plan_case)
    original = create(plan_case)
    old_items = original["result"]["plan"]["items"]
    source, dependent, independent = [item["task"] for item in old_items]
    old_run, report = succeed_and_review(plan_case, source)
    frozen_run = app.state.store.get("runs", old_run["id"])
    original_rows = rows(app.state.store, LEGACY)
    original_tasks = {task["id"]: app.state.store.get("tasks", task["id"]) for task in (source, dependent, independent)}
    body = revision_body(plan_case)
    body["items"][0]["acceptance"] = "The revised boundary and remaining risks are explicitly reviewed"
    preview = revision_preview(plan_case, body).json()
    assert preview["expected_version"] == preview["baseline"]["version"] == 1
    assert preview["expected_plan_hash"] == preview["baseline"]["plan_hash"]
    assert preview["impact"] == {
        "added_keys": [], "replaced_keys": ["source", "validate"], "reused_keys": ["independent"],
        "removed_keys": [], "retired_task_ids": [source["id"], dependent["id"]], "blockers": [],
    }
    receipt, _ = revise(plan_case, body)
    current = receipt["result"]
    assert receipt["schema_version"] == current["schema_version"] == 2
    assert receipt["operation"] == "revise"
    assert current["plan"]["version"] == 2
    new_source, new_dependent, new_independent = [item["task"] for item in current["plan"]["items"]]
    assert new_source["id"] != source["id"] and new_dependent["id"] != dependent["id"]
    assert new_independent == independent
    assert current["plan"]["items"][1]["gate"]["prerequisites"][0]["task_id"] == new_source["id"]
    assert current["plan"]["items"][1]["gate"]["ready"] is False
    assert current["plan"]["items"][0]["review"]["state"] == "no_run"
    assert rows(app.state.store, LEGACY) == original_rows
    assert {task_id: app.state.store.get("tasks", task_id) for task_id in original_tasks} == original_tasks
    assert app.state.store.get("runs", old_run["id"]) == frozen_run
    assert app.state.store.get("artifacts", report)["decision"] == "accepted"
    for task in (source, dependent):
        retired = client.get(f"/api/tasks/{task['id']}/plan").json()["gate"]
        assert retired["membership"] == "retired" and retired["plan_version"] == 2
        assert retired["ready"] is False and retired["prerequisites"] == []
    assert client.get(endpoint(plan_case, f"/operations/{original['request_id']}")).json() == original
    assert provider.requests == []


def test_dependency_only_change_propagates_fresh_bindings_until_stable(plan_case):
    add_independent(plan_case)
    plan_case[7]["items"][2]["depends_on"] = ["validate"]
    original = create(plan_case)["result"]["plan"]["items"]
    body = revision_body(plan_case)
    body["items"][1]["depends_on"] = []
    preview = revision_preview(plan_case, body).json()
    assert preview["impact"]["replaced_keys"] == ["validate", "independent"]
    assert preview["impact"]["reused_keys"] == ["source"]
    result, _ = revise(plan_case, body)
    current = result["result"]["plan"]["items"]
    assert current[0]["task"] == original[0]["task"]
    assert all(current[index]["task"]["id"] != original[index]["task"]["id"] for index in (1, 2))
    assert current[2]["gate"]["prerequisites"][0]["task_id"] == current[1]["task"]["id"]


def test_empty_revision_is_rejected_but_reordering_preserves_tasks(plan_case):
    original = create(plan_case)["result"]["plan"]["items"]
    body = revision_body(plan_case)
    response = revision_preview(plan_case, body)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "task_plan_revision_unchanged"
    body["items"].reverse()
    preview = revision_preview(plan_case, body).json()
    assert preview["impact"]["replaced_keys"] == preview["impact"]["retired_task_ids"] == []
    result, _ = revise(plan_case, body)
    assert [item["task"] for item in result["result"]["plan"]["items"]] == [
        item["task"] for item in reversed(original)
    ]


def test_removing_and_readding_same_key_never_reactivates_retired_task(plan_case):
    add_independent(plan_case)
    original = create(plan_case)["result"]["plan"]
    removed_id = original["items"][0]["task"]["id"]
    body = revision_body(plan_case)
    body["items"] = [item for item in body["items"] if item["key"] != "source"]
    body["items"][0]["depends_on"] = []
    second, _ = revise(plan_case, body)
    assert second["result"]["plan"]["version"] == 2
    body = revision_body(plan_case, original["definition"]["items"])
    preview = revision_preview(plan_case, body).json()
    assert preview["impact"]["added_keys"] == ["source"]
    third, _ = revise(plan_case, body, "plan-readd-original-key")
    new_id = third["result"]["plan"]["items"][0]["task"]["id"]
    assert new_id != removed_id
    assert plan_case[0].get(f"/api/tasks/{removed_id}/plan").json()["gate"]["membership"] == "retired"
    assert plan_case[0].get(f"/api/tasks/{new_id}/plan").json()["gate"]["membership"] == "current"


@pytest.mark.parametrize("status", ["queued", "running", "paused", "interrupted", "pause_requested", "cancel_requested"])
def test_replacement_blocks_unfinished_runs_and_preserves_preview_without_mutation(plan_case, status):
    client, app, provider, *_ = plan_case
    source = create(plan_case)["result"]["plan"]["items"][0]["task"]
    body = revision_body(plan_case)
    body["items"][0]["title"] = "Changed source task"
    command = revision_command(plan_case, body)
    queued = source_run(plan_case, source)
    with app.state.store.transaction() as db:
        db.execute("UPDATE runs SET status=? WHERE id=?", (status, queued["id"]))
    before = rows(app.state.store, (*TABLES, "tasks"))
    preview = revision_preview(plan_case, body).json()
    assert preview["impact"]["blockers"] == [{"task_id": source["id"], "reasons": ["unfinished_run"]}]
    response = post(client, endpoint(plan_case, "/revisions"), command)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "task_plan_revision_blocked"
    assert rows(app.state.store, before) == before
    assert provider.requests == []


def test_unchanged_queued_sibling_survives_revision_and_claim_records_current_admission(plan_case):
    client, app, provider, *_ = plan_case
    add_independent(plan_case)
    items = create(plan_case)["result"]["plan"]["items"]
    independent = items[2]["task"]
    run = source_run(plan_case, independent)
    old_context = app.state.store.get("runs", run["id"])["context"]
    body = revision_body(plan_case)
    body["items"][0]["goal"] = "Analyze the revised source boundary with explicit evidence"
    revised, _ = revise(plan_case, body)
    assert revised["result"]["plan"]["items"][2]["task"] == independent
    claimed = app.state.store.claim()
    assert claimed["id"] == run["id"] and claimed["status"] == "running"
    assert claimed["context"] == old_context
    assert "plan_version" not in old_context["task_dependencies"]
    with app.state.store.transaction() as db:
        payload = json.loads(db.execute(
            "SELECT payload FROM events WHERE run_id=? AND kind='run.started'", (run["id"],),
        ).fetchone()[0])
    assert payload["task_dependencies"]["plan_version"] == 2
    assert payload["task_dependencies"]["membership"] == "current"
    assert provider.requests == []


@pytest.mark.parametrize("status", ["queued", "running", "paused"])
def test_unfinished_source_with_a_child_is_still_not_safe_to_retire(plan_case, status):
    _, app, provider, *_ = plan_case
    source = create(plan_case)["result"]["plan"]["items"][0]["task"]
    run = source_run(plan_case, source)
    with app.state.store.transaction() as db:
        db.execute("UPDATE runs SET status=? WHERE id=?", (status, run["id"]))
        db.execute(
            "INSERT INTO runs(id,task_id,request_id,status,config,context,source_run_id,created_at)"
            " SELECT 'synthetic-child',task_id,'synthetic-child-request','succeeded',config,context,id,created_at"
            " FROM runs WHERE id=?", (run["id"],),
        )
    body = revision_body(plan_case)
    body["items"][0]["title"] = "Cannot retire the unfinished source"
    preview = revision_preview(plan_case, body).json()
    assert preview["impact"]["blockers"] == [{"task_id": source["id"], "reasons": ["unfinished_run"]}]
    assert provider.requests == []


def test_concurrent_run_admission_and_retirement_have_one_legal_winner(plan_case):
    client, _, provider, settings, *_ = plan_case
    source = create(plan_case)["result"]["plan"]["items"][0]["task"]
    body = revision_body(plan_case)
    body["items"][0]["title"] = "Retire source atomically"
    command = revision_command(plan_case, body)
    service = TaskPlanRevisionService(Store(settings.data_dir))

    def apply_revision():
        from workbench.task_plans import TaskPlanError
        try:
            return 200, service.revise(plan_case[6]["id"], PlanRevisionCreate(**command))
        except TaskPlanError as error:
            return error.status, error.code

    with ThreadPoolExecutor(2) as pool:
        revision_future = pool.submit(apply_revision)
        run_future = pool.submit(child_run, plan_case, source, "revision-competing-run")
        revision_status, result = revision_future.result()
        run = run_future.result()
    assert (revision_status, run.status_code) in {(200, 409), (409, 201)}, (result, run.text)
    if revision_status == 200:
        assert client.get(f"/api/tasks/{source['id']}/plan").json()["gate"]["membership"] == "retired"
    else:
        assert result == "task_plan_revision_blocked"
        assert client.get(endpoint(plan_case)).json()["plan"]["version"] == 1
    assert provider.requests == []


@pytest.mark.parametrize("kind", ["turn", "coding", "recovery"])
def test_unresolved_candidates_cannot_be_retired(plan_case, kind):
    client, app, provider, settings, _, model, parent, definition = plan_case
    if kind == "coding":
        (settings.workspace / "source.py").write_text("value = 1\n")
        (settings.workspace / "test_source.py").write_text(
            "import unittest\nclass Check(unittest.TestCase):\n    def test_value(self): self.assertTrue(True)\n"
        )
        with app.state.store.transaction() as db:
            db.execute("UPDATE tasks SET files=? WHERE id=?",
                       (json.dumps(["source.py", "test_source.py"]), parent["id"]))
        for item in definition["items"]:
            item["files"] = ["source.py", "test_source.py"]
    source = create(plan_case)["result"]["plan"]["items"][0]["task"]
    reason = None
    if kind == "turn":
        turn = save(client, source)
        response = post(client, turn_path(source, turn, "prepare"), prepare_body(client, source, turn, model))
        reason = "prepared_turn"
    elif kind == "coding":
        config = {"model_id": model["id"], "writable": ["source.py"], "tests": ["test_source.py"]}
        preview = post(client, f"/api/tasks/{source['id']}/coding/preview", config).json()
        response = post(client, f"/api/tasks/{source['id']}/coding/prepare", {
            **config, "request_id": "revision-pending-coding", "preview_hash": preview["candidate_hash"],
        })
        reason = "prepared_coding"
    else:
        run = source_run(plan_case, source)
        app.state.store.finish_run(run["id"], "failed")
        retry = client.get(f"/api/runs/{run['id']}/retry-preview").json()
        response = post(client, f"/api/runs/{run['id']}/recovery-intents", {
            "request_id": "revision-pending-recovery", "mode": "retry", "snapshot_hash": retry["snapshot_hash"],
            "config": {**retry["defaults"], "max_calls": max(3, retry["minimum_calls"])},
        })
        with app.state.store.transaction() as db:
            db.execute("UPDATE recovery_intents SET state='unknown' WHERE request_id='revision-pending-recovery'")
        reason = "unresolved_recovery"
    assert response.status_code == 200, response.text
    body = revision_body(plan_case)
    body["items"][0]["title"] = "Replace prepared source"
    preview = revision_preview(plan_case, body).json()
    assert preview["impact"]["blockers"] == [{"task_id": source["id"], "reasons": [reason]}]
    assert post(client, endpoint(plan_case, "/revisions"), {
        **body, "request_id": "blocked-candidate-revision", "preview_hash": preview["preview_hash"], "consent": True,
    }).status_code == 409
    assert provider.requests == []


def test_retired_tasks_block_new_research_turn_and_all_recovery_paths(plan_case):
    client, app, provider, *_ = plan_case
    source = create(plan_case)["result"]["plan"]["items"][0]["task"]
    run = source_run(plan_case, source)
    app.state.store.finish_run(run["id"], "failed")
    retry = client.get(f"/api/runs/{run['id']}/retry-preview").json()
    body = revision_body(plan_case)
    body["items"][0]["title"] = "Fresh source identity"
    revise(plan_case, body)
    assert child_run(plan_case, source, "retired-normal-start").status_code == 409
    turn = save(client, source)
    assert post(client, turn_path(source, turn, "prepare"), prepare_body(client, source, turn, plan_case[5])).status_code == 409
    recovery = {
        "request_id": "retired-new-recovery", "mode": "retry", "snapshot_hash": retry["snapshot_hash"],
        "config": {**retry["defaults"], "max_calls": max(3, retry["minimum_calls"])},
    }
    assert post(client, f"/api/runs/{run['id']}/recovery-intents", recovery).status_code == 409
    assert post(client, f"/api/runs/{run['id']}/retry", {
        **recovery["config"], "request_id": "retired-legacy-retry",
        "snapshot_hash": retry["snapshot_hash"], "consent": True, "acknowledge_replay": True,
    }).status_code == 409
    assert post(client, f"/api/runs/{run['id']}/resume", {"acknowledge_replay": True}).status_code == 409
    assert provider.requests == []


def test_retired_task_cannot_prepare_a_new_isolated_coding_run(plan_case):
    client, app, provider, settings, _, model, parent, definition = plan_case
    (settings.workspace / "source.py").write_text("value = 1\n")
    (settings.workspace / "test_source.py").write_text(
        "import unittest\nclass Check(unittest.TestCase):\n    def test_value(self): self.assertTrue(True)\n"
    )
    with app.state.store.transaction() as db:
        db.execute("UPDATE tasks SET files=? WHERE id=?",
                   (json.dumps(["source.py", "test_source.py"]), parent["id"]))
    for item in definition["items"]:
        item["files"] = ["source.py", "test_source.py"]
    source = create(plan_case)["result"]["plan"]["items"][0]["task"]
    body = revision_body(plan_case)
    body["items"][0]["title"] = "Replace the coding target"
    revise(plan_case, body)
    config = {"model_id": model["id"], "writable": ["source.py"], "tests": ["test_source.py"]}
    preview = post(client, f"/api/tasks/{source['id']}/coding/preview", config)
    assert preview.status_code == 200, preview.text
    prepared = post(client, f"/api/tasks/{source['id']}/coding/prepare", {
        **config, "request_id": "retired-isolated-coding", "preview_hash": preview.json()["candidate_hash"],
    })
    assert prepared.status_code == 409
    assert prepared.json()["detail"]["code"] == "task_dependencies_blocked"
    assert app.state.store.list("runs") == [] and provider.requests == []


def test_unconsumed_device_grant_is_an_explicit_retirement_blocker(device_case):
    owner, paired, app, provider, settings, project, model, parent = device_case
    definition = {"items": [
        {"key": "source", "title": "Source", "goal": "Analyze selected source boundaries",
         "acceptance": "Review the source findings", "files": parent["files"], "depends_on": []},
        {"key": "validate", "title": "Validation", "goal": "Validate accepted source findings",
         "acceptance": "Review the validation report", "files": parent["files"], "depends_on": ["source"]},
    ]}
    case = (owner, app, provider, settings, project, model, parent, definition)
    source = create(case)["result"]["plan"]["items"][0]["task"]
    create_pair(owner, source)
    device = claim(paired).json()
    turn = save(owner, source)
    prepared = post(owner, turn_path(source, turn, "prepare"), prepare_body(owner, source, turn, model)).json()
    grant = post(owner, f"/api/devices/{device['id']}/execution-grants", {
        "request_id": "plan-revision-device-grant", "turn_id": turn["id"],
        "candidate_hash": prepared["candidate"]["candidate_hash"], "expected_device_revision": 1, "consent": True,
    })
    assert grant.status_code == 200, grant.text
    body = revision_body(case)
    body["items"][0]["title"] = "Would replace the delegated Task"
    preview = revision_preview(case, body).json()
    assert preview["impact"]["blockers"] == [{
        "task_id": source["id"], "reasons": ["prepared_turn", "unconsumed_grant"],
    }]
    response = post(owner, endpoint(case, "/revisions"), {
        **body, "request_id": "blocked-delegated-revision",
        "preview_hash": preview["preview_hash"], "consent": True,
    })
    assert response.status_code == 409
    assert owner.get(endpoint(case)).json()["plan"]["version"] == 1
    assert provider.requests == []


def test_exact_receipts_survive_new_versions_and_competing_writers_use_cas(plan_case):
    client, app, provider, settings, *_ = plan_case
    original = create(plan_case)
    body = revision_body(plan_case)
    body["items"][0]["title"] = "Concurrent revision"
    command = revision_command(plan_case, body)
    services = [TaskPlanRevisionService(Store(settings.data_dir)) for _ in range(2)]
    with ThreadPoolExecutor(2) as pool:
        receipts = list(pool.map(
            lambda service: service.revise(plan_case[6]["id"], PlanRevisionCreate(**command)), services,
        ))
    assert receipts[0] == receipts[1]
    assert len(rows(app.state.store, ("task_plan_revision_operations",))["task_plan_revision_operations"]) == 1
    first = receipts[0]
    body = revision_body(plan_case)
    body["items"][0]["title"] = "One of two writers"
    competing = revision_command(plan_case, body, "second-competing-revision")
    other = {**competing, "request_id": "third-competing-revision"}
    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(
            lambda value: post(client, endpoint(plan_case, "/revisions"), value), [competing, other],
        ))
    assert sorted(response.status_code for response in responses) == [200, 409]
    assert post(client, endpoint(plan_case, "/revisions"), command).json() == first
    assert client.get(endpoint(plan_case, f"/operations/{command['request_id']}")).json() == first
    assert client.get(endpoint(plan_case, f"/operations/{original['request_id']}")).json() == original
    changed = {**command, "items": copy.deepcopy(command["items"])}
    changed["items"][0]["title"] = "Different input under the original ID"
    assert post(client, endpoint(plan_case, "/revisions"), changed).status_code == 409
    legacy_id = {**command, "request_id": original["request_id"]}
    assert post(client, endpoint(plan_case, "/revisions"), legacy_id).status_code == 409
    assert provider.requests == []


def test_revision_mutation_and_receipt_roll_back_as_one_transaction(plan_case, monkeypatch):
    create(plan_case)
    body = revision_body(plan_case)
    body["items"][0]["title"] = "Must never be partially written"
    command = revision_command(plan_case, body)
    app = plan_case[1]
    before = rows(app.state.store, (*TABLES, *LEGACY, "tasks", "events"))
    original_event = app.state.store.event

    def fail(db, kind, *args, **kwargs):
        if kind == "task.plan.revised":
            raise RuntimeError("synthetic revision event failure")
        return original_event(db, kind, *args, **kwargs)

    monkeypatch.setattr(app.state.store, "event", fail)
    with pytest.raises(RuntimeError, match="synthetic revision event failure"):
        app.state.task_plan_revisions.revise(plan_case[6]["id"], PlanRevisionCreate(**command))
    assert rows(app.state.store, before) == before


def test_revision_history_is_bounded_pure_immutable_and_stops_at_one_hundred(plan_case):
    client, _, provider, *_ = plan_case
    original = create(plan_case)
    first = client.get(endpoint(plan_case, "/versions/1")).json()
    for version in range(2, 101):
        body = revision_body(plan_case)
        body["items"][0]["title"] = f"Source definition {version}"
        revise(plan_case, body, f"plan-history-version-{version:03}")
    history = client.get(endpoint(plan_case, "/versions")).json()
    assert history["total"] == 100 and history["page_size"] == 20 and history["has_more"] is True
    assert [item["version"] for item in history["items"]] == list(range(100, 80, -1))
    last = client.get(endpoint(plan_case, "/versions?page=999")).json()
    assert last["requested_page"] == 999 and last["page"] == last["total_pages"] == 5
    assert last["items"][-1] == first
    assert all(set(item) == set(first) for item in history["items"] + last["items"])
    assert client.get(endpoint(plan_case, "/versions/1")).json() == first
    assert client.get(endpoint(plan_case, f"/operations/{original['request_id']}")).json() == original
    blocked = revision_preview(plan_case, revision_body(plan_case))
    assert blocked.status_code == 409 and blocked.json()["detail"]["code"] == "task_plan_version_limit"
    assert provider.requests == []


@pytest.mark.parametrize("change", [
    {"expected_version": True}, {"expected_version": 0}, {"expected_version": 101},
    {"expected_version": "1"}, {"expected_plan_hash": None}, {"expected_plan_hash": "bad"},
    {"unknown": True},
])
def test_revision_commands_reject_unknown_or_coerced_identity(plan_case, change):
    create(plan_case)
    body = revision_body(plan_case)
    response = revision_preview(plan_case, {**body, **change})
    assert response.status_code == 422, response.text
    assert rows(plan_case[1].state.store, TABLES) == {table: [] for table in TABLES}


def test_revision_route_parameters_and_publication_consent_are_strict(plan_case):
    client, _, provider, *_ = plan_case
    create(plan_case)
    body = revision_body(plan_case)
    body["items"][0]["title"] = "A real candidate needing consent"
    command = revision_command(plan_case, body)
    for patch in [{"consent": False}, {"consent": 1}, {"extra": True}, {"request_id": "short"}]:
        assert post(client, endpoint(plan_case, "/revisions"), {**command, **patch}).status_code == 422
    for suffix in [
        "/versions?page=1&page=2", "/versions?page=0", "/versions?unknown=1",
        "/versions/01", "/versions/0", "/versions/101", "/versions/1?extra=1",
    ]:
        assert client.get(endpoint(plan_case, suffix)).status_code == 422, suffix
    assert client.get(endpoint(plan_case, "/versions/2")).status_code == 404
    assert post(client, endpoint(plan_case, "/revisions/preview?extra=1"), body).status_code == 422
    assert client.post(endpoint(plan_case, "/revisions"), json=command).status_code == 403
    assert provider.requests == []


def test_accepted_old_work_does_not_unlock_new_replacement_until_fresh_report_review(fixture):
    app, provider, settings = fixture
    with TestClient(app) as client:
        from test_workbench import seed
        project, model, parent = seed(client)
        definition = {"items": [
            {"key": "source", "title": "Source analysis", "goal": "Analyze the selected source boundary",
             "acceptance": "Review the source analysis", "files": ["README.md"], "depends_on": []},
            {"key": "validate", "title": "Validate source", "goal": "Validate the accepted source conclusions",
             "acceptance": "Review the validation findings", "files": ["README.md"], "depends_on": ["source"]},
        ]}
        case = (client, app, provider, settings, project, model, parent, definition)
        old_source = create(case)["result"]["plan"]["items"][0]["task"]
        old = source_run(case, old_source)
        old_result = wait_status(client, old["id"], {"succeeded", "failed"})
        assert old_result["run"]["status"] == "succeeded"
        old_report = next(item for item in old_result["artifacts"] if item["kind"] == "report")
        app.state.store.decide(old_report["id"], "accepted")
        body = revision_body(case)
        body["items"][0]["acceptance"] = "A fresh review for the changed source requirement"
        current, _ = revise(case, body)
        new_source, new_dependent = [item["task"] for item in current["result"]["plan"]["items"]]
        assert child_run(case, new_dependent).status_code == 409
        fresh = source_run(case, new_source, "revised-source-execution")
        fresh_result = wait_status(client, fresh["id"], {"succeeded", "failed"})
        assert fresh_result["run"]["status"] == "succeeded"
        assert child_run(case, new_dependent).status_code == 409
        fresh_report = next(item for item in fresh_result["artifacts"] if item["kind"] == "report")
        app.state.store.decide(fresh_report["id"], "accepted")
        dependent = child_run(case, new_dependent)
        assert dependent.status_code == 201, dependent.text
        result = wait_status(client, dependent.json()["id"], {"succeeded", "failed"})
        assert result["run"]["status"] == "succeeded"
        admission = result["run"]["context"]["task_dependencies"]
        assert admission["plan_version"] == 2 and admission["membership"] == "current"
        assert admission["prerequisites"][0]["latest_run"]["id"] == fresh["id"]
        assert admission["prerequisites"][0]["reports"][0]["id"] == fresh_report["id"]
        assert client.get(f"/api/runs/{old['id']}").json()["run"] == old_result["run"]
        assert len(provider.requests) == 12


def test_revision_read_and_write_do_not_expand_paired_device_scope(device_case):
    owner, paired, _, provider, _, _, _, task = device_case
    create_pair(owner, task)
    claim(paired)
    root = f"/api/tasks/{task['id']}/plan"
    for suffix in ["/versions", "/versions/1", "/operations/unknown-request"]:
        assert paired.get(root + suffix).status_code == 403
    for suffix in ["/revisions/preview", "/revisions"]:
        assert post(paired, root + suffix, {}).status_code == 403
    assert provider.requests == []
