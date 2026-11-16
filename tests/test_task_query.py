import json
from pathlib import Path
import sqlite3

from fastapi.testclient import TestClient
import pytest

from test_workbench import FakeProvider
from workbench.app import create_app
from workbench.config import Settings
from workbench.task_query import MAX_PAGE, natural_compare


def criteria(**patch):
    return {
        "text": "", "projects": [], "states": [], "jql": "", "mode": "basic",
        **patch,
    }


def params(query=None, sorts=None, **patch):
    return {
        "query": json.dumps(criteria() if query is None else query),
        "sorts": json.dumps(sorts or []), **patch,
    }


@pytest.fixture
def task_query(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    provider = FakeProvider()
    app = create_app(Settings(tmp_path / "data", workspace), provider)
    store = app.state.store
    with store.transaction() as db:
        for project in ("alpha", "beta", "gamma"):
            db.execute("INSERT INTO projects VALUES(?,?,?,?,?,?)", (
                project, project.capitalize(), "Goal", ".", "", "2026-11-16T00:00:00Z",
            ))
            for index in range(24):
                identifier = f"{project}-{index:03}"
                db.execute("INSERT INTO tasks VALUES(?,?,?,?,?,?,?)", (
                    identifier, project, f"Release {index + 1}", "PRIVATE_GOAL",
                    "Acceptance", '["README.md"]',
                    f"2026-11-16T00:0{index % 4}:00Z",
                ))
                status = (None, "running", "failed", "succeeded", "canceled", "future_state")[index % 6]
                if status == "succeeded":
                    db.execute(
                        "INSERT INTO runs(id,task_id,request_id,status,config,context,created_at)"
                        " VALUES(?,?,?,'failed','{}','{}',?)",
                        (f"old-{identifier}", identifier, f"old-request-{identifier}", "2026-11-15T00:00:00Z"),
                    )
                if status is not None:
                    db.execute(
                        "INSERT INTO runs(id,task_id,request_id,status,config,context,created_at)"
                        " VALUES(?,?,?,?,'{}','{}',?)",
                        (f"run-{identifier}", identifier, f"request-{identifier}", status,
                         f"2026-11-16T01:{index:02}:00Z"),
                    )
    # Do not start the execution lifespan for query fixtures containing active statuses.
    client = TestClient(app)
    yield client, store, provider
    assert provider.requests == []
    client.close()


def page(client, **kwargs):
    response = client.get("/api/tasks/query", params=params(**kwargs))
    assert response.status_code == 200, response.text
    return response.json()


def ids(value):
    return [item["task"]["id"] for item in value["items"]]


def test_bootstrap_explicitly_advertises_readonly_task_query_support(task_query):
    client, _, _ = task_query
    assert client.get("/api/bootstrap").json()["capabilities"]["task_query"] is True


@pytest.mark.parametrize("space", ["\u0085", "\u001c", "\u001d", "\u001e", "\u001f"])
def test_query_canonicalization_uses_python_whitespace(task_query, space):
    client, _, _ = task_query
    value = page(client, query=criteria(
        text=f"{space}release{space}",
        jql=f"{space}order{space}by{space}summary{space}desc{space}",
    ))
    assert value["query"]["text"] == "release"
    assert value["query"]["jql"] == "ORDER BY SUMMARY DESC"
    assert value["sorts"] == [{"sortKey": "title", "direction": "descending"}]
    assert value["total"] == 72


def test_query_keeps_bom_as_literal_text_instead_of_whitespace(task_query):
    client, _, _ = task_query
    value = page(client, query=criteria(text="\ufeffrelease\ufeff"))
    assert value["query"]["text"] == "\ufeffrelease\ufeff"
    assert value["total"] == 0
    response = client.get("/api/tasks/query", params=params(
        query=criteria(jql="\ufeffORDER BY SUMMARY DESC"),
    ))
    assert response.status_code == 422


def test_default_page_counts_current_tasks_not_attempts_and_has_bounded_projection(task_query):
    client, store, _ = task_query
    with store.transaction() as db:
        db.execute(
            "INSERT INTO runs(id,task_id,request_id,status,config,context,created_at)"
            " VALUES('extra-history','alpha-001','extra-history','failed','{}','{}',"
            "'2026-11-14T00:00:00Z')"
        )
    before = {table: store.list(table) for table in ("runs", "tasks", "models")}
    assert len(before["runs"]) == 73
    value = page(client)
    assert value["total"] == 72
    assert len(value["items"]) == 20
    assert value["unit"] == "tasks"
    assert value["page"] == value["requested_page"] == 1
    assert value["total_pages"] == 4
    assert value["has_more"] is True
    assert value["sort_semantics"] == "unicode-natural-v1"
    assert value["scope_project_id"] is None
    assert set(value["items"][0]) == {
        "task", "project", "latest_run", "attempts", "state_category",
    }
    assert value["items"][0]["task"]["files"] == ["README.md"]
    assert "context" not in json.dumps(value)
    assert before == {table: store.list(table) for table in before}


@pytest.mark.parametrize("state,total", [
    ("pending", 12), ("active", 12), ("attention", 12),
    ("completed", 12), ("other", 24),
])
def test_state_categories_use_only_the_latest_actual_run(task_query, state, total):
    client, _, _ = task_query
    value = page(client, query=criteria(states=[state]), page_size=100)
    assert value["total"] == total
    assert {item["state_category"] for item in value["items"]} == {state}
    if state == "pending":
        assert all(item["latest_run"] is None and item["attempts"] == 0 for item in value["items"])
    if state == "completed":
        assert all(item["latest_run"]["status"] == "succeeded" and item["attempts"] == 2
                   for item in value["items"])


@pytest.mark.parametrize("status,state", [
    ("queued", "active"), ("running", "active"), ("pause_requested", "active"),
    ("cancel_requested", "active"), ("failed", "attention"), ("interrupted", "attention"),
    ("paused", "attention"), ("succeeded", "completed"), ("canceled", "other"),
    ("new_provider_state", "other"),
])
def test_all_persisted_execution_status_categories(task_query, status, state):
    client, store, _ = task_query
    with store.transaction() as db:
        db.execute("UPDATE runs SET status=? WHERE id='run-alpha-001'", (status,))
    value = page(client, query=criteria(text="alpha-001"))
    assert value["total"] == 1
    assert value["items"][0]["state_category"] == state


def test_or_within_fields_and_and_across_fields_and_text(task_query):
    client, _, _ = task_query
    value = page(client, query=criteria(
        projects=["beta", "alpha"], states=["completed", "active"], text="release",
    ), page_size=100)
    assert value["total"] == 16
    assert {item["task"]["project_id"] for item in value["items"]} == {"alpha", "beta"}
    assert {item["state_category"] for item in value["items"]} == {"active", "completed"}
    assert value["query"]["projects"] == ["alpha", "beta"]
    assert value["query"]["states"] == ["active", "completed"]


def test_fixed_scope_wins_over_valid_conflicting_project_selection(task_query):
    client, _, _ = task_query
    value = page(client, query=criteria(projects=["unavailable", "beta"]),
                 scope_project_id="alpha", page_size=100)
    assert value["total"] == 24
    assert {item["task"]["project_id"] for item in value["items"]} == {"alpha"}
    assert value["query"]["projects"] == ["alpha"]
    assert value["scope_project_id"] == "alpha"


@pytest.mark.parametrize("arguments", [
    {"query": criteria(projects=["unavailable"])},
    {"scope_project_id": "unavailable"},
])
def test_unavailable_project_is_not_a_success_shaped_empty_or_unfiltered_result(task_query, arguments):
    client, _, _ = task_query
    response = client.get("/api/tasks/query", params=params(**arguments))
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "task_query_project_unavailable"}}


@pytest.mark.parametrize("patch", [
    {"projects": ["alpha", "alpha"]}, {"projects": [1]}, {"projects": [" alpha"]},
    {"projects": ["x"] * 101}, {"states": ["active", "active"]},
    {"states": ["unknown"]}, {"states": "active"}, {"text": True},
    {"text": "x" * 2001}, {"mode": "unknown"}, {"jql": "assignee = currentUser()"},
    {"text": "\ud800"}, {"projects": ["\udfff"]},
    {"jql": "ORDER BY created DESC; DROP TABLE tasks"}, {"extra": "not admitted"},
])
def test_malformed_query_is_rejected_without_provider_or_unfiltered_success(task_query, patch):
    client, _, _ = task_query
    response = client.get("/api/tasks/query", params=params(query=criteria(**patch)))
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "task_query_invalid"}}


@pytest.mark.parametrize("sorts", [
    [{"sortKey": "title", "direction": "descending"}] * 2,
    [{"sortKey": "unknown", "direction": "ascending"}],
    [{"sortKey": "title", "direction": "asc"}],
    [{"sortKey": "title", "direction": "ascending", "extra": True}],
    [{"sortKey": key, "direction": "ascending"} for key in ("id", "title", "status", "updated")],
    ["title"], {"title": "ascending"},
])
def test_sort_whitelist_rejects_invalid_and_duplicate_definitions(task_query, sorts):
    client, _, _ = task_query
    response = client.get("/api/tasks/query", params={
        "query": json.dumps(criteria()), "sorts": json.dumps(sorts),
    })
    assert response.status_code == 422


@pytest.mark.parametrize("raw", [
    "{", "null", "[]", '{"text":"","text":"different"}',
    '{"text":NaN}', "{" * 1500,
])
def test_nonstandard_duplicate_or_deep_json_fails_closed(task_query, raw):
    client, _, _ = task_query
    response = client.get("/api/tasks/query", params={"query": raw})
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "task_query_invalid"}}


@pytest.mark.parametrize("arguments", [
    [("page", "1"), ("page", "2")],
    [("query", "{}"), ("query", "{}")],
    [("group", "none")], [("assignee", "currentUser()")],
])
def test_unknown_and_repeated_transport_parameters_are_rejected(task_query, arguments):
    client, _, _ = task_query
    response = client.get("/api/tasks/query", params=arguments)
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "task_query_parameters_invalid"}}


@pytest.mark.parametrize("arguments", [
    {"page": 0}, {"page": -1}, {"page": "1.1"}, {"page": MAX_PAGE + 1},
    {"page_size": 21}, {"page_size": 0}, {"page_size": 101}, {"page_size": "true"},
    {"scope_project_id": " alpha"},
])
def test_page_and_scope_bounds_are_explicit(task_query, arguments):
    client, _, _ = task_query
    assert client.get("/api/tasks/query", params=params(**arguments)).status_code == 422


def test_pagination_is_stable_bounded_and_clamps_explicitly(task_query):
    client, _, _ = task_query
    pages = [page(client, page=index) for index in range(1, 5)]
    all_ids = [identifier for value in pages for identifier in ids(value)]
    assert len(set(all_ids)) == len(all_ids) == 72
    assert [len(value["items"]) for value in pages] == [20, 20, 20, 12]
    assert ids(page(client)) == ids(pages[0])
    last = page(client, page=MAX_PAGE)
    assert last["requested_page"] == MAX_PAGE
    assert last["page"] == last["total_pages"] == 4
    assert last["has_more"] is False
    assert ids(last) == ids(pages[-1])
    empty = page(client, query=criteria(text="no such task"), page=20)
    assert empty["items"] == [] and empty["total"] == 0
    assert empty["page"] == empty["total_pages"] == 1


def test_natural_sorting_then_stable_ties_happens_before_pagination(task_query):
    client, _, _ = task_query
    sorts = [
        {"sortKey": "title", "direction": "ascending"},
        {"sortKey": "projectName", "direction": "descending"},
    ]
    first = page(client, sorts=sorts)
    assert [item["task"]["title"] for item in first["items"][:6]] == [
        "Release 1", "Release 1", "Release 1", "Release 2", "Release 2", "Release 2",
    ]
    assert [item["project"]["name"] for item in first["items"][:3]] == ["Gamma", "Beta", "Alpha"]
    second = page(client, sorts=sorts, page=2)
    whole = page(client, sorts=sorts, page_size=100)
    assert ids(second) == ids(whole)[20:40]


def test_supported_jql_order_is_authoritative_without_expanding_the_grammar(task_query):
    client, _, _ = task_query
    value = page(client, query=criteria(jql=" order  by summary desc ", mode="jql"),
                 sorts=[{"sortKey": "title", "direction": "ascending"}])
    assert value["query"]["jql"] == "ORDER BY SUMMARY DESC"
    assert value["sorts"] == [{"sortKey": "title", "direction": "descending"}]
    assert value["items"][0]["task"]["title"] == "Release 24"


def test_search_is_unicode_lowercase_literal_and_includes_latest_id_only(task_query):
    client, store, _ = task_query
    with store.transaction() as db:
        db.execute("UPDATE tasks SET title=? WHERE id='alpha-000'", ("Ä研发 %_'; DROP TABLE tasks",))
    for text in ("ä研发", "%_", "'; DROP TABLE"):
        assert ids(page(client, query=criteria(text=text))) == ["alpha-000"]
    assert ids(page(client, query=criteria(text="run-alpha-003"))) == ["alpha-003"]
    assert page(client, query=criteria(text="old-alpha-003"))["total"] == 0
    assert page(client, query=criteria(text="Alpha"), page_size=100)["total"] == 24


def test_equal_run_timestamps_use_the_existing_row_order_and_do_not_duplicate_tasks(task_query):
    client, store, _ = task_query
    with store.transaction() as db:
        db.execute(
            "INSERT INTO runs(id,task_id,request_id,status,config,context,created_at)"
            " SELECT 'same-time','alpha-001','same-time','failed','{}','{}',created_at"
            " FROM runs WHERE id='run-alpha-001'"
        )
    value = page(client, query=criteria(text="alpha-001"))
    assert value["total"] == 1
    assert value["items"][0]["latest_run"]["id"] == "run-alpha-001"
    assert value["items"][0]["attempts"] == 2


def test_query_does_not_take_a_write_lock_or_read_an_uncommitted_status(task_query):
    client, store, _ = task_query
    with store.transaction() as db:
        db.execute("UPDATE runs SET status='succeeded' WHERE id='run-alpha-002'")
        assert page(client, query=criteria(text="alpha-002"))["items"][0]["state_category"] == "attention"
    assert page(client, query=criteria(text="alpha-002"))["items"][0]["state_category"] == "completed"


def test_count_and_items_share_one_read_snapshot_during_a_concurrent_commit(task_query, monkeypatch):
    client, store, _ = task_query
    original_connect = sqlite3.connect
    inserted = []

    class ConcurrentConnection(sqlite3.Connection):
        def execute(self, sql, parameters=()):
            cursor = super().execute(sql, parameters)
            if sql.endswith("SELECT COUNT(*) FROM filtered") and not inserted:
                with original_connect(store.path) as writer:
                    writer.execute("INSERT INTO tasks VALUES(?,?,?,?,?,?,?)", (
                        "concurrent-task", "alpha", "Concurrent", "", "", "[]",
                        "2026-11-17T00:00:00Z",
                    ))
                inserted.append(True)
            return cursor

    def connect(*args, **kwargs):
        return original_connect(*args, **kwargs, factory=ConcurrentConnection)

    monkeypatch.setattr("workbench.task_query.sqlite3.connect", connect)
    result = page(client, page_size=100)
    assert result["total"] == len(result["items"]) == 72
    assert "concurrent-task" not in ids(result)
    after = page(client, page_size=100)
    assert after["total"] == len(after["items"]) == 73


def test_query_auth_boundary_and_missing_metadata_do_not_infer_identity(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    provider = FakeProvider()
    app = create_app(Settings(tmp_path / "data", workspace, access_token="x" * 32), provider)
    with TestClient(app) as client:
        assert client.get("/api/tasks/query").status_code == 401
        assert provider.requests == []


def test_read_connections_are_closed_after_success_and_validation_errors(task_query, monkeypatch):
    client, _, _ = task_query
    original_connect = sqlite3.connect
    connections = []
    closed = []

    class TrackingConnection(sqlite3.Connection):
        def close(self):
            super().close()
            # Verify closure on the same worker thread that owns the connection.
            with pytest.raises(sqlite3.ProgrammingError, match="closed"):
                super().execute("SELECT 1")
            closed.append(True)

    def connect(*args, **kwargs):
        db = original_connect(*args, **kwargs, factory=TrackingConnection)
        connections.append(db)
        return db

    monkeypatch.setattr("workbench.task_query.sqlite3.connect", connect)
    page(client)
    response = client.get("/api/tasks/query", params=params(query=criteria(projects=["missing"])))
    assert response.status_code == 422
    assert len(connections) == 2
    assert len(closed) == 2


def test_collation_handles_leading_zero_and_long_numbers_without_integer_coercion():
    assert natural_compare("Release 2", "release 10") < 0
    assert natural_compare("Release 02", "Release 2") == 0
    assert natural_compare("a" + "9" * 5000, "a1" + "0" * 5000) < 0


@pytest.mark.parametrize("left,right,expected", json.loads(
    (Path(__file__).parent / "fixtures/task-query-order.json").read_text()
))
def test_versioned_collation_shared_browser_cases(left, right, expected):
    assert natural_compare(left, right) == expected
