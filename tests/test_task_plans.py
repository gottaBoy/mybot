import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from test_workbench import fixture, seed, post, run_body, wait_status
from test_task_turns import save, prepare_body, path as turn_path
from test_devices import device_case, create_pair, claim
from workbench.task_plans import PlanDefinition
from workbench.store import Store


@pytest.fixture
def plan_case(fixture):
    app,provider,settings=fixture
    client=TestClient(app)
    project,model,parent=seed(client)
    definition={"items":[
        {"key":"source","title":"Check source","goal":"Check the selected source boundary",
         "acceptance":"Source assumptions and unknowns are recorded","files":["README.md"],"depends_on":[]},
        {"key":"validate","title":"Validate outcome","goal":"Validate the reviewed source conclusions",
         "acceptance":"Validation advice follows accepted source evidence","files":["README.md"],"depends_on":["source"]},
    ]}
    yield client,app,provider,settings,project,model,parent,definition
    client.close()


def endpoint(case,suffix=""):
    return f"/api/tasks/{case[6]['id']}/plan{suffix}"


def preview(case,definition=None):
    response=post(case[0],endpoint(case,"/preview"),definition or case[7])
    assert response.status_code==200,response.text
    return response.json()


def create(case,request_id="plan-create-original"):
    candidate=preview(case)
    response=post(case[0],endpoint(case),{
        **case[7],"request_id":request_id,"preview_hash":candidate["preview_hash"],"consent":True,
    })
    assert response.status_code==200,response.text
    return response.json()


def source_run(case,child,request_id="dependency-source-123"):
    client=case[0]
    context=post(client,f"/api/tasks/{child['id']}/preview",{}).json()
    response=post(client,f"/api/tasks/{child['id']}/runs",run_body(
        case[5],context_hash=context["context_hash"],request_id=request_id,
    ))
    assert response.status_code==201,response.text
    return response.json()


def succeed_and_review(case,child):
    run=source_run(case,child)
    case[1].state.store.finish_run(run["id"],"succeeded")
    report=case[1].state.store.artifact(run["id"],None,"Final report","report","Actual persisted source analysis")
    case[1].state.store.decide(report,"accepted")
    return run,report


def child_run(case,child,request_id="dependency-child-123"):
    context=post(case[0],f"/api/tasks/{child['id']}/preview",{}).json()
    return post(case[0],f"/api/tasks/{child['id']}/runs",run_body(
        case[5],context_hash=context["context_hash"],request_id=request_id,
    ))


def test_plan_creates_real_tasks_atomically_without_reading_files_or_running_models(plan_case,monkeypatch):
    client,app,provider,_,_,_,parent,_=plan_case
    before=app.state.store.get("tasks",parent["id"])
    def no_files(*_):
        raise AssertionError("Planning is metadata only")
    monkeypatch.setattr("workbench.app.snapshot",no_files)
    candidate=preview(plan_case)
    assert client.get("/api/bootstrap").json()["tasks"]==[before]
    receipt=create(plan_case)
    assert receipt["state"]=="applied" and receipt["preview_hash"]==candidate["preview_hash"]
    result=receipt["result"]
    assert result["plan"]["version"]==1
    items=result["plan"]["items"]
    assert len(items)==2 and items[0]["gate"]["ready"] is True
    assert items[1]["gate"]["ready"] is False
    assert items[1]["gate"]["prerequisites"][0]["state"]=="no_run"
    assert items[1]["gate"]["prerequisites"][0]["task_id"]==items[0]["task"]["id"]
    assert app.state.store.get("tasks",items[1]["task"]["id"])==items[1]["task"]
    assert app.state.store.get("tasks",parent["id"])==before
    assert len(client.get("/api/bootstrap").json()["tasks"])==3
    assert client.get("/api/bootstrap").json()["runs"]==[] and provider.requests==[]
    assert client.get(endpoint(plan_case)+f"/operations/{receipt['request_id']}").json()==receipt
    assert client.get(endpoint(plan_case)).json()==result
    Store(plan_case[3].data_dir)
    assert client.get(endpoint(plan_case)).json()==result


@pytest.mark.parametrize("mode",["cycle","missing","self","duplicate","outside_files","empty_acceptance","extra","too_many"])
def test_invalid_graph_or_scope_cannot_create_tasks(plan_case,mode):
    value=json.loads(json.dumps(plan_case[7]))
    if mode=="cycle":value["items"][0]["depends_on"]=["validate"]
    elif mode=="missing":value["items"][1]["depends_on"]=["missing"]
    elif mode=="self":value["items"][0]["depends_on"]=["source"]
    elif mode=="duplicate":value["items"][1]["key"]="source"
    elif mode=="outside_files":value["items"][0]["files"]=["secrets.env"]
    elif mode=="empty_acceptance":value["items"][0]["acceptance"]=""
    elif mode=="extra":value["items"][0]["run_now"]=True
    elif mode=="too_many":value["items"]*=5
    response=post(plan_case[0],endpoint(plan_case,"/preview"),value)
    assert response.status_code==422,response.text
    assert len(plan_case[0].get("/api/bootstrap").json()["tasks"])==1
    assert plan_case[2].requests==[]


def test_fresh_preview_consent_idempotency_and_competing_writers(plan_case):
    client,app,provider,_,_,_,parent,definition=plan_case
    candidate=preview(plan_case)
    body={**definition,"request_id":"competing-plan-request","preview_hash":candidate["preview_hash"],"consent":False}
    assert post(client,endpoint(plan_case),body).status_code==422
    with app.state.store.transaction() as db:
        db.execute("UPDATE tasks SET goal=goal||' changed' WHERE id=?",(parent["id"],))
    assert post(client,endpoint(plan_case),{**body,"consent":True}).status_code==409
    body.update(preview_hash=preview(plan_case)["preview_hash"],consent=True)
    with ThreadPoolExecutor(2) as pool:
        responses=list(pool.map(lambda _:post(client,endpoint(plan_case),body),range(2)))
    assert all(response.status_code==200 for response in responses)
    assert responses[0].json()==responses[1].json()
    assert len(client.get("/api/bootstrap").json()["tasks"])==3
    assert post(client,endpoint(plan_case),{**body,"request_id":"different-plan-request"}).status_code==409
    changed=json.loads(json.dumps(body));changed["items"][0]["title"]="Different title"
    assert post(client,endpoint(plan_case),changed).status_code==409
    assert provider.requests==[]


def test_report_acceptance_controls_start_and_queue_claim_rechecks_it(plan_case):
    client,app,provider,*_=plan_case
    items=create(plan_case)["result"]["plan"]["items"]
    source,child=[item["task"] for item in items]
    assert child_run(plan_case,child).status_code==409
    run=source_run(plan_case,source)
    app.state.store.finish_run(run["id"],"succeeded")
    report=app.state.store.artifact(run["id"],None,"Report","report","Persisted report")
    assert child_run(plan_case,child).status_code==409
    app.state.store.decide(report,"accepted")
    ready=client.get(f"/api/tasks/{child['id']}/plan").json()
    assert ready["gate"]["ready"] is True
    assert ready["gate"]["prerequisites"][0]["latest_run"]["id"]==run["id"]
    accepted=child_run(plan_case,child)
    assert accepted.status_code==201,accepted.text
    context=app.state.store.get("runs",accepted.json()["id"])["context"]
    assert context["task_dependencies"]==ready["gate"]
    assert "Persisted report" not in context["text"]
    app.state.store.decide(report,"changes_requested")
    assert app.state.store.claim() is None
    blocked=app.state.store.get("runs",accepted.json()["id"])
    assert blocked["status"]=="failed" and blocked["error"]=="task_dependencies_blocked"
    with app.state.store.transaction() as db:
        event=db.execute("SELECT payload FROM events WHERE run_id=? AND kind='run.failed'",
                         (accepted.json()["id"],)).fetchone()
    assert json.loads(event["payload"])["task_dependencies"]["prerequisites"][0]["state"]=="changes_requested"
    assert provider.requests==[]


def test_old_success_does_not_satisfy_a_new_latest_run_and_other_changes_requested_block(plan_case):
    client,app,*_=plan_case
    source,child=[item["task"] for item in create(plan_case)["result"]["plan"]["items"]]
    run,report=succeed_and_review(plan_case,source)
    extra=app.state.store.artifact(run["id"],None,"Unresolved issue","research","Needs changes")
    app.state.store.decide(extra,"changes_requested")
    assert child_run(plan_case,child).status_code==409
    app.state.store.decide(extra,"accepted")
    assert client.get(f"/api/tasks/{child['id']}/plan").json()["gate"]["ready"] is True
    next_run=source_run(plan_case,source,"source-new-latest-request")
    assert client.get(f"/api/tasks/{child['id']}/plan").json()["gate"]["ready"] is False
    app.state.store.finish_run(next_run["id"],"failed")
    assert child_run(plan_case,child).status_code==409


def test_no_research_turn_recovery_or_legacy_resume_bypasses_dependency_gate(plan_case):
    client,app,*_=plan_case
    source,child=[item["task"] for item in create(plan_case)["result"]["plan"]["items"]]
    _,report=succeed_and_review(plan_case,source)
    run=child_run(plan_case,child).json()
    app.state.store.finish_run(run["id"],"failed")
    turn=save(client,child)
    turn_config=prepare_body(client,child,turn,plan_case[5])
    retry=client.get(f"/api/runs/{run['id']}/retry-preview").json()
    recovery={"request_id":"blocked-recovery-request","mode":"retry","snapshot_hash":retry["snapshot_hash"],
              "config":{**retry["defaults"],"max_calls":max(3,retry["minimum_calls"])}}
    app.state.store.decide(report,"changes_requested")
    assert post(client,turn_path(child,turn,"prepare"),turn_config).status_code==409
    assert post(client,f"/api/runs/{run['id']}/recovery-intents",recovery).status_code==409
    assert post(client,f"/api/runs/{run['id']}/resume",{"acknowledge_replay":True}).status_code==409
    assert child_run(plan_case,child,"blocked-extra-run").status_code==409
    assert plan_case[2].requests==[]


def test_plan_read_parameters_receipts_and_single_level_scope(plan_case):
    client=plan_case[0]
    assert client.get(endpoint(plan_case)+"?extra=1").status_code==422
    assert client.get(endpoint(plan_case)+"/operations/not-found-request").status_code==404
    assert client.get("/api/tasks/missing/plan").status_code==404
    child=create(plan_case)["result"]["plan"]["items"][0]["task"]
    assert post(client,f"/api/tasks/{child['id']}/plan/preview",plan_case[7]).status_code==422
    assert client.get(f"/api/tasks/{child['id']}/plan").json()["parent"]["task_id"]==plan_case[6]["id"]


def test_actual_provider_work_review_unblocks_dependent_run(fixture):
    app,provider,_=fixture
    with TestClient(app) as client:
        project,model,parent=seed(client)
        definition={"items":[
            {"key":"a","title":"Review source","goal":"Analyze selected source constraints",
             "acceptance":"An evidence-based source report","files":["README.md"],"depends_on":[]},
            {"key":"b","title":"Validate advice","goal":"Review the accepted source findings",
             "acceptance":"A concrete validation proposal","files":["README.md"],"depends_on":["a"]},
        ]}
        case=(client,app,provider,None,project,model,parent,definition)
        children=[item["task"] for item in create(case)["result"]["plan"]["items"]]
        first=source_run(case,children[0])
        result=wait_status(client,first["id"],{"succeeded","failed"})
        assert result["run"]["status"]=="succeeded"
        assert child_run(case,children[1]).status_code==409
        report=next(item for item in result["artifacts"] if item["kind"]=="report")
        assert post(client,f"/api/artifacts/{report['id']}/decision",{"decision":"accepted"}).status_code==200
        second=child_run(case,children[1])
        assert second.status_code==201,second.text
        result=wait_status(client,second.json()["id"],{"succeeded","failed"})
        assert result["run"]["status"]=="succeeded"
        assert result["run"]["context"]["task_dependencies"]["prerequisites"][0]["reports"][0]["id"]==report["id"]
        assert len(provider.requests)==8


def test_plan_api_does_not_expand_paired_device_scope(device_case):
    owner,paired,_,provider,_,_,_,task=device_case
    create_pair(owner,task);claim(paired)
    assert paired.get(f"/api/tasks/{task['id']}/plan").status_code==403
    assert post(paired,f"/api/tasks/{task['id']}/plan/preview",{"items":[]}).status_code==403
    assert provider.requests==[]


def test_coding_preparation_and_execution_both_enforce_dependencies(plan_case):
    client,app,provider,settings,_,model,parent,definition=plan_case
    (settings.workspace/"source.py").write_text("value = 1\n")
    (settings.workspace/"test_source.py").write_text("import unittest\nclass Check(unittest.TestCase):\n    def test_value(self): self.assertTrue(True)\n")
    with app.state.store.transaction() as db:
        db.execute("UPDATE tasks SET files=? WHERE id=?",(json.dumps(["source.py","test_source.py"]),parent["id"]))
    for item in definition["items"]:item["files"]=["source.py","test_source.py"]
    source,child=[item["task"] for item in create(plan_case)["result"]["plan"]["items"]]
    config={"model_id":model["id"],"writable":["source.py"],"tests":["test_source.py"],
            "max_rounds":1,"test_timeout":5,"max_output_tokens":8192}
    candidate=post(client,f"/api/tasks/{child['id']}/coding/preview",config).json()
    body={**config,"request_id":"dependency-coding-request","preview_hash":candidate["candidate_hash"]}
    assert post(client,f"/api/tasks/{child['id']}/coding/prepare",body).status_code==409
    _,report=succeed_and_review(plan_case,source)
    job=post(client,f"/api/tasks/{child['id']}/coding/prepare",body).json()
    assert job["state"]=="prepared"
    app.state.store.decide(report,"changes_requested")
    control={"candidate_hash":job["candidate_hash"],"consent":True}
    assert post(client,f"/api/tasks/{child['id']}/coding/{job['request_id']}/execute",control).status_code==409
    assert post(client,f"/api/tasks/{child['id']}/coding/{job['request_id']}/discard",control).status_code==200
    assert provider.requests==[]


def test_prepared_recovery_cannot_consume_before_prerequisite_reapproval(plan_case):
    client,app,*_=plan_case
    source,child=[item["task"] for item in create(plan_case)["result"]["plan"]["items"]]
    _,report=succeed_and_review(plan_case,source)
    run=child_run(plan_case,child).json();app.state.store.finish_run(run["id"],"failed")
    retry=client.get(f"/api/runs/{run['id']}/retry-preview").json()
    body={"request_id":"guarded-recovery-request","mode":"retry","snapshot_hash":retry["snapshot_hash"],
          "config":{**retry["defaults"],"max_calls":max(3,retry["minimum_calls"])}}
    assert post(client,f"/api/runs/{run['id']}/recovery-intents",body).status_code==200
    app.state.store.decide(report,"changes_requested")
    endpoint=f"/api/runs/{run['id']}/recovery-intents/{body['request_id']}/execute"
    assert post(client,endpoint,{"consent":True,"acknowledge_replay":True}).status_code==409
    assert client.get(f"/api/runs/{run['id']}/recovery-intents/{body['request_id']}").json()["state"]=="prepared"
    app.state.store.decide(report,"accepted")
    result=post(client,endpoint,{"consent":True,"acknowledge_replay":True})
    assert result.status_code==200,result.text
    assert result.json()["state"]=="applied"
    assert plan_case[2].requests==[]


def test_device_execution_grant_cannot_bypass_dependency_revalidation(device_case):
    owner,paired,app,provider,settings,project,model,parent=device_case
    definition={"items":[
        {"key":"a","title":"Source","goal":"Analyze selected source boundary","acceptance":"Source report accepted","files":parent["files"],"depends_on":[]},
        {"key":"b","title":"Dependent","goal":"Validate source analysis outcome","acceptance":"Validation report accepted","files":parent["files"],"depends_on":["a"]},
    ]}
    case=(owner,app,provider,settings,project,model,parent,definition)
    source,child=[item["task"] for item in create(case)["result"]["plan"]["items"]]
    _,report=succeed_and_review(case,source)
    create_pair(owner,child);device=claim(paired).json()
    turn=save(owner,child)
    prepared=post(owner,turn_path(child,turn,"prepare"),prepare_body(owner,child,turn,model)).json()
    grant=post(owner,f"/api/devices/{device['id']}/execution-grants",{
        "request_id":"plan-device-execution","turn_id":turn["id"],
        "candidate_hash":prepared["candidate"]["candidate_hash"],"expected_device_revision":1,"consent":True,
    }).json()["grant"]
    app.state.store.decide(report,"changes_requested")
    command={"candidate_hash":grant["candidate_hash"],"consent":True}
    endpoint=f"/api/device/execution-grants/{grant['id']}/execute"
    assert post(paired,endpoint,command).status_code==409
    assert paired.get(f"/api/device/execution-grants/{grant['id']}").json()["grant"]["state"]=="authorized"
    app.state.store.decide(report,"accepted")
    applied=post(paired,endpoint,command)
    assert applied.status_code==200,applied.text
    assert applied.json()["grant"]["state"]=="applied"
    assert provider.requests==[]
