import json

import pytest

from test_coding import coding_case, execute, prepared
from test_workbench import post, wait_status
from workbench.recovery import fingerprint
from workbench.coding_checkpoints import file_records, code_diff
from test_devices import device_case, create_pair, claim


def checkpoints(case, query=""):
    return case[0].get(f"/api/tasks/{case[5]['id']}/coding/checkpoints{query}")


def failed_attempt(case):
    case[6]["max_rounds"] = 1
    job = prepared(case)
    result = wait_status(case[0], execute(case, job).json()["run_id"], {"failed"})
    assert result["run"]["error"] == "coding_tests_failed"
    return result


def continuing(case, option=None):
    option = option or checkpoints(case).json()["items"][0]
    return {**case[6], "continuation": {
        "checkpoint": {"id": option["id"], "sha256": option["sha256"]},
        "instruction": "Keep prior work and fix the remaining addition failures.",
    }}


def preview(case, config):
    return post(case[0], f"/api/tasks/{case[5]['id']}/coding/preview", config)


def prepare_next(case, config, candidate, request_id="continuation-request-next"):
    return post(case[0], f"/api/tasks/{case[5]['id']}/coding/prepare", {
        **config, "request_id": request_id, "preview_hash": candidate["candidate_hash"],
    })


def repair_provider(provider, monkeypatch):
    async def complete(model, messages, max_tokens):
        provider.requests.append((model, messages, max_tokens))
        return {"text": json.dumps({"summary": "Fix remaining addition", "changes": [
            {"path": "calculator.py", "content": "def add(a, b):\n    return a + b\n"},
        ]}), "model": model["model"], "input_tokens": 25, "output_tokens": 20, "truncated": False}
    monkeypatch.setattr(provider, "complete", complete)


def test_real_failed_checkpoint_then_fresh_baseline_repair_and_cumulative_diff(coding_case, monkeypatch):
    client, app, provider, workspace, _, task, _ = coding_case
    original = {path.name: path.read_bytes() for path in workspace.iterdir()}
    first = failed_attempt(coding_case)
    catalog = checkpoints(coding_case).json()
    assert len(catalog["items"]) == catalog["total"] == 1
    option = catalog["items"][0]
    assert option["source_status"] == "failed" and option["round"] == 1
    assert option["run_id"] == first["run"]["id"] and "content" not in option
    artifact = next(a for a in first["artifacts"] if a["kind"] == "code_checkpoint")
    value = json.loads(artifact["content"])
    assert file_records(value["files"])["calculator.py"].endswith("return a * b\n")
    assert value["origin_hash"] == fingerprint(first["run"]["context"]["coding"]["snapshot"]["files"])
    config = continuing(coding_case)
    response = preview(coding_case, config)
    assert response.status_code == 200, response.text
    candidate = response.json()
    assert candidate["snapshot"]["files"] == value["files"]
    assert candidate["snapshot"]["origin_files"] == first["run"]["context"]["coding"]["snapshot"]["files"]
    assert "return a * b" in candidate["snapshot"]["continuation"]["patch"]
    assert len(provider.requests) == 1
    job = prepare_next(coding_case, config, candidate).json()
    assert job["state"] == "prepared" and len(provider.requests) == 1
    repair_provider(provider, monkeypatch)
    run_id = execute(coding_case, job).json()["run_id"]
    result = wait_status(client, run_id, {"succeeded","failed"})
    assert result["run"]["status"] == "succeeded", result
    assert len(result["calls"]) == 1 and len(provider.requests) == 2
    tests = sorted([json.loads(a["content"]) for a in result["artifacts"] if a["kind"] == "test_result"],
                   key=lambda value: value["round"])
    assert [value["passed"] for value in tests] == [False,True]
    assert [value["tests_run"] for value in tests] == [2,2]
    prompt = json.loads(provider.requests[-1][1][-1]["content"])
    assert prompt["continuation_instruction"] == config["continuation"]["instruction"]
    assert "a * b" in file_records([dict(file,bytes=len(file["content"].encode()))
                                  for file in prompt["files"]])["calculator.py"]
    assert prompt["previous_test"]["passed"] is False
    cumulative = next(a["content"] for a in result["artifacts"] if a["kind"] == "diff")
    incremental = next(a["content"] for a in result["artifacts"] if a["kind"] == "incremental_diff")
    assert "-    return a - b" in cumulative and "+    return a + b" in cumulative
    assert "-    return a * b" in incremental and "+    return a + b" in incremental
    final = json.loads(next(a["content"] for a in result["artifacts"] if a["kind"] == "code_checkpoint"))
    assert final["origin_hash"] == value["origin_hash"]
    assert {path.name: path.read_bytes() for path in workspace.iterdir()} == original
    assert execute(coding_case, job).json()["run_id"] == run_id
    assert len(client.get("/api/bootstrap").json()["runs"]) == 2
    # A second continuation keeps the repository origin and advances its parent.
    option = next(item for item in checkpoints(coding_case).json()["items"] if item["run_id"] == run_id)
    third_config = continuing(coding_case, option)
    third_config["continuation"]["instruction"] = "Add a brief comment without changing addition behavior."
    async def annotate(model, messages, max_tokens):
        provider.requests.append((model,messages,max_tokens))
        return {"text":json.dumps({"summary":"Comment the addition","changes":[
            {"path":"calculator.py","content":"def add(a, b):\n    # Preserve signed addition.\n    return a + b\n"},
        ]}),"model":model["model"],"input_tokens":20,"output_tokens":20,"truncated":False}
    monkeypatch.setattr(provider,"complete",annotate)
    third_candidate = preview(coding_case,third_config).json()
    third_job = prepare_next(coding_case,third_config,third_candidate,"continuation-request-third").json()
    third = wait_status(client,execute(coding_case,third_job).json()["run_id"],{"succeeded","failed"})
    assert third["run"]["status"] == "succeeded",third
    assert third["run"]["context"]["coding"]["snapshot"]["continuation"]["run_id"] == run_id
    assert json.loads(next(a["content"] for a in third["artifacts"] if a["kind"]=="code_checkpoint"))["origin_hash"] == value["origin_hash"]
    assert all(json.loads(a["content"])["passed"] for a in third["artifacts"] if a["kind"]=="test_result")
    cumulative = next(a["content"] for a in third["artifacts"] if a["kind"]=="diff")
    assert "-    return a - b" in cumulative and "signed addition" in cumulative
    assert {path.name:path.read_bytes() for path in workspace.iterdir()} == original


def test_inherited_changes_alone_cannot_count_as_new_implementation(coding_case):
    failed_attempt(coding_case)
    config=continuing(coding_case)
    job=prepare_next(coding_case,config,preview(coding_case,config).json()).json()
    result=wait_status(coding_case[0],execute(coding_case,job).json()["run_id"],{"failed"})
    assert result["run"]["error"] == "coding_output_invalid"
    assert not any(a["kind"] in {"diff","code_checkpoint"} for a in result["artifacts"])


@pytest.mark.parametrize("filename", ["calculator.py", "test_calculator.py"])
def test_current_project_base_changes_block_continuation(coding_case, filename):
    _, _, provider, workspace, *_ = coding_case
    failed_attempt(coding_case)
    config = continuing(coding_case)
    candidate = preview(coding_case, config).json()
    (workspace / filename).write_text("# Changed current base\n")
    response = preview(coding_case, config)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "coding_checkpoint_base_changed"
    assert prepare_next(coding_case, config, candidate).status_code == 409
    assert len(provider.requests) == 1


def test_freezing_and_original_request_reconciliation_not_affected_by_later_source_changes(coding_case, monkeypatch):
    client, app, provider, workspace, *_ = coding_case
    failed_attempt(coding_case)
    config = continuing(coding_case)
    candidate = preview(coding_case, config).json()
    job = prepare_next(coding_case, config, candidate).json()
    assert prepare_next(coding_case, config, candidate).json() == job
    with app.state.store.transaction() as db:
        db.execute("UPDATE artifacts SET content='changed after freeze' WHERE id=?",
                   (config["continuation"]["checkpoint"]["id"],))
    (workspace / "calculator.py").write_text("# Changed outside after freezing\n")
    stored = client.get(f"/api/tasks/{coding_case[5]['id']}/coding/{job['request_id']}").json()
    assert stored["candidate"] == job["candidate"]
    repair_provider(provider,monkeypatch)
    result = wait_status(client,execute(coding_case,job).json()["run_id"],{"succeeded","failed"})
    assert result["run"]["status"] == "succeeded",result
    assert result["run"]["context"]["coding"]["snapshot"] == candidate["snapshot"]
    assert (workspace / "calculator.py").read_text() == "# Changed outside after freezing\n"


def test_stale_hash_and_changed_preparation_instruction_are_not_admitted(coding_case):
    _, app, provider, *_ = coding_case
    failed_attempt(coding_case)
    config = continuing(coding_case)
    candidate = preview(coding_case,config).json()
    with app.state.store.transaction() as db:
        db.execute("UPDATE artifacts SET title='Changed title' WHERE id=?",
                   (config["continuation"]["checkpoint"]["id"],))
    response = prepare_next(coding_case,config,candidate)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "coding_checkpoint_changed"
    config = continuing(coding_case)
    candidate = preview(coding_case,config).json()
    job = prepare_next(coding_case,config,candidate).json()
    changed = {**config,"continuation":{**config["continuation"],"instruction":"Different requirements"}}
    assert prepare_next(coding_case,changed,candidate).status_code == 409
    assert len(provider.requests) == 1 and job["state"] == "prepared"


@pytest.mark.parametrize("mode", ["wrong_task","active","non_checkpoint","invalid_body","test_rewrite","scope"])
def test_checkpoint_selection_cannot_bypass_source_task_lifecycle_or_scope(coding_case,mode):
    client, app, provider, workspace, _, task, _ = coding_case
    if mode == "scope":
        (workspace / "helper.py").write_text("# Selected helper\n")
        with app.state.store.transaction() as db:
            db.execute("UPDATE tasks SET files=? WHERE id=?",
                       (json.dumps(["calculator.py","test_calculator.py","helper.py"]),task["id"]))
    first = failed_attempt(coding_case)
    option = checkpoints(coding_case).json()["items"][0]
    config = continuing(coding_case,option)
    target = task["id"]
    if mode == "wrong_task":
        target = post(client,"/api/tasks",{
            "project_id":task["project_id"],"title":"Other Task","goal":"Different implementation target",
            "files":task["files"],
        }).json()["id"]
    with app.state.store.transaction() as db:
        if mode == "active":
            db.execute("UPDATE runs SET status='running' WHERE id=?", (first["run"]["id"],))
        elif mode == "non_checkpoint":
            config["continuation"]["checkpoint"]["id"] = next(a["id"] for a in first["artifacts"] if a["kind"]=="diff")
        elif mode in {"invalid_body","test_rewrite"}:
            value = json.loads(next(a["content"] for a in first["artifacts"] if a["kind"]=="code_checkpoint"))
            if mode == "invalid_body":
                value["run_id"] = "wrong-run"
            else:
                value["files"][1] = {"path":"test_calculator.py","content":"no tests","bytes":8}
            db.execute("UPDATE artifacts SET content=? WHERE id=?", (json.dumps(value),option["id"]))
        elif mode == "scope":
            config["writable"] = ["helper.py"]
    if mode in {"invalid_body","test_rewrite"}:
        # Use the new digest, so structural checks are tested after digest admission.
        with app.state.store.transaction() as db:
            row = db.execute("SELECT a.*,r.task_id FROM artifacts a JOIN runs r ON a.run_id=r.id WHERE a.id=?",
                             (option["id"],)).fetchone()
            from workbench.task_artifacts import artifact_record
            config["continuation"]["checkpoint"]["sha256"] = artifact_record(row)["sha256"]
    response=post(client,f"/api/tasks/{target}/coding/preview",config)
    assert response.status_code in {404,409,422},response.text
    assert len(provider.requests) == 1


@pytest.mark.parametrize("changes", [
    {"checkpoint":{"id":"a","sha256":"bad"}}, {"checkpoint":{"id":"a","sha256":"a"*64,"extra":True}},
    {"instruction":""}, {"instruction":" "}, {"instruction":"x"*8001},
    {"instruction":"\ud800"}, {"instruction":"nul\0character"}, {"extra":True},
])
def test_strict_continuation_input(coding_case,changes):
    config = {**coding_case[6],"continuation":{
        "checkpoint":{"id":"checkpoint","sha256":"a"*64},"instruction":"Next work",**changes,
    }}
    # The surrogate case tests Pydantic directly because an HTTP JSON encoder
    # correctly rejects it before transmission.
    if changes.get("instruction") == "\ud800":
        from workbench.coding import CodingConfig
        with pytest.raises(ValueError):
            CodingConfig.model_validate(config)
    else:
        assert preview(coding_case,config).status_code == 422
    assert coding_case[2].requests == []


def test_catalog_pagination_invalid_records_and_parameter_admission(coding_case):
    _, app, provider, *_ = coding_case
    first=failed_attempt(coding_case)
    checkpoint=next(a for a in first["artifacts"] if a["kind"]=="code_checkpoint")
    for number in range(22):
        app.state.store.artifact(first["run"]["id"],None,f"checkpoint {number}","code_checkpoint",
                                 checkpoint["content"] if number else "invalid")
    first_page=checkpoints(coding_case).json()
    assert first_page["total"]==23 and len(first_page["items"])==20
    second=checkpoints(coding_case,"?page=2").json()
    assert len(second["items"])==3 and second["has_more"] is False
    assert sum(item["sha256"] is None for item in first_page["items"]+second["items"])==1
    assert all("files" not in item and "content" not in item for item in first_page["items"])
    for query in ["?page=0","?page=1&page=2","?extra=1","?page_size=2"]:
        assert checkpoints(coding_case,query).status_code==422
    assert len(provider.requests)==1


def test_checkpoint_diff_preserves_missing_newlines():
    assert code_diff({"a.py":"a"},{"a.py":"b"}) == (
        "--- a/a.py\n+++ b/a.py\n@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file\n"
    )


def test_checkpoint_routes_do_not_expand_paired_device_scope(device_case):
    owner, paired, _, provider, _, _, _, task = device_case
    create_pair(owner, task)
    claim(paired)
    endpoint = f"/api/tasks/{task['id']}/coding/checkpoints"
    assert owner.get(endpoint).json()["total"] == 0
    assert paired.get(endpoint).status_code == 403
    assert provider.requests == []
