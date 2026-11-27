import copy
import json

import pytest

from test_coding import coding_case, execute, prepared
from test_devices import device_case, create_pair, claim
from test_workbench import post, wait_status
from workbench.coding import CodingConfig
from workbench.coding_checkpoints import file_records, read_checkpoint
from workbench.recovery import fingerprint
from workbench.task_artifacts import ArtifactReference


@pytest.fixture
def reconciliation_case(coding_case, monkeypatch):
    client, app, provider, workspace, model, task, config = coding_case
    files = ["calculator.py", "helper.py", "note.py", "readonly.py", "test_calculator.py"]
    for name, content in {
        "helper.py": "value = 1\n", "note.py": "version = 1\n", "readonly.py": "flag = 1\n",
    }.items():
        (workspace / name).write_text(content)
    with app.state.store.transaction() as db:
        db.execute("UPDATE tasks SET files=? WHERE id=?", (json.dumps(files), task["id"]))
    config["writable"] = files[:-1]
    config["max_rounds"] = 1
    original_complete = provider.complete

    async def partial(model, messages, max_tokens):
        provider.requests.append((model, messages, max_tokens))
        return {
            "text": json.dumps({"summary": "A partial prior implementation", "changes": [
                {"path": "calculator.py", "content": "def add(a, b):\n    return a * b\n"},
                {"path": "helper.py", "content": "value = 2\n"},
                {"path": "note.py", "content": "version = 2\n"},
                {"path": "readonly.py", "content": "flag = 2\n"},
            ]}),
            "model": model["model"], "input_tokens": 20, "output_tokens": 20, "truncated": False,
        }

    monkeypatch.setattr(provider, "complete", partial)
    first_job = prepared(coding_case)
    first = wait_status(client, execute(coding_case, first_job).json()["run_id"], {"failed"})
    assert first["run"]["error"] == "coding_tests_failed"
    first_job = client.get(f"/api/tasks/{task['id']}/coding/{first_job['request_id']}").json()
    checkpoint = json.loads(next(item["content"] for item in first["artifacts"] if item["kind"] == "code_checkpoint"))
    option = client.get(f"/api/tasks/{task['id']}/coding/checkpoints").json()["items"][0]
    monkeypatch.setattr(provider, "complete", original_complete)
    for name, content in {
        "calculator.py": "# Current project source\n\ndef add(a, b):\n    return a - b\n",
        "helper.py": "value = 3\n", "note.py": "version = 3\n", "readonly.py": "flag = 3\n",
        "test_calculator.py": (
            "import unittest\nfrom calculator import add\nfrom helper import value\n"
            "from note import version\nfrom readonly import flag\n"
            "class CurrentTests(unittest.TestCase):\n"
            "    def test_positive(self): self.assertEqual(add(2, 3), 5)\n"
            "    def test_negative(self): self.assertEqual(add(-2, 3), 1)\n"
            "    def test_inherited_helper(self): self.assertEqual(value, 2)\n"
            "    def test_manual_resolution(self): self.assertEqual(version, 4)\n"
            "    def test_current_readonly(self): self.assertEqual(flag, 3)\n"
        ),
    }.items():
        (workspace / name).write_text(content)
    current = [{"path": name, "content": (workspace / name).read_text(),
                "bytes": len((workspace / name).read_bytes())} for name in files]
    config = {
        **config, "writable": files[:3], "continuation": {
            "checkpoint": {"id": option["id"], "sha256": option["sha256"]},
            "instruction": "Use the explicitly reconciled start and repair the remaining addition failures.",
        },
    }
    case = (client, app, provider, workspace, model, task, config)
    yield {"case": case, "first": first, "first_job": first_job, "checkpoint": checkpoint,
           "current": current, "files": files}


def api(case, suffix, body):
    return post(case[0], f"/api/tasks/{case[5]['id']}/coding{suffix}", body)


def review(value, config=None):
    case = value["case"]
    response = api(case, "/reconciliation/preview", config or case[6])
    assert response.status_code == 200, response.text
    return response.json()


def resolved_config(value, compared=None):
    case = value["case"]
    compared = compared or review(value)
    return {
        **copy.deepcopy(case[6]),
        "continuation": {
            **case[6]["continuation"], "reconciliation": {
                "review_hash": compared["review_hash"], "expected_current_hash": compared["current_hash"],
                "resolutions": [
                    {"path": "calculator.py", "source": "current"},
                    {"path": "helper.py", "source": "checkpoint"},
                    {"path": "note.py", "source": "manual", "content": "version = 4\n"},
                ],
            },
        },
    }


def candidate(value, config=None):
    response = api(value["case"], "/preview", config or resolved_config(value))
    assert response.status_code == 200, response.text
    return response.json()


def prepare(value, config, preview, request_id="reconciled-coding-original"):
    return api(value["case"], "/prepare", {
        **config, "request_id": request_id, "preview_hash": preview["candidate_hash"],
    })


def restore_addition(provider, monkeypatch, inherited=None):
    async def repair(model, messages, max_tokens):
        provider.requests.append((model, messages, max_tokens))
        return {
            "text": json.dumps({"summary": "Repair addition after explicit reconciliation", "changes": [
                {"path": "calculator.py", "content": "# Current project source\n\ndef add(a, b):\n    return a + b\n"},
            ] if inherited is None else [{"path": "calculator.py", "content": inherited}]}),
            "model": model["model"], "input_tokens": 30, "output_tokens": 20, "truncated": False,
        }
    monkeypatch.setattr(provider, "complete", repair)


def test_three_source_comparison_is_read_only_without_runtime_probe_or_model(reconciliation_case, monkeypatch):
    value, case = reconciliation_case, reconciliation_case["case"]
    client, app, provider, *_ = case
    before = {table: app.state.store.list(table) for table in ("tasks", "runs", "agents", "calls", "artifacts")}
    with app.state.store.transaction() as db:
        events = [dict(row) for row in db.execute("SELECT * FROM events ORDER BY rowid")]

    async def forbidden_probe(*_):
        raise AssertionError("Read-only reconciliation does not execute a test probe")
    monkeypatch.setattr(app.state.engine.coding.runner, "probe", forbidden_probe)
    compared = review(value)
    assert set(compared) == {
        "schema_version", "unit", "task_id", "config", "source", "origin_files",
        "checkpoint_files", "current_files", "current_hash", "changes", "review_hash",
    }
    assert compared["unit"] == "coding_reconciliation" and compared["schema_version"] == 1
    assert compared["config"] == case[6]
    assert compared["origin_files"] == value["first"]["run"]["context"]["coding"]["snapshot"]["files"]
    assert compared["checkpoint_files"] == value["checkpoint"]["files"]
    assert compared["current_files"] == value["current"]
    assert compared["current_hash"] == fingerprint(value["current"])
    assert compared["source"]["candidate_hash"] == value["checkpoint"]["candidate_hash"]
    assert compared["changes"][-2] == {
        "path": "readonly.py", "writable": False, "current_changed": True,
        "checkpoint_changed": True, "diverged": True, "inherited_discarded": True,
    }
    assert compared["changes"][-1] == {
        "path": "test_calculator.py", "writable": False, "current_changed": True,
        "checkpoint_changed": False, "diverged": True, "inherited_discarded": False,
    }
    assert {table: app.state.store.list(table) for table in before} == before
    with app.state.store.transaction() as db:
        assert [dict(row) for row in db.execute("SELECT * FROM events ORDER BY rowid")] == events
    assert len(provider.requests) == 1
    assert client.get("/api/bootstrap").json()["capabilities"]["coding_reconciliation"] is True


def test_explicit_choices_freeze_new_origin_and_preserve_source_provenance(reconciliation_case):
    value, case = reconciliation_case, reconciliation_case["case"]
    plain = api(case, "/preview", case[6])
    assert plain.status_code == 409 and plain.json()["detail"]["code"] == "coding_checkpoint_base_changed"
    compared = review(value)
    selected = candidate(value, resolved_config(value, compared))
    snapshot = selected["snapshot"]
    assert snapshot["origin_files"] == value["current"]
    files = file_records(snapshot["files"])
    assert files["calculator.py"] == file_records(value["current"])["calculator.py"]
    assert files["helper.py"] == "value = 2\n"
    assert files["note.py"] == "version = 4\n"
    assert files["readonly.py"] == "flag = 3\n"
    assert files["test_calculator.py"] == file_records(value["current"])["test_calculator.py"]
    provenance = snapshot["reconciliation"]
    assert provenance["source_origin_files"] == compared["origin_files"]
    assert provenance["checkpoint_files"] == compared["checkpoint_files"]
    assert provenance["review_hash"] == compared["review_hash"]
    assert provenance["current_hash"] == fingerprint(snapshot["origin_files"])
    assert provenance["resolved_hash"] == fingerprint(snapshot["files"])
    assert snapshot["continuation"]["origin_hash"] == value["checkpoint"]["origin_hash"]
    assert "flag = 2" in snapshot["continuation"]["patch"]
    with case[1].state.store.transaction() as db:
        legacy_tuple = read_checkpoint(db, case[5]["id"], ArtifactReference(**case[6]["continuation"]["checkpoint"]))
    assert len(legacy_tuple) == 2 and legacy_tuple[0] == value["checkpoint"]


def test_choosing_current_for_every_writable_path_is_a_valid_explicit_start(reconciliation_case):
    value = reconciliation_case
    config = resolved_config(value)
    config["continuation"]["reconciliation"]["resolutions"] = [
        {"path": path, "source": "current"} for path in config["writable"]
    ]
    selected = candidate(value, config)
    assert selected["snapshot"]["files"] == selected["snapshot"]["origin_files"] == value["current"]
    assert selected["snapshot"]["reconciliation"]["resolved_hash"] == selected["snapshot"]["reconciliation"]["current_hash"]


@pytest.mark.parametrize("mode", ["missing", "extra_readonly", "extra_test", "duplicate", "order"])
def test_choices_must_exactly_cover_writable_paths_in_task_source_order(reconciliation_case, mode):
    config = resolved_config(reconciliation_case)
    choices = config["continuation"]["reconciliation"]["resolutions"]
    if mode == "missing": choices.pop()
    elif mode == "extra_readonly": choices.append({"path": "readonly.py", "source": "checkpoint"})
    elif mode == "extra_test": choices.append({"path": "test_calculator.py", "source": "manual", "content": "pass\n"})
    elif mode == "duplicate": choices.append(copy.deepcopy(choices[0]))
    elif mode == "order": choices.reverse()
    response = api(reconciliation_case["case"], "/preview", config)
    assert response.status_code == 422, response.text
    assert len(reconciliation_case["case"][2].requests) == 1


@pytest.mark.parametrize("patch", [
    {"source": "automatic"}, {"source": "manual", "content": None},
    {"source": "manual"}, {"source": "current", "content": "not admitted"},
    {"source": "checkpoint", "content": None}, {"source": "manual", "content": "x" * 32769},
    {"source": "manual", "content": "nul\0text"}, {"unknown": True},
])
def test_resolution_schema_rejects_implicit_or_oversized_manual_input(reconciliation_case, patch):
    config = resolved_config(reconciliation_case)
    config["continuation"]["reconciliation"]["resolutions"][0] = {"path": "calculator.py", **patch}
    response = api(reconciliation_case["case"], "/preview", config)
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("field", ["max_rounds", "test_timeout", "max_output_tokens", "profile", "instruction"])
def test_full_configuration_changes_invalidate_comparison(reconciliation_case, field):
    config = resolved_config(reconciliation_case)
    if field == "instruction":
        config["continuation"]["instruction"] = "Different requirements must receive a new comparison."
    else:
        config[field] = {"max_rounds": 2, "test_timeout": 4, "max_output_tokens": 4096,
                         "profile": "python-pytest"}[field]
    response = api(reconciliation_case["case"], "/preview", config)
    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "coding_reconciliation_review_changed"


@pytest.mark.parametrize("path", ["calculator.py", "test_calculator.py"])
def test_current_source_and_tests_are_compare_and_prepare_cas_inputs(reconciliation_case, path):
    value, case = reconciliation_case, reconciliation_case["case"]
    config = resolved_config(value)
    selected = candidate(value, config)
    (case[3] / path).write_text("# Later project change\n")
    for response in [api(case, "/preview", config), prepare(value, config, selected)]:
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "coding_reconciliation_current_changed"
    assert case[0].get(f"/api/tasks/{case[5]['id']}/coding").json()["prepared"] is None
    assert len(case[2].requests) == 1


@pytest.mark.parametrize("subject", ["source_artifact", "task_goal", "project_notes", "model_definition"])
def test_source_identity_and_task_project_metadata_are_bound_to_review(reconciliation_case, subject):
    value, case = reconciliation_case, reconciliation_case["case"]
    config = resolved_config(value)
    with case[1].state.store.transaction() as db:
        if subject == "source_artifact":
            db.execute("UPDATE artifacts SET title=title||' changed' WHERE id=?",
                       (config["continuation"]["checkpoint"]["id"],))
        elif subject == "task_goal":
            db.execute("UPDATE tasks SET goal=goal||' changed' WHERE id=?", (case[5]["id"],))
        elif subject == "project_notes":
            db.execute("UPDATE projects SET notes=notes||' changed' WHERE id=?", (case[5]["project_id"],))
        else:
            db.execute("UPDATE models SET model=model||'-changed' WHERE id=?", (case[4]["id"],))
    response = api(case, "/preview", config)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == (
        "coding_checkpoint_changed" if subject == "source_artifact" else "coding_reconciliation_review_changed"
    )


@pytest.mark.parametrize("mode", ["remove", "add", "reorder"])
def test_reconciliation_does_not_admit_file_set_or_order_changes(reconciliation_case, mode):
    value, case = reconciliation_case, reconciliation_case["case"]
    files = list(value["files"])
    if mode == "remove": files.remove("readonly.py")
    elif mode == "add":
        files.append("new.py")
        (case[3] / "new.py").write_text("value = 1\n")
    else: files.reverse()
    with case[1].state.store.transaction() as db:
        db.execute("UPDATE tasks SET files=? WHERE id=?", (json.dumps(files), case[5]["id"]))
    response = api(case, "/reconciliation/preview", case[6])
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "coding_reconciliation_paths_changed"


def test_exact_preparation_replay_and_frozen_execution_never_reread_changed_host_or_artifact(reconciliation_case, monkeypatch):
    value, case = reconciliation_case, reconciliation_case["case"]
    config = resolved_config(value)
    selected = candidate(value, config)
    prepared_response = prepare(value, config, selected)
    assert prepared_response.status_code == 200, prepared_response.text
    job = prepared_response.json()
    source_before = copy.deepcopy(value["first"]["run"]["context"]["coding"])
    (case[3] / "calculator.py").write_text("# A newer host edit after freeze\n")
    (case[3] / "test_calculator.py").write_text("# A newer host test edit after freeze\n")
    with case[1].state.store.transaction() as db:
        db.execute("UPDATE artifacts SET content='modified after freeze' WHERE id=?",
                   (config["continuation"]["checkpoint"]["id"],))
    assert prepare(value, config, selected).json() == job
    assert case[0].get(f"/api/tasks/{case[5]['id']}/coding/{job['request_id']}").json() == job
    changed = copy.deepcopy(config)
    changed["continuation"]["reconciliation"]["resolutions"][2]["content"] = "version = 5\n"
    assert prepare(value, changed, selected).status_code == 409
    restore_addition(case[2], monkeypatch)
    result = wait_status(case[0], execute(case, job).json()["run_id"], {"succeeded", "failed"})
    assert result["run"]["status"] == "succeeded", result
    assert result["run"]["context"]["coding"]["snapshot"] == selected["snapshot"]
    assert result["run"]["context"]["coding"]["candidate_hash"] == selected["candidate_hash"]
    assert case[1].state.store.get("runs", value["first"]["run"]["id"])["context"]["coding"] == source_before
    assert (case[3] / "calculator.py").read_text() == "# A newer host edit after freeze\n"
    assert (case[3] / "test_calculator.py").read_text() == "# A newer host test edit after freeze\n"
    assert execute(case, job).json()["run_id"] == result["run"]["id"]
    assert len(case[2].requests) == 2


@pytest.mark.parametrize("profile", ["python-unittest", "python-pytest"])
def test_real_reconciled_baseline_repair_checkpoint_and_next_continuation_keep_new_anchor(reconciliation_case, monkeypatch, profile):
    value, case = reconciliation_case, reconciliation_case["case"]
    if profile == "python-pytest":
        case[6]["profile"] = profile
    config = resolved_config(value)
    selected = candidate(value, config)
    original_host = {path: (case[3] / path).read_bytes() for path in value["files"]}
    old_candidate = copy.deepcopy(value["first"]["run"]["context"]["coding"])
    old_job = copy.deepcopy(value["first_job"])
    job = prepare(value, config, selected).json()
    restore_addition(case[2], monkeypatch)
    result = wait_status(case[0], execute(case, job).json()["run_id"], {"succeeded", "failed"})
    assert result["run"]["status"] == "succeeded", result
    tests = sorted([json.loads(item["content"]) for item in result["artifacts"] if item["kind"] == "test_result"],
                   key=lambda item: item["round"])
    assert [item["passed"] for item in tests] == [False, True]
    assert [item["tests_run"] for item in tests] == [5, 5]
    assert [item["receipt"]["failures"] for item in tests] == [2, 0]
    assert all(item["profile"] == profile for item in tests)
    source_input = json.loads(case[2].requests[-1][1][-1]["content"])
    assert set(source_input["source_checkpoint"]) == {
        "id", "sha256", "run_id", "round", "origin_hash", "current_hash", "resolved_hash",
    }
    assert file_records([
        {**record, "bytes": len(record["content"].encode())} for record in source_input["files"]
    ]) == file_records(selected["snapshot"]["files"])
    assert "patch" not in source_input["source_checkpoint"]
    cumulative = next(item["content"] for item in result["artifacts"] if item["kind"] == "diff")
    incremental = next(item["content"] for item in result["artifacts"] if item["kind"] == "incremental_diff")
    assert "-value = 3" in cumulative and "+value = 2" in cumulative
    assert "-version = 3" in cumulative and "+version = 4" in cumulative
    assert "helper.py" not in incremental and "note.py" not in incremental
    assert "readonly.py" not in cumulative and "test_calculator.py" not in cumulative
    checkpoint = json.loads(next(item["content"] for item in result["artifacts"] if item["kind"] == "code_checkpoint"))
    assert checkpoint["origin_hash"] == fingerprint(value["current"])
    assert checkpoint["origin_hash"] != value["checkpoint"]["origin_hash"]
    assert case[1].state.store.get("runs", value["first"]["run"]["id"])["context"]["coding"] == old_candidate
    assert case[0].get(f"/api/tasks/{case[5]['id']}/coding/{old_job['request_id']}").json() == old_job
    assert {path: (case[3] / path).read_bytes() for path in value["files"]} == original_host
    option = next(item for item in case[0].get(f"/api/tasks/{case[5]['id']}/coding/checkpoints").json()["items"]
                  if item["run_id"] == result["run"]["id"])
    next_config = {**case[6], "continuation": {
        "checkpoint": {"id": option["id"], "sha256": option["sha256"]},
        "instruction": "Continue from the new project anchor without rewriting the prior candidate.",
    }}
    next_preview = api(case, "/preview", next_config)
    assert next_preview.status_code == 200, next_preview.text
    assert "reconciliation" not in next_preview.json()["config"]["continuation"]
    assert "reconciliation" not in next_preview.json()["snapshot"]
    assert next_preview.json()["snapshot"]["origin_files"] == value["current"]
    assert next_preview.json()["snapshot"]["files"] == checkpoint["files"]
    (case[3] / "readonly.py").write_text("flag = 9\n")
    assert api(case, "/preview", next_config).status_code == 409


def test_resolved_start_alone_cannot_count_as_a_new_model_implementation(reconciliation_case, monkeypatch):
    value, case = reconciliation_case, reconciliation_case["case"]
    config = resolved_config(value)
    selected = candidate(value, config)
    job = prepare(value, config, selected).json()
    restore_addition(case[2], monkeypatch, file_records(selected["snapshot"]["files"])["calculator.py"])
    result = wait_status(case[0], execute(case, job).json()["run_id"], {"failed"})
    assert result["run"]["error"] == "coding_output_invalid"
    assert not any(item["kind"] in {"diff", "code_checkpoint", "report"} for item in result["artifacts"])
    assert len(case[2].requests) == 2


@pytest.mark.parametrize("field", ["current_hash", "resolved_hash", "choices"])
def test_inconsistent_frozen_resolution_is_rejected_before_model_execution(reconciliation_case, field):
    value, case = reconciliation_case, reconciliation_case["case"]
    config = resolved_config(value)
    job = prepare(value, config, candidate(value, config)).json()
    with case[1].state.store.transaction() as db:
        row = db.execute("SELECT candidate FROM coding_jobs WHERE request_id=?", (job["request_id"],)).fetchone()
        frozen = json.loads(row["candidate"])
        if field == "choices":
            frozen["config"]["continuation"]["reconciliation"]["resolutions"][0]["source"] = "checkpoint"
        else:
            frozen["snapshot"]["reconciliation"][field] = "0" * 64
        db.execute("UPDATE coding_jobs SET candidate=? WHERE request_id=?",
                   (json.dumps(frozen), job["request_id"]))
    response = execute(case, job)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "coding_reconciliation_inconsistent"
    assert len(case[1].state.store.list("runs")) == 1
    assert len(case[2].requests) == 1


def test_legacy_candidates_keep_omitted_fields_and_reconciliation_inputs_cannot_be_recursive(reconciliation_case):
    value, case = reconciliation_case, reconciliation_case["case"]
    old = value["first"]["run"]["context"]["coding"]
    assert "profile" not in old["config"] and "continuation" not in old["config"]
    assert fingerprint({key: item for key, item in old.items() if key != "candidate_hash"}) == old["candidate_hash"]
    for continuation in [None, {**case[6]["continuation"], "reconciliation": None}]:
        if continuation is None:
            config = {key: item for key, item in case[6].items() if key != "continuation"}
        else:
            config = {**case[6], "continuation": continuation}
        response = api(case, "/reconciliation/preview", config)
        assert response.status_code == 422, response.text
    assert api(case, "/reconciliation/preview", resolved_config(value)).status_code == 422
    invalid = resolved_config(value)
    invalid["continuation"]["reconciliation"]["resolutions"][0] = {
        "path": "calculator.py", "source": "manual", "content": "\ud800",
    }
    with pytest.raises(ValueError):
        CodingConfig.model_validate(invalid)


def test_manual_and_resolved_totals_and_http_body_retain_existing_bounds(reconciliation_case):
    value, case = reconciliation_case, reconciliation_case["case"]
    config = resolved_config(value)
    choices = config["continuation"]["reconciliation"]["resolutions"]
    for item in choices:
        item.update(source="manual", content="x" * 30000)
    response = api(case, "/preview", config)
    assert response.status_code == 422
    choices[0]["content"] = choices[1]["content"] = "x" * 32768
    choices[2]["content"] = ""
    response = api(case, "/preview", config)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "coding_reconciliation_size_invalid"
    choices[0]["content"] = choices[1]["content"] = '"' * 32768
    response = api(case, "/preview", config)
    assert response.status_code == 413
    assert len(case[2].requests) == 1


def test_reconciliation_route_is_owner_only_and_does_not_expand_device_scope(device_case):
    owner, paired, _, provider, _, _, _, task = device_case
    create_pair(owner, task)
    claim(paired)
    path = f"/api/tasks/{task['id']}/coding/reconciliation/preview"
    assert post(paired, path, {}).status_code == 403
    assert owner.post(path, json={}).status_code == 403
    assert post(owner, path + "?unknown=1", {}).status_code == 422
    assert provider.requests == []
