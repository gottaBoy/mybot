import copy
import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from test_devices import create_pair, claim
from test_task_plans import plan_case, create, source_run, child_run
from test_task_turns import save, prepare_body, path as turn_path
from test_workbench import fixture, post
from workbench.recovery import fingerprint
from workbench.task_plan_nesting import NestedSnapshot, nested_gate
from workbench.store import Store


@pytest.fixture
def nested_case(plan_case):
    plan_case[7]["items"].append({
        "key": "release", "title": "Review integrated outcome",
        "goal": "Review the accepted integration of the source analysis",
        "acceptance": "The integration report supports the final outcome",
        "files": ["README.md"], "depends_on": ["validate"],
    })
    original = create(plan_case)
    source, container, dependent = [item["task"] for item in original["result"]["plan"]["items"]]
    definition = {"items": [
        {"key": "part1", "title": "Analyze first part", "goal": "Analyze the first explicit source boundary",
         "acceptance": "The first source report is reviewed", "files": ["README.md"], "depends_on": []},
        {"key": "part2", "title": "Analyze second part", "goal": "Analyze the accepted first part in more detail",
         "acceptance": "The second source report is reviewed", "files": ["README.md"], "depends_on": ["part1"]},
    ]}
    return {
        "case": plan_case, "original": original, "source": source, "container": container,
        "dependent": dependent, "definition": definition,
    }


def path(task, suffix=""):
    return f"/api/tasks/{task['id']}/plan{suffix}"


def create_nested(value, definition=None, request_id="nested-plan-original"):
    case, parent = value["case"], value["container"]
    definition = definition or value["definition"]
    preview = post(case[0], path(parent, "/preview"), definition)
    assert preview.status_code == 200, preview.text
    response = post(case[0], path(parent), {
        **definition, "request_id": request_id, "preview_hash": preview.json()["preview_hash"], "consent": True,
    })
    assert response.status_code == 200, response.text
    return response.json()


def read(value, task):
    response = value["case"][0].get(path(task))
    assert response.status_code == 200, response.text
    return response.json()


def accepted(value, task, request_id):
    case = value["case"]
    run = source_run(case, task, request_id)
    case[1].state.store.finish_run(run["id"], "succeeded")
    report = case[1].state.store.artifact(run["id"], None, "Reviewed report", "report",
                                        f"Actual persisted analysis for {task['id']}")
    case[1].state.store.decide(report, "accepted")
    return run, report


def revise(value, task, mutate, request_id="nested-revision-original"):
    case = value["case"]
    current = read(value, task)["plan"]
    body = {
        "expected_version": current["version"], "expected_plan_hash": current["plan_hash"],
        "items": copy.deepcopy(current["definition"]["items"]),
    }
    mutate(body["items"])
    preview = post(case[0], path(task, "/revisions/preview"), body)
    assert preview.status_code == 200, preview.text
    command = {**body, "request_id": request_id, "preview_hash": preview.json()["preview_hash"], "consent": True}
    response = post(case[0], path(task, "/revisions"), command)
    assert response.status_code == 200, response.text
    return response.json(), preview.json(), command


def outcome(value, task):
    parent = read(value, value["case"][6])["plan"]
    return next(item["review"] for item in parent["items"] if item["task"]["id"] == task["id"])


def finish_children(value):
    nested = read(value, value["container"])["plan"]["items"]
    first, second = [item["task"] for item in nested]
    accepted(value, first, "nested-part-one")
    accepted(value, second, "nested-part-two")
    return first, second


def test_flat_reads_hashes_and_exact_receipts_do_not_acquire_nested_metadata(nested_case):
    value, case = nested_case, nested_case["case"]
    assert read(value, case[6]) == value["original"]["result"]
    assert read(value, value["container"])["schema_version"] == 1
    with case[1].state.store.transaction() as db:
        assert nested_gate(db, value["container"]["id"]) is None
    original = value["original"]
    assert case[0].get(path(case[6], f"/operations/{original['request_id']}")).json() == original
    assert case[2].requests == []


def test_nested_creation_uses_real_tasks_and_keeps_parent_and_old_receipt_immutable(nested_case, monkeypatch):
    value, case = nested_case, nested_case["case"]
    parent_before = case[1].state.store.get("tasks", value["container"]["id"])
    root_before = case[1].state.store.get("tasks", case[6]["id"])

    def no_files(*args):
        raise AssertionError("Nested planning is metadata-only")
    monkeypatch.setattr("workbench.app.snapshot", no_files)
    result = create_nested(value)
    assert result["schema_version"] == 3 and result["operation"] == "create"
    current = result["result"]
    assert current["schema_version"] == 3
    assert current["depth"] == 1 and current["root_task_id"] == case[6]["id"]
    assert current["parent"]["task_id"] == case[6]["id"]
    assert current["plan"]["parent_task_id"] == value["container"]["id"]
    assert len(current["plan"]["items"]) == 2
    assert current["gate"]["own_plan"]["ready"] is False
    assert current["gate"]["ready"] is False
    assert case[1].state.store.get("tasks", value["container"]["id"]) == parent_before
    assert case[1].state.store.get("tasks", case[6]["id"]) == root_before
    assert len(case[0].get("/api/bootstrap").json()["tasks"]) == 6
    assert case[0].get("/api/bootstrap").json()["runs"] == []
    assert case[0].get(path(value["container"], f"/operations/{result['request_id']}")).json() == result
    assert case[0].get(path(case[6], f"/operations/{value['original']['request_id']}")).json() == value["original"]
    assert case[2].requests == []


def test_all_descendants_inherit_ancestor_prerequisites_without_parent_children_deadlock(nested_case):
    value, case = nested_case, nested_case["case"]
    children = [item["task"] for item in create_nested(value)["result"]["plan"]["items"]]
    first = read(value, children[0])["gate"]
    assert first["depth"] == 2
    assert [scope["task_id"] for scope in first["external_scopes"]] == [
        children[0]["id"], value["container"]["id"],
    ]
    assert first["own_plan"] is None
    assert first["external_scopes"][1]["prerequisites"][0]["task_id"] == value["source"]["id"]
    assert first["ready"] is False
    assert child_run(case, children[0], "blocked-by-ancestor").status_code == 409
    accepted(value, value["source"], "ancestor-prerequisite")
    assert read(value, children[0])["gate"]["ready"] is True
    assert read(value, value["container"])["gate"]["ready"] is False
    assert read(value, children[1])["gate"]["ready"] is False
    accepted(value, children[0], "first-nested-accepted")
    assert read(value, children[1])["gate"]["ready"] is True
    assert read(value, value["container"])["gate"]["ready"] is False
    assert case[2].requests == []


def test_ancestor_review_withdrawal_blocks_descendants_and_container_future_execution(nested_case):
    value = nested_case
    children = [item["task"] for item in create_nested(value)["result"]["plan"]["items"]]
    _, report = accepted(value, value["source"], "ancestor-before-withdrawal")
    assert read(value, children[0])["gate"]["ready"] is True
    value["case"][1].state.store.decide(report, "changes_requested")
    for task in [*children, value["container"]]:
        assert read(value, task)["gate"]["ready"] is False
        assert child_run(value["case"], task, f"withdrawn-{task['id']}").status_code == 409


def test_children_then_current_integration_report_unlock_upper_sibling(nested_case):
    value, case = nested_case, nested_case["case"]
    accepted(value, value["source"], "source-before-nesting")
    old_parent, old_report = accepted(value, value["container"], "old-parent-before-nesting")
    old_context = case[1].state.store.get("runs", old_parent["id"])["context"]
    assert "own_plan" not in old_context["task_dependencies"]
    create_nested(value)
    assert outcome(value, value["container"])["state"] == "children_pending"
    first, second = finish_children(value)
    completed_children = read(value, value["container"])
    assert completed_children["gate"]["ready"] is True
    assert completed_children["gate"]["own_plan"]["ready"] is True
    assert outcome(value, value["container"])["state"] == "integration_stale"
    assert read(value, value["dependent"])["gate"]["ready"] is False
    current, report = accepted(value, value["container"], "current-integration")
    admission = case[1].state.store.get("runs", current["id"])["context"]["task_dependencies"]
    assert admission["own_plan"]["completion_scope_hash"] == completed_children["gate"]["own_plan"]["completion_scope_hash"]
    assert [item["task_id"] for item in admission["own_plan"]["children"]] == [first["id"], second["id"]]
    assert outcome(value, value["container"])["state"] == "accepted"
    assert read(value, value["dependent"])["gate"]["ready"] is True
    assert case[1].state.store.get("runs", old_parent["id"])["context"] == old_context
    assert case[1].state.store.get("artifacts", old_report)["decision"] == "accepted"
    assert case[1].state.store.get("artifacts", report)["decision"] == "accepted"


def test_parent_scope_changes_after_new_child_run_or_review_withdrawal(nested_case):
    value, case = nested_case, nested_case["case"]
    create_nested(value)
    accepted(value, value["source"], "source-for-scope")
    first, second = finish_children(value)
    parent, _ = accepted(value, value["container"], "bound-parent")
    frozen = case[1].state.store.get("runs", parent["id"])["context"]
    scope_before = frozen["task_dependencies"]["own_plan"]["completion_scope_hash"]
    child = source_run(case, second, "new-latest-child")
    assert outcome(value, value["container"])["state"] == "children_pending"
    case[1].state.store.finish_run(child["id"], "succeeded")
    report = case[1].state.store.artifact(child["id"], None, "New report", "report", "Current second child report")
    case[1].state.store.decide(report, "accepted")
    assert outcome(value, value["container"])["state"] == "integration_stale"
    assert read(value, value["container"])["gate"]["own_plan"]["completion_scope_hash"] != scope_before
    assert read(value, value["dependent"])["gate"]["ready"] is False
    assert case[1].state.store.get("runs", parent["id"])["context"] == frozen


def test_outer_reorder_reuses_container_and_does_not_invalidate_its_own_accepted_outcome(nested_case):
    value = nested_case
    create_nested(value)
    accepted(value, value["source"], "source-for-reorder")
    finish_children(value)
    accepted(value, value["container"], "parent-before-reorder")
    before = outcome(value, value["container"])
    receipt, preview, _ = revise(value, value["case"][6], lambda items: items.reverse())
    assert receipt["schema_version"] == preview["schema_version"] == 3
    assert preview["impact"]["replaced_keys"] == preview["impact"]["subtree_retired_task_ids"] == []
    after = outcome(value, value["container"])
    assert after == before
    assert after["state"] == "accepted"
    assert read(value, value["dependent"])["gate"]["ready"] is True


def test_subplan_revision_replaces_children_and_invalidates_old_parent_integration(nested_case):
    value = nested_case
    original = create_nested(value)
    accepted(value, value["source"], "source-for-subplan-edit")
    finish_children(value)
    parent, _ = accepted(value, value["container"], "parent-before-subplan-edit")
    before = outcome(value, value["container"])["completion_hash"]
    receipt, preview, _ = revise(
        value, value["container"], lambda items: items[0].update(acceptance="A revised first part needs fresh acceptance"),
    )
    assert receipt["result"]["parent"]["task_id"] == value["case"][6]["id"]
    assert receipt["result"]["plan"]["version"] == 2
    assert preview["impact"]["replaced_keys"] == ["part1", "part2"]
    assert preview["impact"]["depth"] == 1
    assert outcome(value, value["container"])["state"] == "children_pending"
    assert outcome(value, value["container"])["completion_hash"] != before
    assert read(value, value["dependent"])["gate"]["ready"] is False
    for old in original["result"]["plan"]["items"]:
        assert read(value, old["task"])["gate"]["membership"] == "retired"
    assert value["case"][1].state.store.get("runs", parent["id"])["status"] == "succeeded"


@pytest.mark.parametrize("kind", ["first_nested", "nested_revision", "outer_revision"])
def test_structure_changes_require_the_entire_current_root_tree_idle(nested_case, kind):
    value, case = nested_case, nested_case["case"]
    if kind != "first_nested":
        create_nested(value)
    run = source_run(case, value["source"], f"active-{kind}")
    if kind == "first_nested":
        preview = post(case[0], path(value["container"], "/preview"), value["definition"])
        command = {
            **value["definition"], "request_id": "blocked-first-nesting",
            "preview_hash": preview.json()["preview_hash"], "consent": True,
        }
        response = post(case[0], path(value["container"]), command)
    else:
        target = value["container"] if kind == "nested_revision" else case[6]
        current = read(value, target)["plan"]
        body = {"expected_version": current["version"], "expected_plan_hash": current["plan_hash"],
                "items": copy.deepcopy(current["definition"]["items"])}
        body["items"][0]["acceptance"] += " changed"
        preview = post(case[0], path(target, "/revisions/preview"), body)
        response = post(case[0], path(target, "/revisions"), {
            **body, "request_id": "blocked-nested-revision",
            "preview_hash": preview.json()["preview_hash"], "consent": True,
        })
    assert preview.status_code == 200, preview.text
    assert preview.json()["impact"]["blockers"] == [{"task_id": value["source"]["id"], "reasons": ["unfinished_run"]}]
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "task_plan_nested_busy"
    assert case[1].state.store.get("runs", run["id"])["status"] == "queued"
    assert case[2].requests == []


def test_outer_replacement_retires_complete_subtree_without_copying_its_plan(nested_case):
    value, case = nested_case, nested_case["case"]
    nested = create_nested(value)
    old_children = [item["task"] for item in nested["result"]["plan"]["items"]]
    receipt, preview, _ = revise(
        value, case[6], lambda items: items[1].update(acceptance="The container requirement is replaced"),
    )
    assert preview["impact"]["subtree_retired_task_ids"] == [
        value["container"]["id"], *[child["id"] for child in old_children], value["dependent"]["id"],
    ]
    new_container = next(item["task"] for item in receipt["result"]["plan"]["items"] if item["key"] == "validate")
    assert read(value, new_container)["plan"] is None
    for old in [value["container"], *old_children]:
        current = read(value, old)
        assert current["schema_version"] == 3
        assert current["gate"]["membership"] == "retired" and current["gate"]["ready"] is False
        assert child_run(case, old, f"retired-{old['id']}").status_code == 409
    old_read = read(value, value["container"])
    assert old_read["parent"] is not None and old_read["plan"] is not None
    assert case[0].get(path(value["container"], f"/operations/{nested['request_id']}")).json() == nested
    assert read(value, case[6])["schema_version"] == 3


def test_depth_two_and_file_subset_are_authoritative_limits(nested_case):
    value, case = nested_case, nested_case["case"]
    children = [item["task"] for item in create_nested(value)["result"]["plan"]["items"]]
    response = post(case[0], path(children[0], "/preview"), value["definition"])
    assert response.status_code == 422 and response.json()["detail"]["code"] == "task_plan_depth_limit"
    bad = copy.deepcopy(value["definition"])
    bad["items"][0]["files"] = ["unselected.py"]
    response = post(case[0], path(value["dependent"], "/preview"), bad)
    assert response.status_code == 422 and response.json()["detail"]["code"] == "task_plan_files_outside_parent"
    with case[1].state.store.transaction() as db:
        ids, heads = NestedSnapshot(db).tree(case[6]["id"])
    assert len(ids) == 6 and len(heads) == 2


def test_nested_preview_binds_ancestor_heads_and_exact_request_replays_after_later_revisions(nested_case):
    value, case = nested_case, nested_case["case"]
    preview = post(case[0], path(value["container"], "/preview"), value["definition"]).json()
    assert preview["schema_version"] == 3 and preview["impact"]["current_task_count"] == 4
    assert preview["lineage"][0]["task_id"] == value["container"]["id"]
    assert preview["tree_heads"][0]["task_id"] == case[6]["id"]
    root = read(value, case[6])["plan"]
    body = {"expected_version": root["version"], "expected_plan_hash": root["plan_hash"],
            "items": list(reversed(root["definition"]["items"]))}
    revised = post(case[0], path(case[6], "/revisions/preview"), body).json()
    response = post(case[0], path(case[6], "/revisions"), {
        **body, "request_id": "flat-root-before-nesting", "preview_hash": revised["preview_hash"], "consent": True,
    })
    assert response.status_code == 200
    command = {**value["definition"], "request_id": "stale-nested-lineage",
               "preview_hash": preview["preview_hash"], "consent": True}
    assert post(case[0], path(value["container"]), command).status_code == 409
    created = create_nested(value)
    original_command = {
        **value["definition"], "request_id": created["request_id"],
        "preview_hash": created["preview_hash"], "consent": True,
    }
    revise(value, case[6], lambda items: items.reverse(), "nested-root-after-nesting")
    assert post(case[0], path(value["container"]), original_command).json() == created


def test_current_tree_can_reach_seventy_three_tasks_but_no_deeper(nested_case):
    value, case = nested_case, nested_case["case"]
    root = case[6]
    definition = {"items": [{
        "key": f"root{index}", "title": f"Root task {index}", "goal": f"Analyze explicit source area number {index}",
        "acceptance": "The source area report is accepted", "files": ["README.md"], "depends_on": [],
    } for index in range(8)]}
    current = read(value, root)["plan"]
    body = {**definition, "expected_version": current["version"], "expected_plan_hash": current["plan_hash"]}
    preview = post(case[0], path(root, "/revisions/preview"), body).json()
    result = post(case[0], path(root, "/revisions"), {
        **body, "request_id": "eight-root-tasks", "preview_hash": preview["preview_hash"], "consent": True,
    }).json()
    children = [item["task"] for item in result["result"]["plan"]["items"]]
    for index, child in enumerate(children):
        candidate = post(case[0], path(child, "/preview"), definition)
        assert candidate.status_code == 200, candidate.text
        response = post(case[0], path(child), {
            **definition, "request_id": f"eight-grandchildren-{index}",
            "preview_hash": candidate.json()["preview_hash"], "consent": True,
        })
        assert response.status_code == 200, response.text
    with case[1].state.store.transaction() as db:
        ids, heads = NestedSnapshot(db).tree(root["id"])
    assert len(ids) == 73 and len(heads) == 9
    assert read(value, root)["schema_version"] == 3
    assert case[2].requests == []


def test_concurrent_outer_revision_and_nested_creation_do_not_create_an_orphaned_active_subtree(nested_case):
    value, case = nested_case, nested_case["case"]
    nested_preview = post(case[0], path(value["container"], "/preview"), value["definition"]).json()
    nested_command = {**value["definition"], "request_id": "concurrent-nested-create",
                      "preview_hash": nested_preview["preview_hash"], "consent": True}
    current = read(value, case[6])["plan"]
    body = {"expected_version": current["version"], "expected_plan_hash": current["plan_hash"],
            "items": copy.deepcopy(current["definition"]["items"])}
    body["items"][1]["acceptance"] += " replaced"
    outer_preview = post(case[0], path(case[6], "/revisions/preview"), body).json()
    outer_command = {**body, "request_id": "concurrent-outer-revision",
                     "preview_hash": outer_preview["preview_hash"], "consent": True}
    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(
            lambda operation: post(case[0], operation[0], operation[1]),
            [(path(value["container"]), nested_command), (path(case[6], "/revisions"), outer_command)],
        ))
    assert sorted(response.status_code for response in responses) == [200, 409]
    if responses[0].status_code == 200:
        assert read(value, value["container"])["gate"]["membership"] == "current"
    else:
        assert read(value, value["container"])["gate"]["membership"] == "retired"
    assert case[2].requests == []


@pytest.mark.parametrize("kind", ["prepared_turn", "unresolved_recovery", "unconsumed_grant"])
def test_other_branch_pending_authorizations_block_first_nested_publication(nested_case, kind):
    value, case = nested_case, nested_case["case"]
    task, client = value["source"], case[0]
    reasons = [kind]
    if kind in {"prepared_turn", "unconsumed_grant"}:
        turn = save(client, task)
        response = post(client, turn_path(task, turn, "prepare"), prepare_body(client, task, turn, case[5]))
        assert response.status_code == 200, response.text
        if kind == "unconsumed_grant":
            create_pair(client, task)
            paired = TestClient(case[1])
            try:
                device = claim(paired).json()
                grant = post(client, f"/api/devices/{device['id']}/execution-grants", {
                    "request_id": "nested-pending-device-grant", "turn_id": turn["id"],
                    "candidate_hash": response.json()["candidate"]["candidate_hash"],
                    "expected_device_revision": 1, "consent": True,
                })
                assert grant.status_code == 200, grant.text
            finally:
                paired.close()
            reasons = ["prepared_turn", "unconsumed_grant"]
    else:
        run = source_run(case, task, "nested-recovery-source")
        case[1].state.store.finish_run(run["id"], "failed")
        preview = client.get(f"/api/runs/{run['id']}/retry-preview").json()
        response = post(client, f"/api/runs/{run['id']}/recovery-intents", {
            "request_id": "nested-unresolved-recovery", "mode": "retry", "snapshot_hash": preview["snapshot_hash"],
            "config": {**preview["defaults"], "max_calls": max(3, preview["minimum_calls"])},
        })
        assert response.status_code == 200, response.text
        with case[1].state.store.transaction() as db:
            db.execute("UPDATE recovery_intents SET state='unknown' WHERE request_id='nested-unresolved-recovery'")
    preview = post(client, path(value["container"], "/preview"), value["definition"])
    assert preview.status_code == 200, preview.text
    assert preview.json()["impact"]["blockers"] == [{"task_id": task["id"], "reasons": reasons}]
    response = post(client, path(value["container"]), {
        **value["definition"], "request_id": "nested-blocked-by-other-branch",
        "preview_hash": preview.json()["preview_hash"], "consent": True,
    })
    assert response.status_code == 409 and response.json()["detail"]["code"] == "task_plan_nested_busy"
    assert case[2].requests == []


def test_prepared_coding_in_other_branch_blocks_first_nested_publication(plan_case):
    case = plan_case
    workspace = case[3].workspace
    (workspace / "source.py").write_text("value = 1\n")
    (workspace / "test_source.py").write_text(
        "import unittest\nclass Check(unittest.TestCase):\n    def test_value(self): self.assertTrue(True)\n"
    )
    files = ["README.md", "source.py", "test_source.py"]
    with case[1].state.store.transaction() as db:
        db.execute("UPDATE tasks SET files=? WHERE id=?", (json.dumps(files), case[6]["id"]))
    for item in case[7]["items"]:
        item["files"] = files
    flat = create(case)
    source, dependent = [item["task"] for item in flat["result"]["plan"]["items"]]
    value = {"case": case, "container": source}
    accepted(value, source, "source-before-prepared-coding")
    config = {"model_id": case[5]["id"], "writable": ["source.py"], "tests": ["test_source.py"]}
    preview = post(case[0], f"/api/tasks/{dependent['id']}/coding/preview", config).json()
    prepared = post(case[0], f"/api/tasks/{dependent['id']}/coding/prepare", {
        **config, "request_id": "nested-pending-coding", "preview_hash": preview["candidate_hash"],
    })
    assert prepared.status_code == 200, prepared.text
    definition = {"items": copy.deepcopy(case[7]["items"])}
    candidate = post(case[0], path(source, "/preview"), definition)
    assert candidate.status_code == 200, candidate.text
    assert candidate.json()["impact"]["blockers"] == [{"task_id": dependent["id"], "reasons": ["prepared_coding"]}]
    response = post(case[0], path(source), {
        **definition, "request_id": "nested-blocked-by-coding",
        "preview_hash": candidate.json()["preview_hash"], "consent": True,
    })
    assert response.status_code == 409
    assert case[2].requests == []


def test_marker_migration_preserves_legacy_rows_and_nested_receipts_replay_once(nested_case):
    value, case = nested_case, nested_case["case"]
    store = case[1].state.store
    with store.transaction() as db:
        names = [row[0] for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        ) if row[0] != "task_plan_nested_roots"]
        before = {name: [dict(row) for row in db.execute(f'SELECT * FROM "{name}" ORDER BY rowid')] for name in names}
        db.execute("DROP TABLE task_plan_nested_roots")
    Store(case[3].data_dir)
    with store.transaction() as db:
        assert {name: [dict(row) for row in db.execute(f'SELECT * FROM "{name}" ORDER BY rowid')] for name in names} == before
        assert list(db.execute("SELECT * FROM task_plan_nested_roots")) == []
    preview = post(case[0], path(value["container"], "/preview"), value["definition"]).json()
    command = {**value["definition"], "request_id": "concurrent-same-nested-command",
               "preview_hash": preview["preview_hash"], "consent": True}
    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(lambda _: post(case[0], path(value["container"]), command), range(2)))
    assert all(response.status_code == 200 for response in responses)
    assert responses[0].json() == responses[1].json()
    assert len(case[0].get("/api/bootstrap").json()["tasks"]) == 6
    with store.transaction() as db:
        assert len(list(db.execute("SELECT * FROM task_plan_nested_roots"))) == 1
    assert case[2].requests == []


@pytest.mark.parametrize("retired", [False, True])
def test_missing_permanent_marker_never_downgrades_current_or_retired_descendants(nested_case, retired):
    value, case = nested_case, nested_case["case"]
    child = create_nested(value)["result"]["plan"]["items"][0]["task"]
    if retired:
        revise(value, case[6], lambda items: items[1].update(acceptance="Replace this entire branch"))
    with case[1].state.store.transaction() as db:
        db.execute("DELETE FROM task_plan_nested_roots")
    for task in [case[6], value["container"], child]:
        response = case[0].get(path(task))
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "task_plan_tree_invalid"
    assert child_run(case, child, "must-not-fall-back-flat").status_code == 409
    assert case[2].requests == []


@pytest.mark.parametrize("corruption", ["missing", "duplicate", "wrong_key", "wrong_parent"])
def test_corrupt_nested_bindings_cannot_silently_drop_a_prerequisite(nested_case, corruption):
    value, case = nested_case, nested_case["case"]
    create_nested(value)
    accepted(value, value["source"], "source-before-corrupt-binding")
    result, _, _ = revise(value, value["container"], lambda items: items[0].update(acceptance="New first acceptance"))
    children = [item["task"] for item in result["result"]["plan"]["items"]]
    with case[1].state.store.transaction() as db:
        row = db.execute(
            "SELECT bindings FROM task_plan_versions WHERE parent_task_id=? AND version=2",
            (value["container"]["id"],),
        ).fetchone()
        bindings = json.loads(row["bindings"])
        if corruption == "missing":
            bindings.pop(0)
        elif corruption == "duplicate":
            bindings[0] = bindings[1]
        elif corruption == "wrong_key":
            db.execute("UPDATE task_plan_memberships SET item_key='not-the-key' WHERE task_id=?", (children[0]["id"],))
        else:
            db.execute("UPDATE task_plan_memberships SET parent_task_id=? WHERE task_id=?",
                       (value["source"]["id"], children[0]["id"]))
        db.execute("UPDATE task_plan_versions SET bindings=? WHERE parent_task_id=? AND version=2",
                   (json.dumps(bindings), value["container"]["id"]))
    assert case[0].get(path(case[6])).status_code == 409
    assert child_run(case, children[1], "corrupt-dependency-must-block").status_code == 409
    assert case[2].requests == []


def test_orphaned_revised_descendant_cannot_present_as_an_independent_task(nested_case):
    value, case = nested_case, nested_case["case"]
    create_nested(value)
    result, _, _ = revise(value, value["container"], lambda items: items[0].update(acceptance="New requirement"))
    child = result["result"]["plan"]["items"][0]["task"]
    with case[1].state.store.transaction() as db:
        db.execute("DELETE FROM task_plan_memberships WHERE task_id=?", (child["id"],))
    assert case[0].get(path(child)).status_code == 409
    assert child_run(case, child, "orphaned-child-must-not-start").status_code == 409
    assert case[2].requests == []
