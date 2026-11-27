"""Nested scope changes cannot silently reauthorize prepared or historical work."""

import copy
import json

import pytest

from test_task_plans import plan_case, create, source_run
from test_nested_task_plans import create_nested, accepted, finish_children, read
from test_task_turns import save, prepare, prepare_body, execute, path as turn_path
from test_workbench import fixture, post, run_body


@pytest.fixture
def scoped_case(plan_case):
    case = plan_case
    workspace = case[3].workspace
    (workspace / "calc.py").write_text("def identity(value):\n    return value\n")
    (workspace / "test_calc.py").write_text(
        "import unittest\nfrom calc import identity\n"
        "class Identity(unittest.TestCase):\n"
        "    def test_identity(self): self.assertEqual(identity(7), 7)\n"
    )
    files = ["README.md", "calc.py", "test_calc.py"]
    with case[1].state.store.transaction() as db:
        db.execute("UPDATE tasks SET files=? WHERE id=?", (json.dumps(files), case[6]["id"]))
    for item in case[7]["items"]:
        item["files"] = files
    case[7]["items"].append({
        "key": "release", "title": "Review integrated outcome",
        "goal": "Review the current accepted integrated outcome",
        "acceptance": "The current integration report is accepted",
        "files": files, "depends_on": ["validate"],
    })
    original = create(case)
    source, container, dependent = [item["task"] for item in original["result"]["plan"]["items"]]
    value = {
        "case": case, "source": source, "container": container, "dependent": dependent,
        "definition": {"items": [
            {"key": "first", "title": "First component", "goal": "Analyze the first explicit component",
             "acceptance": "The first component report is accepted", "files": files, "depends_on": []},
            {"key": "second", "title": "Second component", "goal": "Analyze the second explicit component",
             "acceptance": "The second component report is accepted", "files": files, "depends_on": ["first"]},
        ]},
    }
    value["nested"] = create_nested(value)
    accepted(value, source, "scope-source-accepted")
    value["children"] = finish_children(value)
    assert read(value, container)["gate"]["ready"] is True
    return value


def changed(value, suffix="changed"):
    accepted(value, value["children"][1], f"scope-child-{suffix}")
    gate = read(value, value["container"])["gate"]
    assert gate["ready"] is True
    return gate


def coding_config(value):
    return {
        "model_id": value["case"][5]["id"], "writable": ["calc.py"], "tests": ["test_calc.py"],
        "max_rounds": 1, "test_timeout": 5, "max_output_tokens": 8192,
    }


def coding_url(value, suffix=""):
    return f"/api/tasks/{value['container']['id']}/coding{suffix}"


def test_plain_preview_hash_binds_nested_scope_without_implicitly_sending_reports(scoped_case):
    value, case = scoped_case, scoped_case["case"]
    task = value["container"]
    prior = post(case[0], f"/api/tasks/{task['id']}/preview", {}).json()
    gate = read(value, task)["gate"]
    assert prior["task_plan_scope"] == {
        "schema_version": 1, "task_id": task["id"], "scope_hash": gate["scope_hash"],
    }
    assert "Actual persisted analysis" not in prior["text"]
    changed(value)
    rejected = post(case[0], f"/api/tasks/{task['id']}/runs", run_body(
        case[5], context_hash=prior["context_hash"], request_id="stale-plain-scope",
    ))
    assert rejected.status_code == 409
    fresh = post(case[0], f"/api/tasks/{task['id']}/preview", {}).json()
    assert fresh["text"] == prior["text"]
    assert fresh["context_hash"] != prior["context_hash"]
    assert case[2].requests == []


def test_prepared_turn_keeps_frozen_scope_and_discard_releases_its_lock(scoped_case):
    value, case = scoped_case, scoped_case["case"]
    client, task = case[0], value["container"]
    turn = save(client, task, request_id="scoped-prepared-turn")
    body = prepare_body(client, task, turn, case[5])
    prepared = post(client, turn_path(task, turn, "prepare"), body).json()
    frozen = copy.deepcopy(prepared["candidate"])
    changed(value)
    rejected = execute(client, task, prepared)
    assert rejected.status_code == 409
    assert rejected.json()["detail"]["code"] == "task_plan_scope_changed"
    assert client.get(turn_path(task, turn)).json()["candidate"] == frozen
    discarded = post(client, turn_path(task, turn, "discard"), {
        "candidate_hash": frozen["candidate_hash"], "consent": True,
    })
    assert discarded.status_code == 200 and discarded.json()["state"] == "discarded"
    assert discarded.json()["candidate"] == frozen
    fresh = prepare(client, task, save(client, task, request_id="scoped-turn-after-discard"), case[5])
    assert fresh["candidate"]["snapshot"]["task_plan_scope"] != frozen["snapshot"]["task_plan_scope"]
    assert case[2].requests == []


@pytest.mark.parametrize("stage", ["preview", "prepared"])
def test_coding_scope_drift_requires_fresh_preview_or_explicit_discard(scoped_case, stage):
    value, case = scoped_case, scoped_case["case"]
    config = coding_config(value)
    preview = post(case[0], coding_url(value, "/preview"), config)
    assert preview.status_code == 200, preview.text
    prior = preview.json()
    assert "task_plan_scope" in prior["snapshot"]
    command = {**config, "request_id": "scoped-code-original", "preview_hash": prior["candidate_hash"]}
    if stage == "prepared":
        prepared = post(case[0], coding_url(value, "/prepare"), command)
        assert prepared.status_code == 200, prepared.text
    changed(value)
    if stage == "preview":
        rejected = post(case[0], coding_url(value, "/prepare"), command)
        assert rejected.status_code == 409 and rejected.json()["detail"]["code"] == "coding_preview_changed"
    else:
        endpoint = coding_url(value, f"/{command['request_id']}")
        rejected = post(case[0], f"{endpoint}/execute", {
            "candidate_hash": prior["candidate_hash"], "consent": True,
        })
        assert rejected.status_code == 409
        assert rejected.json()["detail"]["code"] == "task_plan_scope_changed"
        assert case[0].get(endpoint).json()["candidate"] == prior
        assert post(case[0], f"{endpoint}/discard", {
            "candidate_hash": prior["candidate_hash"], "consent": True,
        }).json()["state"] == "discarded"
    fresh = post(case[0], coding_url(value, "/preview"), config).json()
    assert fresh["snapshot"]["files"] == prior["snapshot"]["files"]
    assert fresh["candidate_hash"] != prior["candidate_hash"]
    assert case[2].requests == []


def test_queue_claim_rejects_changed_ready_scope_before_model_and_keeps_original_context(scoped_case):
    value, case = scoped_case, scoped_case["case"]
    run = source_run(case, value["container"], "scope-queued-container")
    original = copy.deepcopy(run["context"])
    gate = changed(value)
    assert original["task_dependencies"]["scope_hash"] != gate["scope_hash"]
    assert case[1].state.store.claim() is None
    row = case[1].state.store.get("runs", run["id"])
    assert row["status"] == "failed" and row["error"] == "task_plan_scope_changed"
    assert row["context"] == original
    event = next(event for event in case[1].state.store.events(run["id"]) if event["kind"] == "run.failed")
    assert event["payload"]["task_dependencies"]["scope_hash"] == gate["scope_hash"]
    assert case[2].requests == []


def test_resume_cannot_rebind_old_running_evidence_to_new_child_scope(scoped_case):
    value, case = scoped_case, scoped_case["case"]
    run = source_run(case, value["container"], "scope-paused-container")
    case[1].state.store.control(run["id"], "pause")
    changed(value)
    rejected = post(case[0], f"/api/runs/{run['id']}/resume", {"acknowledge_replay": True})
    assert rejected.status_code == 409
    assert case[1].state.store.get("runs", run["id"])["status"] == "paused"
    assert case[1].state.store.get("runs", run["id"])["context"] == run["context"]
    assert case[2].requests == []


@pytest.mark.parametrize("durable", [False, True])
def test_retry_cannot_reuse_old_outputs_under_new_scope(scoped_case, durable):
    value, case = scoped_case, scoped_case["case"]
    client, store = case[0], case[1].state.store
    run = source_run(case, value["container"], "scope-failed-container")
    store.finish_run(run["id"], "failed", "synthetic_failure")
    artifact = store.artifact(run["id"], None, "Old scoped report", "report", "Old scoped integration")
    store.decide(artifact, "accepted")
    preview = client.get(f"/api/runs/{run['id']}/retry-preview").json()
    assert preview["task_plan_scope"] == run["context"]["task_plan_scope"]
    if durable:
        result = post(client, f"/api/runs/{run['id']}/recovery-intents", {
            "request_id": "scope-recovery-original", "mode": "retry",
            "snapshot_hash": preview["snapshot_hash"], "config": preview["defaults"],
        })
        assert result.status_code == 200, result.text
    changed(value)
    if durable:
        result = post(client, f"/api/runs/{run['id']}/recovery-intents/scope-recovery-original/execute", {
            "acknowledge_replay": True, "consent": True,
        })
        assert result.status_code == 200, result.text
        assert result.json()["state"] == "rejected"
        assert result.json()["target_run_id"] is None
    else:
        fresh = client.get(f"/api/runs/{run['id']}/retry-preview").json()
        result = post(client, f"/api/runs/{run['id']}/retry", {
            **fresh["defaults"], "request_id": "scope-legacy-retry",
            "snapshot_hash": fresh["snapshot_hash"], "consent": True, "acknowledge_replay": True,
        })
        assert result.status_code == 409
    assert store.get("runs", run["id"])["context"] == run["context"]
    assert store.get("artifacts", artifact)["decision"] == "accepted"
    assert store.retry_children(run["id"]) == []
    assert case[2].requests == []
