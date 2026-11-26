import json

import pytest
from fastapi.testclient import TestClient

from test_task_turns import turn_case, path, save, prepare_body, execute
from test_workbench import post, run_body, seed, wait_status, fixture
from workbench.task_turns import TaskTurnPreview
from workbench.store import now, uid
from test_devices import device_case, create_pair, claim


def source(client, app, task, model, content="Prior evidence\n中文结果", title="Prior report", status="succeeded"):
    # Seed completed source facts atomically; do not race the fixture worker.
    run = {"id": uid()}
    with app.state.store.transaction() as db:
        db.execute(
            "INSERT INTO runs(id,task_id,request_id,status,config,context,created_at)"
            " VALUES(?,?,?,?,?,?,?)",
            (run["id"], task["id"], uid(), status, "{}", "{}", now()),
        )
    identifier = app.state.store.artifact(run["id"], None, title, "report", content)
    return identifier, run


def catalog(client, task, query=""):
    return client.get(f"/api/tasks/{task['id']}/artifacts{query}")


def refs(client, task, *ids):
    items = catalog(client, task).json()["items"]
    return [{"id": item["id"], "sha256": item["sha256"]} for identifier in ids for item in items if item["id"] == identifier]


def preview(client, task, turn, selected):
    return post(client, path(task, turn, "preview"), {"artifact_refs": selected})


def prepare(client, task, turn, model, selected, snapshot):
    body = {**prepare_body(client, task, turn, model), "artifact_refs": selected,
            "context_hash": snapshot["context_hash"]}
    return post(client, path(task, turn, "prepare"), body)


def test_catalog_is_bounded_task_scoped_metadata_only(turn_case):
    client, app, _, _, project, model, task = turn_case
    first, run = source(client, app, task, model)
    for number in range(23):
        app.state.store.artifact(run["id"], None, str(number), "diff", f"patch {number}")
    other = post(client, "/api/tasks", {
        "project_id": project["id"], "title": "Other Task", "goal": "Different Task goal",
    }).json()
    foreign, _ = source(client, app, other, model)
    value = catalog(client, task).json()
    assert value["unit"] == "task_artifacts"
    assert value["total"] == 24 and len(value["items"]) == 20
    assert value["has_more"] is True and value["page_size"] == 20
    assert all("content" not in item and item["task_id"] == task["id"] for item in value["items"])
    second = catalog(client, task, "?page=2").json()
    assert len(second["items"]) == 4 and second["has_more"] is False
    assert {first, foreign}.intersection({item["id"] for item in value["items"] + second["items"]}) == {first}
    assert catalog(client, task, "?page=999").json()["page"] == 2


@pytest.mark.parametrize("query", ["?page=0", "?page=1&page=2", "?page_size=1", "?extra=1"])
def test_catalog_rejects_parameters(turn_case, query):
    client, _, _, _, _, _, task = turn_case
    assert catalog(client, task, query).status_code == 422
    assert client.get("/api/tasks/missing/artifacts").status_code == 404


def test_empty_oversize_and_active_artifacts_are_not_admitted(turn_case):
    client, app, _, _, _, model, task = turn_case
    empty, _ = source(client, app, task, model, content="")
    huge, _ = source(client, app, task, model, content="中" * 12000)
    active, active_run = source(client, app, task, model)
    with app.state.store.transaction() as db:
        db.execute("UPDATE runs SET status='running' WHERE id=?", (active_run["id"],))
    options = catalog(client, task).json()["items"]
    assert {item["id"] for item in options} == {empty, huge}
    assert all(item["sha256"] is None for item in options)
    turn = save(client, task)
    for identifier in (empty, huge, active):
        response = preview(client, task, turn, [{"id": identifier, "sha256": "a" * 64}])
        assert response.status_code in {404, 422}


def test_explicit_selection_hash_binding_and_frozen_snapshot(turn_case):
    client, app, provider, settings, _, model, task = turn_case
    selected_id, source_run = source(client, app, task, model)
    hidden_id = app.state.store.artifact(source_run["id"], None, "Not selected", "diff", "DO_NOT_SEND_HIDDEN_RESULT")
    turn = save(client, task)
    selected = refs(client, task, selected_id)
    plain = preview(client, task, turn, []).json()
    assert "artifacts" not in plain and "Prior evidence" not in plain["text"]
    value = preview(client, task, turn, selected).json()
    assert value["context_hash"] != plain["context_hash"]
    assert len(value["artifacts"]) == 1
    record = value["artifacts"][0]
    assert record["id"] == selected_id and record["run_id"] == source_run["id"]
    assert record["sha256"] == selected[0]["sha256"]
    assert json.dumps(record["content"], ensure_ascii=False) in value["text"]
    assert record["bytes"] == len(record["content"].encode())
    assert "DO_NOT_SEND_HIDDEN_RESULT" not in value["text"]
    assert value["bytes"] == len(value["text"].encode())
    assert provider.requests == []
    assert app.state.task_turns.read(task["id"], turn["id"])["state"] == "saved"
    frozen_response = prepare(client, task, turn, model, selected, value)
    assert frozen_response.status_code == 200, frozen_response.text
    frozen = frozen_response.json()
    assert frozen["candidate"]["snapshot"]["artifacts"] == value["artifacts"]
    with app.state.store.transaction() as db:
        db.execute("UPDATE artifacts SET content='Changed after prepare' WHERE id=?", (selected_id,))
    assert preview(client, task, turn, selected).json()["artifacts"] == value["artifacts"]
    applied = execute(client, task, frozen)
    assert applied.status_code == 200
    run = app.state.store.get("runs", applied.json()["run_id"])
    assert run["context"]["artifacts"] == value["artifacts"]
    assert run["context"]["text"] == value["text"]
    assert hidden_id not in json.dumps(run["context"])
    assert (settings.workspace / "README.md").read_text().startswith("Selected source")


def test_changed_artifact_rejected_before_freeze_and_candidate_conflicts_after(turn_case):
    client, app, _, _, _, model, task = turn_case
    identifier, _ = source(client, app, task, model)
    turn = save(client, task)
    selected = refs(client, task, identifier)
    before = preview(client, task, turn, selected).json()
    with app.state.store.transaction() as db:
        db.execute("UPDATE artifacts SET content='Changed before prepare' WHERE id=?", (identifier,))
    assert preview(client, task, turn, selected).status_code == 409
    assert prepare(client, task, turn, model, selected, before).status_code == 409
    selected = refs(client, task, identifier)
    fresh = preview(client, task, turn, selected).json()
    frozen = prepare(client, task, turn, model, selected, fresh).json()
    assert frozen["candidate"]
    assert prepare(client, task, turn, model, [], fresh).status_code == 409
    assert preview(client, task, turn, [{"id": identifier, "sha256": "0" * 64}]).status_code == 409


@pytest.mark.parametrize("kind", ["foreign", "duplicate", "four", "extra", "hash", "string"])
def test_bad_selection_fails_closed(turn_case, kind):
    client, app, _, _, project, model, task = turn_case
    identifier, _ = source(client, app, task, model)
    selected = refs(client, task, identifier)
    other = post(client, "/api/tasks", {
        "project_id": project["id"], "title": "Another", "goal": "Another Task goal",
    }).json()
    turn = save(client, other if kind == "foreign" else task)
    sent = {
        "foreign": selected, "duplicate": selected * 2, "four": selected * 4,
        "extra": [{**selected[0], "content": "inject"}],
        "hash": [{"id": identifier, "sha256": "invalid"}], "string": identifier,
    }[kind]
    response = preview(client, other if kind == "foreign" else task, turn, sent)
    assert response.status_code == (404 if kind == "foreign" else 422)


def test_aggregate_limit_and_consent_unchanged(turn_case):
    client, app, provider, _, _, model, task = turn_case
    identifiers = [source(client, app, task, model, content="x" * 23000)[0] for _ in range(3)]
    turn = save(client, task)
    selected = refs(client, task, *identifiers)
    assert preview(client, task, turn, selected).status_code == 422
    selected = selected[:2]
    value = preview(client, task, turn, selected).json()
    prepared = prepare(client, task, turn, model, selected, value).json()
    assert execute(client, task, prepared, consent=False).status_code == 422
    assert provider.requests == []


def test_selected_result_reaches_actual_provider_not_other_history(fixture):
    app, provider, _ = fixture
    with TestClient(app) as client:
        _, model, task = seed(client)
        identifier, source_run = source(client, app, task, model, content="EXPLICIT_REFERENCE_TOKEN")
        app.state.store.artifact(source_run["id"], None, "Not selected", "report", "HIDDEN_HISTORY_TOKEN")
        turn = save(client, task)
        selected = refs(client, task, identifier)
        value = preview(client, task, turn, selected).json()
        prepared = prepare(client, task, turn, model, selected, value).json()
        receipt = execute(client, task, prepared).json()
        detail = wait_status(client, receipt["run_id"], {"succeeded", "failed"})
        assert detail["run"]["status"] == "succeeded"
        assert len(provider.requests) == 4
        for _, messages in provider.requests:
            prompt = messages[-1]["content"]
            assert "EXPLICIT_REFERENCE_TOKEN" in prompt
            assert "HIDDEN_HISTORY_TOKEN" not in prompt


def test_device_grant_discloses_count_without_reference_body_or_new_read_scope(device_case):
    owner, paired, app, provider, _, _, model, task = device_case
    identifier, _ = source(owner, app, task, model, content="PRIVATE_ARTIFACT_BODY")
    create_pair(owner, task)
    device = claim(paired).json()
    assert catalog(paired, task).status_code == 403
    turn = save(owner, task)
    selected = refs(owner, task, identifier)
    assert preview(paired, task, turn, selected).status_code == 403
    value = preview(owner, task, turn, selected).json()
    prepared = prepare(owner, task, turn, model, selected, value).json()
    receipt = post(owner, f"/api/devices/{device['id']}/execution-grants", {
        "request_id": "artifact-device-grant", "turn_id": turn["id"],
        "candidate_hash": prepared["candidate"]["candidate_hash"],
        "expected_device_revision": 1, "consent": True,
    })
    assert receipt.status_code == 200, receipt.text
    grant = receipt.json()["grant"]
    assert grant["artifact_count"] == 1
    assert "PRIVATE_ARTIFACT_BODY" not in json.dumps(grant)
    assert identifier not in json.dumps(grant)
    executed = post(paired, f"/api/device/execution-grants/{grant['id']}/execute", {
        "candidate_hash": grant["candidate_hash"], "consent": True,
    })
    assert executed.status_code == 200, executed.text
    context = app.state.store.get("runs", executed.json()["grant"]["run_id"])["context"]
    assert context["artifacts"] == value["artifacts"]
    assert provider.requests == []
