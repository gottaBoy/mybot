import json
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from test_workbench import FakeProvider, HEADERS, post
from workbench.app import create_app
from workbench.config import Settings
from workbench.saved_views import TASK_COLUMNS, SavedViewError
from workbench.store import Store


@pytest.fixture
def views(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    settings = Settings(tmp_path / "data", workspace, poll_interval=0.01)
    provider = FakeProvider()
    app = create_app(settings, provider)
    # No lifespan worker is started. This configuration API has no execution path.
    client = TestClient(app)
    projects = [
        post(client, "/api/projects", {"name": name}).json()
        for name in ("Alpha", "Beta")
    ]
    yield client, app, provider, settings, projects
    assert provider.requests == []
    client.close()


def definition(projects=None):
    return {
        "schema_version": 1,
        "query": {
            "text": "PRIVATE_QUERY_NOT_IN_AUDIT", "projects": projects or [],
            "states": ["pending", "completed"], "jql": "", "mode": "basic",
        },
        "table": {
            "page_size": 50,
            "sorts": [
                {"sortKey": "status", "direction": "ascending"},
                {"sortKey": "created_at", "direction": "descending"},
            ],
            "columns": ["id", "title", "status"],
            "column_order": list(reversed(TASK_COLUMNS)),
        },
    }


def payload(project=None, **changes):
    return {
        "id": str(uuid.uuid4()), "name": "PRIVATE_VIEW_NAME",
        "scope_type": "project" if project else "workspace",
        "project_id": project,
        "definition": definition([project] if project else []),
        **changes,
    }


def create(client, body=None):
    return post(client, "/api/saved-views", body or payload())


def update(client, identifier, revision=1, **changes):
    return client.put(f"/api/saved-views/{identifier}", json={
        "name": "Updated view", "definition": definition(),
        "expected_revision": revision, **changes,
    }, headers=HEADERS)


def delete(client, identifier, revision=1, **changes):
    return post(client, f"/api/saved-views/{identifier}/delete", {
        "expected_revision": revision, **changes,
    })


def events(store):
    with store.transaction() as db:
        return [
            dict(row) for row in db.execute(
                "SELECT * FROM events WHERE kind LIKE 'saved_view.%' ORDER BY seq",
            )
        ]


def test_create_read_list_and_same_request_retry_are_durable_configuration_only(views):
    client, app, _, settings, projects = views
    body = payload(definition=definition([projects[0]["id"]]))
    first = create(client, body)
    assert first.status_code == 201, first.text
    value = first.json()
    assert set(value) == {
        "id", "name", "scope_type", "project_id", "definition", "revision",
        "created_at", "updated_at",
    }
    assert value["id"] == body["id"]
    assert value["revision"] == 1
    assert value["created_at"] == value["updated_at"]
    assert value["definition"] == body["definition"]
    assert create(client, body).json() == value
    assert client.get(f"/api/saved-views/{value['id']}").json() == value
    assert client.get("/api/saved-views").json() == {
        "items": [value], "total": 1, "limit": 100, "offset": 0, "has_more": False,
    }
    assert Store(settings.data_dir).saved_view(value["id"]) == value
    assert len(events(app.state.store)) == 1
    assert client.get("/api/bootstrap").json()["runs"] == []
    serialized_events = json.dumps(events(app.state.store))
    assert "PRIVATE_QUERY_NOT_IN_AUDIT" not in serialized_events
    assert "PRIVATE_VIEW_NAME" not in serialized_events
    assert "definition" not in serialized_events


def test_update_uses_cas_and_does_not_return_current_state_as_original_create_receipt(views):
    client, app, _, _, _ = views
    body = payload()
    first = create(client, body).json()
    changed = update(client, first["id"], definition={
        **definition(), "query": {**definition()["query"], "text": "new query"},
    })
    assert changed.status_code == 200
    assert changed.json()["revision"] == 2
    assert changed.json()["created_at"] == first["created_at"]
    stale = update(client, first["id"], name="Stale overwrite")
    assert stale.status_code == 409
    assert stale.json()["detail"] == {
        "code": "saved_view_revision_conflict", "current_revision": 2,
    }
    retry = create(client, body)
    assert retry.status_code == 409
    assert retry.json()["detail"] == {
        "code": "saved_view_create_superseded", "current_revision": 2,
    }
    assert client.get(f"/api/saved-views/{first['id']}").json() == changed.json()
    assert [row["kind"] for row in events(app.state.store)] == [
        "saved_view.created", "saved_view.updated",
    ]


def test_delete_is_cas_idempotent_and_clears_private_content_without_resurrection(views):
    client, app, _, settings, _ = views
    body = payload()
    value = create(client, body).json()
    stale = delete(client, value["id"], 2)
    assert stale.status_code == 409
    assert stale.json()["detail"]["current_revision"] == 1
    deleted = delete(client, value["id"])
    assert deleted.status_code == 200
    receipt = deleted.json()
    assert receipt == {
        "id": value["id"], "deleted": True, "revision": 2,
        "deleted_at": receipt["deleted_at"],
    }
    assert delete(client, value["id"]).json() == receipt
    assert Store(settings.data_dir).delete_saved_view(value["id"], 1) == receipt
    assert delete(client, value["id"], 2).status_code == 409
    assert client.get(f"/api/saved-views/{value['id']}").status_code == 404
    assert client.get("/api/saved-views").json()["total"] == 0
    assert create(client, body).json()["detail"] == {
        "code": "saved_view_deleted", "current_revision": 2,
    }
    assert update(client, value["id"], 2).json()["detail"] == {
        "code": "saved_view_deleted", "current_revision": 2,
    }
    with app.state.store.transaction() as db:
        tombstone = dict(db.execute(
            "SELECT * FROM saved_views WHERE id=?", (value["id"],),
        ).fetchone())
    assert tombstone["name"] is tombstone["definition"] is None
    assert len(tombstone["create_hash"]) == 64
    assert "PRIVATE_" not in json.dumps(tombstone)
    assert [row["kind"] for row in events(app.state.store)] == [
        "saved_view.created", "saved_view.deleted",
    ]


@pytest.mark.parametrize("field,value", [
    ("name", "different"), ("scope_type", "project"),
    ("definition", {**definition(), "table": {**definition()["table"], "page_size": 20}}),
])
def test_existing_id_with_changed_payload_is_never_treated_as_a_retry(views, field, value):
    client, _, _, _, projects = views
    body = payload()
    create(client, body)
    changed = {**body, field: value}
    if field == "scope_type":
        changed.update(project_id=projects[0]["id"], definition=definition([projects[0]["id"]]))
    response = create(client, changed)
    assert response.status_code == 409
    assert response.json()["detail"] == {
        "code": "saved_view_id_conflict", "current_revision": 1,
    }


@pytest.mark.parametrize("path,value", [
    ("extra", True), ("id", "not-a-uuid"), ("id", "a" * 31),
    ("name", ""), ("name", "   "), ("name", "x" * 101), ("name", 123),
    ("scope_type", "workbench"), ("project_id", 123),
    ("definition.extra", True), ("definition.schema_version", 2),
    ("definition.schema_version", True), ("definition.schema_version", "1"),
    ("definition.schema_version", 1.0),
    ("definition.query.extra", True), ("definition.query.text", "x" * 2001),
    ("definition.query.text", None), ("definition.query.projects", "all"),
    ("definition.query.projects", [""]), ("definition.query.projects", [" padded"]),
    ("definition.query.projects", ["a", "a"]),
    ("definition.query.projects", ["x" * 101]),
    ("definition.query.projects", [str(index) for index in range(101)]),
    ("definition.query.states", ["all"]), ("definition.query.states", ["failed"]),
    ("definition.query.states", ["active", "active"]),
    ("definition.query.states", ["pending", "active", "attention", "completed", "other", "pending"]),
    ("definition.query.mode", "query"),
    ("definition.query.jql", "assignee = currentUser()"),
    ("definition.query.jql", "ORDER BY status ASC"),
    ("definition.table.extra", True), ("definition.table.page_size", 25),
    ("definition.table.page_size", "50"), ("definition.table.page_size", 50.0),
    ("definition.table.page_size", True), ("definition.table.columns", []),
    ("definition.table.columns", ["id"]), ("definition.table.columns", ["title", "title"]),
    ("definition.table.columns", ["title", "unknown"]),
    ("definition.table.column_order", ["title"]),
    ("definition.table.column_order", ["title"] * 7),
    ("definition.table.sorts", "[]"),
    ("definition.table.sorts", [{"sortKey": "assignee", "direction": "ascending"}]),
    ("definition.table.sorts", [{"sortKey": "title", "direction": "asc"}]),
    ("definition.table.sorts", [{"sortKey": "title", "direction": "ascending", "extra": True}]),
    ("definition.table.sorts", [
        {"sortKey": "title", "direction": "ascending"},
        {"sortKey": "title", "direction": "descending"},
    ]),
    ("definition.table.sorts", [
        {"sortKey": key, "direction": "ascending"} for key in TASK_COLUMNS[:4]
    ]),
])
def test_all_nested_definition_inputs_are_strict_and_bad_entries_are_not_dropped(views, path, value):
    client, app, _, _, _ = views
    body = payload()
    target = body
    keys = path.split(".")
    for key in keys[:-1]:
        target = target[key]
    target[keys[-1]] = value
    response = create(client, body)
    assert response.status_code == 422, response.text
    assert client.get("/api/saved-views").json()["items"] == []
    assert events(app.state.store) == []


def test_named_defaults_query_text_and_supported_jql_normalization_are_explicit(views):
    client, _, _, _, _ = views
    body = payload(name="  trimmed name  ")
    body["definition"]["query"]["text"] = "  preserve text  "
    body["definition"]["query"]["jql"] = " order   by summary desc "
    body["definition"]["query"]["mode"] = "jql"
    body["definition"]["table"]["sorts"] = []
    body["definition"]["table"]["columns"] = ["title"]
    value = create(client, body).json()
    assert value["name"] == "trimmed name"
    assert value["definition"]["query"]["text"] == "  preserve text  "
    assert value["definition"]["query"]["jql"] == "ORDER BY SUMMARY DESC"
    assert value["definition"]["table"]["sorts"] == []
    assert value["definition"]["table"]["columns"] == ["title"]
    assert create(client, body).json() == value


@pytest.mark.parametrize("jql", [
    "", "ORDER BY created ASC", "ORDER BY created DESC",
    "ORDER BY summary ASC", "ORDER BY summary DESC",
])
def test_only_the_existing_finite_jql_sort_set_is_saved(views, jql):
    client, _, _, _, _ = views
    body = payload()
    body["definition"]["query"]["jql"] = jql
    assert create(client, body).status_code == 201


def test_project_references_and_fixed_scope_are_enforced_at_the_api_and_update_boundary(views):
    client, _, _, _, projects = views
    alpha, beta = [project["id"] for project in projects]
    unknown = payload(definition=definition(["not-present"]))
    assert create(client, unknown).json()["detail"] == {"code": "saved_view_project_unavailable"}
    for body in (
        payload(alpha, definition=definition([beta])),
        payload(alpha, definition=definition()),
        payload(scope_type="project", project_id=None),
        payload(project_id=alpha),
    ):
        assert create(client, body).status_code == 422
    fixed = create(client, payload(alpha)).json()
    escaped = update(client, fixed["id"], definition=definition([beta]))
    assert escaped.status_code == 422
    assert escaped.json()["detail"] == {"code": "saved_view_scope_invalid"}
    valid = update(client, fixed["id"], definition=definition([alpha]))
    assert valid.status_code == 200
    assert valid.json()["scope_type"] == "project"
    assert valid.json()["project_id"] == alpha
    assert valid.json()["definition"]["query"]["projects"] == [alpha]


@pytest.mark.parametrize("changes", [
    {"scope_type": "workspace"}, {"project_id": None}, {"id": uuid.uuid4().hex},
    {"expected_revision": 0}, {"expected_revision": True},
    {"expected_revision": "1"}, {"expected_revision": 1.0}, {"extra": True},
])
def test_updates_do_not_accept_scope_moves_ids_or_coerced_revisions(views, changes):
    client, _, _, _, _ = views
    value = create(client).json()
    assert update(client, value["id"], **changes).status_code == 422
    assert client.get(f"/api/saved-views/{value['id']}").json() == value


@pytest.mark.parametrize("revision", [None, 0, -1, True, 1.0, "1"])
def test_delete_requires_a_strict_positive_revision(views, revision):
    client, _, _, _, _ = views
    value = create(client).json()
    assert delete(client, value["id"], revision).status_code == 422
    assert client.get(f"/api/saved-views/{value['id']}").json() == value


def test_directory_has_scope_filters_real_pagination_and_no_success_shaped_missing_project(views):
    client, _, _, _, projects = views
    alpha, beta = [project["id"] for project in projects]
    values = [
        create(client, payload()).json(), create(client, payload()).json(),
        create(client, payload(alpha)).json(), create(client, payload(beta)).json(),
    ]
    whole = client.get("/api/saved-views").json()
    assert whole["total"] == 4
    first = client.get("/api/saved-views?offset=0&limit=2").json()
    second = client.get("/api/saved-views?offset=2&limit=2").json()
    assert first["has_more"] is True
    assert second["has_more"] is False
    assert first["items"] + second["items"] == whole["items"]
    assert client.get("/api/saved-views?scope_type=workspace").json()["total"] == 2
    scoped = client.get(f"/api/saved-views?scope_type=project&project_id={alpha}").json()
    assert scoped["items"] == [values[2]]
    beyond = client.get("/api/saved-views?offset=100&limit=2").json()
    assert beyond == {"items": [], "total": 4, "limit": 2, "offset": 100, "has_more": False}
    assert client.get("/api/saved-views?scope_type=project&project_id=missing").json()["detail"] == {
        "code": "saved_view_project_unavailable",
    }


@pytest.mark.parametrize("query", [
    "scope_type=team", "scope_type=project", "project_id=missing",
    "scope_type=workspace&project_id=missing", "offset=-1", "offset=bad",
    "limit=0", "limit=101", "limit=bad", "extra=true", "limit=1&limit=2",
    "offset=9007199254740992", "offset=999999999999999999999999999999999999",
])
def test_directory_rejects_invalid_scope_pagination_and_extra_parameters(views, query):
    client, _, _, _, _ = views
    assert client.get(f"/api/saved-views?{query}").status_code == 422


@pytest.mark.parametrize("identifier", [uuid.uuid4().hex, str(uuid.uuid4()), str(uuid.uuid4()).upper()])
def test_both_client_uuid_forms_retain_the_exact_submitted_identity(views, identifier):
    client, _, _, _, _ = views
    value = create(client, payload(id=identifier)).json()
    assert value["id"] == identifier
    assert client.get(f"/api/saved-views/{identifier}").json() == value


def test_unknown_or_invalid_identifiers_are_explicit_not_fake_objects(views):
    client, _, _, _, _ = views
    missing = uuid.uuid4().hex
    for response in (
        client.get(f"/api/saved-views/{missing}"),
        update(client, missing), delete(client, missing),
    ):
        assert response.status_code == 404
        assert response.json()["detail"] == {"code": "saved_view_not_found"}
    assert client.get("/api/saved-views/not-an-id").status_code == 422


def test_concurrent_create_retries_and_conflicting_creates_do_not_duplicate(views):
    client, app, _, _, _ = views
    body = payload()
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: create(client, body), range(2)))
    assert [response.status_code for response in responses] == [201, 201]
    assert responses[0].json() == responses[1].json()
    assert len(events(app.state.store)) == 1
    other = payload()
    bodies = [other, {**other, "name": "Conflicting tab"}]
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda value: create(client, value), bodies))
    assert sorted(response.status_code for response in responses) == [201, 409]
    assert client.get("/api/saved-views").json()["total"] == 2
    assert len(events(app.state.store)) == 2


def test_cross_store_cas_updates_have_one_winner_and_preserve_the_committed_revision(views):
    client, _, _, settings, _ = views
    value = create(client).json()
    stores = [Store(settings.data_dir), Store(settings.data_dir)]
    def attempt(index):
        try:
            return stores[index].update_saved_view(value["id"], {
                "name": f"Tab {index}", "definition": definition(), "expected_revision": 1,
            })
        except SavedViewError as error:
            return error
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(attempt, range(2)))
    winner = next(item for item in outcomes if isinstance(item, dict))
    conflict = next(item for item in outcomes if isinstance(item, SavedViewError))
    assert winner["revision"] == 2
    assert conflict.detail() == {"code": "saved_view_revision_conflict", "current_revision": 2}
    assert stores[0].saved_view(value["id"]) == winner


def test_concurrent_delete_retries_have_one_tombstone_and_one_audit_event(views):
    client, app, _, _, _ = views
    value = create(client).json()
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: delete(client, value["id"]), range(2)))
    assert all(response.status_code == 200 for response in responses)
    assert responses[0].json() == responses[1].json()
    assert [row["kind"] for row in events(app.state.store)] == [
        "saved_view.created", "saved_view.deleted",
    ]


def test_update_and_delete_race_cannot_apply_two_commands_against_one_revision(views):
    client, _, _, _, _ = views
    value = create(client).json()
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(update, client, value["id"]),
            pool.submit(delete, client, value["id"]),
        ]
        responses = [future.result() for future in futures]
    assert sorted(response.status_code for response in responses) == [200, 409]
    failed = next(response for response in responses if response.status_code == 409)
    assert failed.json()["detail"]["current_revision"] == 2


@pytest.mark.parametrize("operation", ["create", "update", "delete"])
def test_audit_failure_rolls_back_the_whole_configuration_mutation(views, monkeypatch, operation):
    client, app, _, _, _ = views
    body = payload()
    before = None if operation == "create" else create(client, body).json()
    prior_events = events(app.state.store)
    def broken_event(*_):
        raise RuntimeError("synthetic audit failure")
    monkeypatch.setattr(app.state.store, "_saved_view_event", broken_event)
    with pytest.raises(RuntimeError, match="synthetic audit failure"):
        if operation == "create":
            app.state.store.create_saved_view(body)
        elif operation == "update":
            app.state.store.update_saved_view(body["id"], {
                "name": "Must roll back", "definition": definition(), "expected_revision": 1,
            })
        else:
            app.state.store.delete_saved_view(body["id"], 1)
    if before is None:
        assert client.get(f"/api/saved-views/{body['id']}").status_code == 404
    else:
        assert client.get(f"/api/saved-views/{body['id']}").json() == before
    assert events(app.state.store) == prior_events


def test_existing_auth_origin_request_boundary_and_private_response_headers_apply(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    settings = Settings(tmp_path / "data", workspace, access_token="s" * 40)
    provider = FakeProvider()
    app = create_app(settings, provider)
    with TestClient(app) as client:
        assert client.get("/api/saved-views").status_code == 401
        assert create(client).status_code == 401
        assert post(client, "/api/auth", {"token": settings.access_token}).status_code == 200
        assert client.post("/api/saved-views", json=payload()).status_code == 403
        assert client.post("/api/saved-views", json=payload(), headers={
            **HEADERS, "Origin": "https://attacker.example",
        }).status_code == 403
        assert client.get("/api/saved-views", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
        response = create(client)
        assert response.status_code == 201
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-content-type-options"] == "nosniff"
        identifier = response.json()["id"]
        post(client, "/api/logout", {})
        assert client.get(f"/api/saved-views/{identifier}").status_code == 401
        assert update(client, identifier).status_code == 401
        assert delete(client, identifier).status_code == 401
    assert provider.requests == []
