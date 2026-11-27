"""Fixed Node profile integration; model JSON is injected, execution is real."""

import copy
import json

import pytest

from test_coding import coding_case, execute, prepared
from test_workbench import post, wait_status
from workbench.coding import CodingConfig
from workbench.coding_runner import CodingError
from workbench.recovery import fingerprint


PROFILE = "node-test"
BASE = (
    "export function validPath(value) {\n"
    "  return typeof value === 'string' && value.length > 0 && !value.includes('..');\n"
    "}\n"
)
PARTIAL = BASE.replace("value.length > 0", "value.length > 0 && !value.includes('\\n')")
FIXED = BASE.replace("value.length > 0", "value.length > 0 && !/[\\x00-\\x1f]/.test(value)")
TESTS = (
    "import test from 'node:test';\n"
    "import assert from 'node:assert/strict';\n"
    "import { validPath } from './validation.mjs';\n"
    "test('ordinary path', () => assert.equal(validPath('source/main.js'), true));\n"
    "test('unicode path', () => assert.equal(validPath('源码/main.js'), true));\n"
    "test('newline rejected', () => assert.equal(validPath('source\\n/main.js'), false));\n"
    "test('tab rejected', () => assert.equal(validPath('source\\t/main.js'), false));\n"
)


@pytest.fixture
def node_case(coding_case, monkeypatch):
    client, app, provider, workspace, model, task, config = coding_case
    (workspace / "validation.mjs").write_text(BASE, encoding="utf-8")
    (workspace / "selected.mjs").write_text(TESTS, encoding="utf-8")
    with app.state.store.transaction() as db:
        db.execute(
            "UPDATE tasks SET files=? WHERE id=?",
            (json.dumps(["validation.mjs", "selected.mjs"]), task["id"]),
        )
    config.update(profile=PROFILE, writable=["validation.mjs"], tests=["selected.mjs"])

    async def complete(model, messages, max_tokens):
        provider.requests.append((model, messages, max_tokens))
        request = json.loads(messages[-1]["content"])
        source = next(item["content"] for item in request["files"] if item["path"] == "validation.mjs")
        changed = PARTIAL if source == BASE else FIXED
        if source.startswith("// current project"):
            changed = "// current project\n" + FIXED
        return {
            "text": json.dumps({"summary": "Reject control characters in selected paths", "changes": [
                {"path": "validation.mjs", "content": changed},
            ]}),
            "model": model["model"], "input_tokens": 20, "output_tokens": 30,
            "truncated": False,
        }

    monkeypatch.setattr(provider, "complete", complete)
    yield client, app, provider, workspace, model, task, config


def endpoint(case, suffix, body=None):
    path = f"/api/tasks/{case[5]['id']}/coding{suffix}"
    return case[0].get(path) if body is None else post(case[0], path, body)


def attempts(detail):
    return sorted(
        [json.loads(item["content"]) for item in detail["artifacts"] if item["kind"] == "test_result"],
        key=lambda item: item["round"],
    )


def checkpoint(case):
    record = endpoint(case, "/checkpoints").json()["items"][0]
    return {"id": record["id"], "sha256": record["sha256"]}


def test_node_candidate_real_baseline_partial_repair_and_actual_evidence(node_case):
    client, app, provider, workspace, _, task, config = node_case
    original = {path.name: path.read_bytes() for path in workspace.iterdir()}
    assert client.get("/api/bootstrap").json()["capabilities"]["coding_node_test"] is True
    job = prepared(node_case, "node-profile-first")
    assert job["candidate"]["config"]["profile"] == job["candidate"]["snapshot"]["profile"] == PROFILE
    assert provider.requests == [] and app.state.store.list("runs") == []
    applied = execute(node_case, job)
    assert applied.status_code == 200, applied.text
    detail = wait_status(client, applied.json()["run_id"], {"succeeded", "failed"})
    assert detail["run"]["status"] == "succeeded", detail
    assert detail["harness"]["tools"] == [PROFILE]
    values = attempts(detail)
    assert [value["passed"] for value in values] == [False, False, True]
    assert [value["tests_run"] for value in values] == [4, 4, 4]
    assert [value["receipt"]["failures"] for value in values] == [2, 1, 0]
    assert all(value["profile"] == PROFILE and value["test_files"] == config["tests"] for value in values)
    assert all(not value["timed_out"] and not value["truncated"] for value in values)
    assert len(detail["calls"]) == len(provider.requests) == 2
    second = json.loads(provider.requests[1][1][-1]["content"])
    assert second["previous_test"]["profile"] == PROFILE
    assert second["previous_test"]["receipt"]["failures"] == 1
    assert "tab rejected" in second["previous_test"]["output"]
    assert any(item["kind"] == "diff" and "validPath" in item["content"] for item in detail["artifacts"])
    assert len([item for item in detail["artifacts"] if item["kind"] == "code_checkpoint"]) >= 1
    assert execute(node_case, job).json()["run_id"] == detail["run"]["id"]
    assert len(app.state.store.list("runs")) == 1
    assert {path.name: path.read_bytes() for path in workspace.iterdir()} == original


@pytest.mark.parametrize("name", ["selected.js", "selected.py", "selected.ts", "selected.MJS"])
def test_node_test_suffix_does_not_fall_back_to_another_runtime(node_case, name):
    _, app, provider, workspace, _, task, config = node_case
    (workspace / name).write_text(TESTS)
    with app.state.store.transaction() as db:
        db.execute("UPDATE tasks SET files=? WHERE id=?",
                   (json.dumps(["validation.mjs", name]), task["id"]))
    response = endpoint(node_case, "/preview", {**config, "tests": [name]})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "coding_file_scope_invalid"
    assert provider.requests == [] and app.state.store.list("runs") == []


def test_commonjs_tests_and_immutable_selection_use_real_node(node_case):
    _, app, provider, workspace, _, task, config = node_case
    (workspace / "selected.cjs").write_text(
        TESTS.replace("import test from 'node:test';", "const test = require('node:test');")
        .replace("import assert from 'node:assert/strict';", "const assert = require('node:assert/strict');")
        .replace("import { validPath } from './validation.mjs';",
                 "const { validPath } = require('./validation.mjs');"),
        encoding="utf-8",
    )
    with app.state.store.transaction() as db:
        db.execute("UPDATE tasks SET files=? WHERE id=?",
                   (json.dumps(["validation.mjs", "selected.cjs"]), task["id"]))
    response = endpoint(node_case, "/preview", {**config, "tests": ["selected.cjs"]})
    assert response.status_code == 200, response.text
    assert response.json()["snapshot"]["profile"] == PROFILE
    assert provider.requests == []
    config["tests"] = ["selected.cjs"]
    job = prepared(node_case, "node-commonjs-actual")
    detail = wait_status(node_case[0], execute(node_case, job).json()["run_id"], {"succeeded", "failed"})
    assert detail["run"]["status"] == "succeeded", detail
    assert [value["receipt"]["failures"] for value in attempts(detail)] == [2, 1, 0]
    assert all(value["test_files"] == ["selected.cjs"] for value in attempts(detail))


@pytest.mark.parametrize("error", ["coding_node_unavailable", "coding_node_sandbox_unavailable"])
def test_node_unavailable_blocks_preview_prepare_execute_but_keeps_get_discard(node_case, monkeypatch, error):
    _, app, provider, _, _, _, config = node_case
    job = prepared(node_case, "node-runtime-before-loss")

    async def unavailable(profile="python-unittest"):
        assert profile == PROFILE
        raise CodingError(error, 422)

    monkeypatch.setattr(app.state.engine.coding.runner, "probe", unavailable)
    for suffix, body in [
        ("/preview", config),
        ("/prepare", {**config, "request_id": "node-runtime-after-loss",
                      "preview_hash": job["candidate_hash"]}),
        (f"/{job['request_id']}/execute", {"candidate_hash": job["candidate_hash"], "consent": True}),
    ]:
        response = endpoint(node_case, suffix, body)
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == error
    assert endpoint(node_case, f"/{job['request_id']}").json() == job
    discarded = endpoint(node_case, f"/{job['request_id']}/discard", {
        "candidate_hash": job["candidate_hash"], "consent": True,
    })
    assert discarded.status_code == 200 and discarded.json()["state"] == "discarded"
    assert provider.requests == [] and app.state.store.list("runs") == []


def test_node_unknown_id_get_does_not_replace_or_execute_the_candidate(node_case):
    _, app, provider, _, _, _, config = node_case
    job = prepared(node_case, "node-persisted-original")
    assert endpoint(node_case, f"/{job['request_id']}").json() == job
    assert endpoint(node_case, "/node-never-sent-id").status_code == 404
    changed = endpoint(node_case, "/prepare", {
        **config, "max_rounds": 1, "request_id": job["request_id"], "preview_hash": job["candidate_hash"],
    })
    assert changed.status_code == 409
    assert provider.requests == [] and app.state.store.list("runs") == []


def test_node_frozen_configuration_identity_and_python_default_omission_stay_exact(node_case):
    _, app, _, _, _, _, config = node_case
    job = prepared(node_case, "node-full-config-identity")
    with app.state.store.transaction() as db:
        stored = json.loads(db.execute(
            "SELECT candidate FROM coding_jobs WHERE request_id=?", (job["request_id"],),
        ).fetchone()[0])
    assert fingerprint({key: value for key, value in stored.items() if key != "candidate_hash"}) == job["candidate_hash"]
    python = CodingConfig(model_id=config["model_id"], writable=["source.py"], tests=["test_source.py"])
    assert "profile" not in python.model_dump(exclude_none=True)
    assert python.test_profile == "python-unittest"


def test_applied_node_receipt_replay_does_not_require_a_runtime_or_repeat_a_call(node_case, monkeypatch):
    _, app, provider, _, _, _, _ = node_case
    job = prepared(node_case, "node-applied-receipt")
    detail = wait_status(node_case[0], execute(node_case, job).json()["run_id"], {"succeeded", "failed"})
    assert detail["run"]["status"] == "succeeded", detail

    async def no_runtime(*args, **kwargs):
        raise AssertionError("An exact applied receipt is independent of runtime availability")

    monkeypatch.setattr(app.state.engine.coding.runner, "probe", no_runtime)
    assert execute(node_case, job).json()["run_id"] == detail["run"]["id"]
    assert len(provider.requests) == len(detail["calls"]) == 2
    assert len(app.state.store.list("runs")) == 1


def test_python_node_python_checkpoint_switch_revalidates_each_frozen_profile(node_case, monkeypatch):
    client, app, provider, workspace, _, task, config = node_case
    files = ["calculator.py", "test_calculator.py", "validation.mjs", "selected.mjs"]
    with app.state.store.transaction() as db:
        db.execute("UPDATE tasks SET files=? WHERE id=?", (json.dumps(files), task["id"]))
    original = {path.name: path.read_bytes() for path in workspace.iterdir()}
    config.update(writable=["calculator.py", "validation.mjs"], tests=["test_calculator.py"], max_rounds=1)
    config.pop("profile")
    changes = [
        {"path": "calculator.py", "content": "def add(a, b):\n    return a + b\n"},
        {"path": "validation.mjs", "content": FIXED},
        {"path": "calculator.py", "content": "# Explicit next Python revision\n\ndef add(a, b):\n    return a + b\n"},
    ]

    async def complete(model, messages, max_tokens):
        provider.requests.append((model, messages, max_tokens))
        return {
            "text": json.dumps({"summary": "An explicit cross-profile checkpoint revision", "changes": [
                changes[len(provider.requests) - 1],
            ]}),
            "model": model["model"], "input_tokens": 20, "output_tokens": 30, "truncated": False,
        }

    monkeypatch.setattr(provider, "complete", complete)
    first_job = prepared(node_case, "cross-profile-python-original")
    first = wait_status(client, execute(node_case, first_job).json()["run_id"], {"succeeded", "failed"})
    assert first["run"]["status"] == "succeeded", first
    assert "profile" not in first["run"]["context"]["coding"]["config"]
    first_hash = first_job["candidate_hash"]
    config.update(profile=PROFILE, tests=["selected.mjs"], continuation={
        "checkpoint": checkpoint(node_case), "instruction": "Validate and repair the JavaScript path function.",
    })
    node_job = prepared(node_case, "cross-profile-node-next")
    second = wait_status(client, execute(node_case, node_job).json()["run_id"], {"succeeded", "failed"})
    assert second["run"]["status"] == "succeeded", second
    assert [value["receipt"]["failures"] for value in attempts(second)] == [2, 0]
    assert all(value["profile"] == PROFILE and value["tests_run"] == 4 for value in attempts(second))
    config.pop("profile")
    config.update(tests=["test_calculator.py"], continuation={
        "checkpoint": checkpoint(node_case), "instruction": "Make a new Python revision and rerun its tests.",
    })
    final_job = prepared(node_case, "cross-profile-python-again")
    third = wait_status(client, execute(node_case, final_job).json()["run_id"], {"succeeded", "failed"})
    assert third["run"]["status"] == "succeeded", third
    assert all(value["profile"] == "python-unittest" and value["tests_run"] == 2 for value in attempts(third))
    assert client.get(f"/api/runs/{first['run']['id']}").json()["run"]["context"]["coding"]["candidate_hash"] == first_hash
    assert "profile" not in third["run"]["context"]["coding"]["config"]
    assert len(provider.requests) == 3
    assert {path.name: path.read_bytes() for path in workspace.iterdir()} == original


def test_node_checkpoint_retests_inherited_code_and_reconciles_current_baseline(node_case, monkeypatch):
    client, app, provider, workspace, _, _, config = node_case
    config["max_rounds"] = 1
    first = prepared(node_case, "node-partial-checkpoint")
    old = wait_status(client, execute(node_case, first).json()["run_id"], {"failed"})
    assert old["run"]["error"] == "coding_tests_failed"
    old_hash = old["run"]["context"]["coding"]["candidate_hash"]
    assert [value["receipt"]["failures"] for value in attempts(old)] == [2, 1]
    config["continuation"] = {
        "checkpoint": checkpoint(node_case),
        "instruction": "Preserve the selected checkpoint and repair its remaining tab case.",
    }
    second = prepared(node_case, "node-continued-checkpoint")
    result = wait_status(client, execute(node_case, second).json()["run_id"], {"succeeded", "failed"})
    assert result["run"]["status"] == "succeeded", result
    assert [value["receipt"]["failures"] for value in attempts(result)] == [1, 0]
    assert json.loads(provider.requests[-1][1][-1]["content"])["source_checkpoint"]
    assert client.get(f"/api/runs/{old['run']['id']}").json()["run"]["context"]["coding"]["candidate_hash"] == old_hash
    config["continuation"]["checkpoint"] = checkpoint(node_case)
    (workspace / "validation.mjs").write_text("// current project\n" + BASE)
    strict = endpoint(node_case, "/preview", config)
    assert strict.status_code == 409
    assert strict.json()["detail"]["code"] == "coding_checkpoint_base_changed"

    original_probe = app.state.engine.coding.runner.probe

    async def no_runtime(*args, **kwargs):
        raise AssertionError("A read-only comparison must not run a probe")

    monkeypatch.setattr(app.state.engine.coding.runner, "probe", no_runtime)
    review = endpoint(node_case, "/reconciliation/preview", config)
    assert review.status_code == 200, review.text
    monkeypatch.setattr(app.state.engine.coding.runner, "probe", original_probe)
    reviewed = review.json()
    resolved = copy.deepcopy(config)
    resolved["continuation"]["reconciliation"] = {
        "review_hash": reviewed["review_hash"],
        "expected_current_hash": reviewed["current_hash"],
        "resolutions": [{"path": "validation.mjs", "source": "current"}],
    }
    case = (*node_case[:6], resolved)
    third = prepared(case, "node-reconciled-checkpoint")
    origin = third["candidate"]["snapshot"]["origin_files"]
    assert next(item["content"] for item in origin if item["path"] == "validation.mjs") == "// current project\n" + BASE
    result = wait_status(client, execute(case, third).json()["run_id"], {"succeeded", "failed"})
    assert result["run"]["status"] == "succeeded", result
    assert [value["receipt"]["failures"] for value in attempts(result)] == [2, 0]
    anchor = json.loads(next(item["content"] for item in result["artifacts"] if item["kind"] == "code_checkpoint"))
    assert anchor["origin_hash"] == fingerprint(origin)
    assert (workspace / "validation.mjs").read_text() == "// current project\n" + BASE
    assert (workspace / "selected.mjs").read_text() == TESTS
