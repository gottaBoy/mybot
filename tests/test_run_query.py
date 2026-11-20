from functools import cmp_to_key
import json
from pathlib import Path
import sqlite3

from fastapi.testclient import TestClient
import pytest

from test_workbench import FakeProvider
from workbench.app import create_app
from workbench.config import Settings
from workbench.run_query import RunQueryError, parse_run_query, read_run_page
from workbench.task_query import EMPTY_QUERY, MAX_PAGE, natural_compare


def criteria(**patch):
    return {
        "text": "", "projects": [], "states": [], "jql": "", "mode": "basic",
        **patch,
    }


def params(query=None, sorts=None, **patch):
    return {
        "query": json.dumps(criteria() if query is None else query),
        "sorts": json.dumps([] if sorts is None else sorts), **patch,
    }


@pytest.fixture
def run_history(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    provider = FakeProvider()
    app = create_app(Settings(tmp_path / "data", workspace), provider)
    store = app.state.store
    with store.transaction() as db:
        for project in ("alpha", "beta", "empty"):
            db.execute("INSERT INTO projects VALUES(?,?,?,?,?,?)", (
                project, project.capitalize(), "PRIVATE_PROJECT_GOAL",
                "PRIVATE_DIRECTORY", "PRIVATE_NOTES", "2026-11-20T00:00:00Z",
            ))
        for task, project, title in (
            ("recovered", "alpha", "Release 2"), ("never", "alpha", "Never run"),
            ("active", "alpha", "Release 10"), ("paused", "beta", "Release 3"),
            ("canceled", "beta", "Release 20"), ("unknown", "beta", "Unknown state"),
        ):
            db.execute("INSERT INTO tasks VALUES(?,?,?,?,?,?,?)", (
                task, project, title, "PRIVATE_TASK_GOAL", "PRIVATE_ACCEPTANCE",
                '["PRIVATE_FILE"]', "2026-11-20T00:00:00Z",
            ))
        for index in range(45):
            add_run(
                db, f"history-{index:03}", "recovered",
                "succeeded" if index == 44 else "failed",
                f"2026-11-20T01:{index:02}:00Z",
            )
        for identifier, task, status in (
            ("active-run", "active", "running"), ("paused-run", "paused", "paused"),
            ("canceled-run", "canceled", "canceled"), ("unknown-run", "unknown", "future_status"),
        ):
            add_run(db, identifier, task, status, "2026-11-20T02:00:00Z")
    # Active statuses must remain data; this client deliberately avoids engine lifespan.
    client = TestClient(app)
    yield client, store, provider
    assert provider.requests == []
    client.close()


def add_run(db, identifier, task, status, created_at="2026-11-20T03:00:00Z"):
    db.execute(
        "INSERT INTO runs(id,task_id,request_id,status,config,context,error,created_at)"
        " VALUES(?,?,?,?,?,?,?,?)",
        (identifier, task, f"request-{identifier}", status,
         '{"PRIVATE_CONFIG":true}', '{"PRIVATE_CONTEXT":true}', "PRIVATE_ERROR", created_at),
    )


def page(client, **kwargs):
    response = client.get("/api/runs/query", params=params(**kwargs))
    assert response.status_code == 200, response.text
    return response.json()


def ids(value):
    return [item["run"]["id"] for item in value["items"]]


def test_bootstrap_advertises_run_query_and_static_route_precedes_detail(run_history):
    client, _, _ = run_history
    assert client.get("/api/bootstrap").json()["capabilities"]["run_query"] is True
    assert client.get("/api/runs/query").json()["unit"] == "runs"
    assert client.get("/api/runs/missing-run").status_code == 404


def test_exact_bounded_projection_counts_all_attempts_without_private_payload(run_history):
    client, _, _ = run_history
    value = page(client)
    assert set(value) == {
        "schema_version", "unit", "items", "total", "requested_page", "page",
        "page_size", "total_pages", "has_more", "query", "sorts",
        "scope_project_id", "sort_semantics",
    }
    assert {key: value[key] for key in value if key != "items"} == {
        "schema_version": 1, "unit": "runs", "total": 49,
        "requested_page": 1, "page": 1, "page_size": 20,
        "total_pages": 3, "has_more": True, "query": criteria(), "sorts": [],
        "scope_project_id": None, "sort_semantics": "unicode-natural-v1",
    }
    assert len(value["items"]) == 20
    assert value["items"][0] == {
        "run": {
            "id": "active-run", "task_id": "active", "status": "running",
            "created_at": "2026-11-20T02:00:00Z",
        },
        "task": {"id": "active", "project_id": "alpha", "title": "Release 10"},
        "project": {"id": "alpha", "name": "Alpha"},
        "state_category": "active",
    }
    assert "PRIVATE" not in json.dumps(value)
    assert all(set(item) == {"run", "task", "project", "state_category"}
               for item in value["items"])


@pytest.mark.parametrize("state,total", [
    ("pending", 0), ("active", 1), ("attention", 45), ("completed", 1), ("other", 2),
])
def test_run_own_state_not_task_latest_state_and_pending_tasks_have_no_run(run_history, state, total):
    client, _, _ = run_history
    value = page(client, query=criteria(states=[state]), page_size=100)
    assert value["total"] == len(value["items"]) == total
    assert all(item["state_category"] == state for item in value["items"])
    if state == "attention":
        assert len([item for item in value["items"] if item["task"]["id"] == "recovered"]) == 44
        assert "history-044" not in ids(value)
    assert "never" not in {item["run"]["task_id"] for item in value["items"]}


@pytest.mark.parametrize("status,state", [
    ("queued", "active"), ("running", "active"), ("pause_requested", "active"),
    ("cancel_requested", "active"), ("failed", "attention"), ("interrupted", "attention"),
    ("paused", "attention"), ("succeeded", "completed"), ("canceled", "other"),
    ("pending", "other"), ("new_provider_status", "other"),
])
def test_every_run_status_is_classified_independently(run_history, status, state):
    client, store, _ = run_history
    with store.transaction() as db:
        db.execute("UPDATE runs SET status=? WHERE id='active-run'", (status,))
    value = page(client, query=criteria(text="active-run"))
    assert value["total"] == 1
    assert value["items"][0]["run"]["status"] == status
    assert value["items"][0]["state_category"] == state


def test_or_within_fields_and_across_fields_with_canonical_response(run_history):
    client, _, _ = run_history
    value = page(client, query=criteria(
        projects=["beta", "alpha"], states=["completed", "active"], text="release",
    ), page_size=100)
    assert value["total"] == 2
    assert set(ids(value)) == {"history-044", "active-run"}
    assert value["query"]["projects"] == ["alpha", "beta"]
    assert value["query"]["states"] == ["active", "completed"]


def test_fixed_scope_wins_over_valid_candidates_and_empty_project_is_true_empty(run_history):
    client, _, _ = run_history
    value = page(
        client, query=criteria(projects=["missing", "beta"]), scope_project_id="alpha",
        page_size=100,
    )
    assert value["total"] == 46
    assert value["query"]["projects"] == ["alpha"]
    assert value["scope_project_id"] == "alpha"
    assert {item["project"]["id"] for item in value["items"]} == {"alpha"}
    empty = page(client, query=criteria(projects=["empty"]), page=100)
    assert empty["total"] == 0 and empty["items"] == []
    assert empty["page"] == empty["total_pages"] == 1


@pytest.mark.parametrize("arguments", [
    {"query": criteria(projects=["missing"])},
    {"scope_project_id": "missing"},
])
def test_unavailable_effective_project_is_not_empty_or_unfiltered(run_history, arguments):
    client, _, _ = run_history
    response = client.get("/api/runs/query", params=params(**arguments))
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "run_query_project_unavailable"}}


@pytest.mark.parametrize("text", ["history-000", "recovered", "Release 2", "alpha", "Alpha"])
def test_text_matches_all_run_history_task_and_project_identities(run_history, text):
    client, _, _ = run_history
    value = page(client, query=criteria(text=text), page_size=100)
    assert value["total"] > 0
    if text == "history-000":
        assert ids(value) == ["history-000"]
    if text == "recovered":
        assert value["total"] == 45
    if text.lower() == "alpha":
        assert value["total"] == 46


def test_literal_unicode_query_does_not_search_private_fields(run_history):
    client, store, _ = run_history
    with store.transaction() as db:
        db.execute("UPDATE tasks SET title=? WHERE id='active'", ("Ä研发 %_'; DROP TABLE",))
    for text in ("ä研发", "%_", "'; DROP TABLE"):
        assert ids(page(client, query=criteria(text=text))) == ["active-run"]
    for text in ("PRIVATE_CONFIG", "PRIVATE_CONTEXT", "PRIVATE_ERROR", "PRIVATE_TASK_GOAL",
                 "PRIVATE_NOTES", "PRIVATE_FILE", "PRIVATE_DIRECTORY"):
        assert page(client, query=criteria(text=text))["total"] == 0


@pytest.mark.parametrize("space", ["\u0085", "\u001c", "\u001d", "\u001e", "\u001f"])
def test_query_canonicalization_reuses_python_whitespace_and_jql(space, run_history):
    client, _, _ = run_history
    value = page(client, query=criteria(
        text=f"{space}release{space}",
        jql=f"{space}order{space}by{space}summary{space}desc{space}", mode="jql",
    ))
    assert value["query"]["text"] == "release"
    assert value["query"]["jql"] == "ORDER BY SUMMARY DESC"
    assert value["sorts"] == [{"sortKey": "title", "direction": "descending"}]


def test_bom_remains_literal_instead_of_being_trimmed(run_history):
    client, _, _ = run_history
    value = page(client, query=criteria(text="\ufeffrelease\ufeff"))
    assert value["query"]["text"] == "\ufeffrelease\ufeff"
    assert value["total"] == 0
    assert client.get("/api/runs/query", params=params(
        query=criteria(jql="\ufeffORDER BY CREATED ASC"),
    )).status_code == 422


@pytest.mark.parametrize("capacity", [20, 50, 100])
def test_bounded_pagination_and_clamp_preserve_requested_page(run_history, capacity):
    client, _, _ = run_history
    pages = [page(client, page=index, page_size=capacity)
             for index in range(1, max(1, (49 + capacity - 1) // capacity) + 1)]
    all_ids = [identifier for value in pages for identifier in ids(value)]
    assert len(all_ids) == len(set(all_ids)) == 49
    last = page(client, page=MAX_PAGE, page_size=capacity)
    assert last["requested_page"] == MAX_PAGE
    assert last["page"] == last["total_pages"] == len(pages)
    assert last["has_more"] is False
    assert ids(last) == ids(pages[-1])
    empty = page(client, query=criteria(text="no such run"), page=20, page_size=capacity)
    assert empty["items"] == [] and empty["total"] == 0
    assert empty["page"] == empty["total_pages"] == 1 and empty["requested_page"] == 20


@pytest.mark.parametrize("key", ["id", "title", "projectName", "status", "created_at"])
@pytest.mark.parametrize("direction", ["ascending", "descending"])
def test_every_single_run_sort_is_global_before_pagination(run_history, key, direction):
    client, _, _ = run_history
    sorts = [{"sortKey": key, "direction": direction}]
    default = page(client, page_size=100)["items"]
    def field(item):
        return (
            item["task"]["title"] if key == "title" else
            item["project"]["name"] if key == "projectName" else item["run"][key]
        )
    expected = sorted(default, key=cmp_to_key(
        lambda left, right: natural_compare(field(left), field(right)) *
        (1 if direction == "ascending" else -1),
    ))
    whole = page(client, sorts=sorts, page_size=100)
    assert whole["sorts"] == sorts
    assert ids(whole) == [item["run"]["id"] for item in expected]
    assert ids(page(client, sorts=sorts)) == ids(whole)[:20]
    assert ids(page(client, sorts=sorts, page=2)) == ids(whole)[20:40]


def test_natural_title_and_run_id_ordering_is_not_lexical(run_history):
    client, store, _ = run_history
    with store.transaction() as db:
        add_run(db, "extra-run-10", "active", "canceled")
        add_run(db, "extra-run-2", "paused", "canceled")
    value = page(client, sorts=[{"sortKey": "title", "direction": "ascending"}], page_size=100)
    titles = list(dict.fromkeys(item["task"]["title"] for item in value["items"]))
    assert titles == ["Release 2", "Release 3", "Release 10", "Release 20", "Unknown state"]
    value = page(client, query=criteria(text="extra-run"),
                 sorts=[{"sortKey": "id", "direction": "ascending"}])
    assert ids(value) == ["extra-run-2", "extra-run-10"]


def test_jql_overrides_valid_run_sort_and_created_means_run_creation(run_history):
    client, _, _ = run_history
    value = page(client, query=criteria(jql="order by created asc", mode="jql"),
                 sorts=[{"sortKey": "title", "direction": "descending"}])
    assert value["query"]["jql"] == "ORDER BY CREATED ASC"
    assert value["sorts"] == [{"sortKey": "created_at", "direction": "ascending"}]
    assert ids(value)[0] == "history-000"


def test_equal_created_and_explicit_keys_use_original_run_source_order(run_history):
    client, store, _ = run_history
    with store.transaction() as db:
        add_run(db, "z-first", "active", "canceled", "2099-01-01T00:00:00Z")
        add_run(db, "a-second", "active", "canceled", "2099-01-01T00:00:00Z")
    assert ids(page(client))[:2] == ["z-first", "a-second"]
    assert ids(page(client, query=criteria(text="active"),
                    sorts=[{"sortKey": "title", "direction": "ascending"}]))[:2] == [
        "z-first", "a-second",
    ]


@pytest.mark.parametrize("patch", [
    {"projects": ["alpha", "alpha"]}, {"projects": [1]}, {"projects": [" alpha"]},
    {"projects": ["x"] * 101}, {"projects": ["x" * 101]}, {"projects": ["\udfff"]},
    {"states": ["active", "active"]}, {"states": ["unknown"]}, {"states": "active"},
    {"text": True}, {"text": "x" * 2001}, {"text": "\ud800"}, {"mode": "unknown"},
    {"jql": "assignee = currentUser()"}, {"jql": "ORDER BY created DESC; DROP TABLE runs"},
    {"extra": "not admitted"},
])
def test_malformed_query_fails_explicitly_even_with_fixed_scope(run_history, patch):
    client, _, _ = run_history
    response = client.get("/api/runs/query", params=params(
        query=criteria(**patch), scope_project_id="alpha",
    ))
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "run_query_invalid"}}


@pytest.mark.parametrize("sorts", [
    [{"sortKey": "updated", "direction": "ascending"}],
    [{"sortKey": "attempts", "direction": "ascending"}],
    [{"sortKey": "title", "direction": "ascending"},
     {"sortKey": "created_at", "direction": "descending"}],
    [{"sortKey": "title", "direction": "descending"}] * 2,
    [{"sortKey": "unknown", "direction": "ascending"}],
    [{"sortKey": "title", "direction": "asc"}],
    [{"sortKey": "title", "direction": "ascending", "extra": True}],
    ["title"], {"title": "ascending"}, None,
])
def test_run_sort_whitelist_rejects_task_fields_multisort_and_invalid_shapes(run_history, sorts):
    client, _, _ = run_history
    response = client.get("/api/runs/query", params={
        "query": json.dumps(criteria(jql="ORDER BY CREATED DESC")),
        "sorts": json.dumps(sorts),
    })
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "run_query_invalid"}}


@pytest.mark.parametrize("field,raw", [
    ("query", "{"), ("query", "null"), ("query", "[]"),
    ("query", '{"text":"","text":"different"}'), ("query", '{"text":NaN}'),
    ("query", "{" * 1500), ("sorts", "[NaN]"),
    ("sorts", '[{"sortKey":"id","sortKey":"title","direction":"ascending"}]'),
])
def test_nonstandard_duplicate_or_deep_json_fails_closed(run_history, field, raw):
    client, _, _ = run_history
    response = client.get("/api/runs/query", params={field: raw})
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "run_query_invalid"}}


@pytest.mark.parametrize("arguments", [
    [("page", "1"), ("page", "2")], [("page_size", "20"), ("page_size", "50")],
    [("query", "{}"), ("query", "{}")], [("sorts", "[]"), ("sorts", "[]")],
    [("scope_project_id", "alpha"), ("scope_project_id", "beta")],
    [("group", "none")], [("runOrder", "title:ascending")], [("assignee", "currentUser()")],
])
def test_unknown_and_repeated_transport_parameters_are_rejected(run_history, arguments):
    client, _, _ = run_history
    response = client.get("/api/runs/query", params=arguments)
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "run_query_parameters_invalid"}}


@pytest.mark.parametrize("arguments", [
    {"page": 0}, {"page": -1}, {"page": "1.1"}, {"page": MAX_PAGE + 1},
    {"page_size": 21}, {"page_size": 0}, {"page_size": 101}, {"page_size": "true"},
    {"scope_project_id": " alpha"}, {"scope_project_id": "alpha\u0085"},
    {"scope_project_id": ""}, {"scope_project_id": "x" * 101},
])
def test_page_and_scope_transport_bounds_are_explicit(run_history, arguments):
    client, _, _ = run_history
    assert client.get("/api/runs/query", params=params(**arguments)).status_code == 422


@pytest.mark.parametrize("arguments", [
    (EMPTY_QUERY, "[]", "\ud800", 1, 20), (EMPTY_QUERY, "[]", None, True, 20),
    (EMPTY_QUERY, "[]", None, 1.0, 20), (EMPTY_QUERY, "[]", None, 1, True),
    (EMPTY_QUERY, "[]", None, 1, 20.0),
])
def test_parser_rejects_non_strict_python_inputs_and_surrogate_scope(arguments):
    with pytest.raises(RunQueryError):
        parse_run_query(*arguments)


def test_pagination_does_not_create_missing_database(tmp_path):
    database = tmp_path / "absent.sqlite3"
    with pytest.raises(sqlite3.OperationalError):
        read_run_page(database, parse_run_query(EMPTY_QUERY, "[]", None, 1, 20))
    assert not database.exists()


def test_empty_workspace_is_explicit_empty_without_provider(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    provider = FakeProvider()
    app = create_app(Settings(tmp_path / "data", workspace), provider)
    with TestClient(app) as client:
        value = page(client, page=99)
        assert value["total"] == 0 and value["items"] == []
        assert value["page"] == value["total_pages"] == 1
    assert provider.requests == []


def test_orphan_tasks_and_runs_do_not_enter_history(run_history):
    client, store, _ = run_history
    with sqlite3.connect(store.path) as db:
        db.execute("INSERT INTO tasks VALUES('orphan','missing','Orphan','','','[]','')")
        add_run(db, "orphan-run", "orphan", "running")
        add_run(db, "missing-task-run", "missing-task", "running")
    assert page(client)["total"] == 49
    assert page(client, query=criteria(text="orphan"))["total"] == 0
    assert page(client, query=criteria(text="missing-task-run"))["total"] == 0


def test_read_does_not_mutate_business_rows_or_events(run_history):
    client, store, provider = run_history
    before = {table: store.list(table) for table in ("projects", "tasks", "runs", "models")}
    with sqlite3.connect(store.path) as db:
        events = db.execute("SELECT * FROM events").fetchall()
    page(client, page_size=100)
    assert before == {table: store.list(table) for table in before}
    with sqlite3.connect(store.path) as db:
        assert events == db.execute("SELECT * FROM events").fetchall()
    assert provider.requests == []


def test_read_does_not_take_write_lock_or_expose_uncommitted_status(run_history):
    client, store, _ = run_history
    with store.transaction() as db:
        db.execute("UPDATE runs SET status='failed' WHERE id='active-run'")
        value = page(client, query=criteria(text="active-run"))
        assert value["items"][0]["state_category"] == "active"
    assert page(client, query=criteria(text="active-run"))["items"][0]["state_category"] == "attention"


def test_total_and_rows_are_one_snapshot_during_concurrent_commit(run_history, monkeypatch):
    client, store, _ = run_history
    original = sqlite3.connect
    changed = []

    class ConcurrentConnection(sqlite3.Connection):
        def execute(self, sql, parameters=()):
            result = super().execute(sql, parameters)
            if sql.endswith("SELECT COUNT(*) FROM filtered") and not changed:
                with original(store.path) as writer:
                    writer.execute("UPDATE runs SET status='failed' WHERE id='active-run'")
                    writer.execute("UPDATE tasks SET title='Changed title' WHERE id='active'")
                    add_run(writer, "concurrent-run", "active", "running", "2099")
                changed.append(True)
            return result

    monkeypatch.setattr(
        "workbench.run_query.sqlite3.connect",
        lambda *args, **kwargs: original(*args, **kwargs, factory=ConcurrentConnection),
    )
    value = page(client, page_size=100)
    assert value["total"] == len(value["items"]) == 49
    active = next(item for item in value["items"] if item["run"]["id"] == "active-run")
    assert active["state_category"] == "active" and active["task"]["title"] == "Release 10"
    assert "concurrent-run" not in ids(value)
    after = page(client, page_size=100)
    assert after["total"] == len(after["items"]) == 50
    assert after["items"][0]["task"]["title"] == "Changed title"


@pytest.mark.parametrize("outcome", ["success", "missing-project", "read-failure"])
def test_readonly_transaction_and_connection_close_on_all_outcomes(run_history, monkeypatch, outcome):
    _, store, _ = run_history
    original = sqlite3.connect
    opened = []
    observed = []

    class TrackingConnection(sqlite3.Connection):
        closed = False

        def execute(self, sql, parameters=()):
            if sql.lstrip().startswith("WITH"):
                assert super().execute("PRAGMA query_only").fetchone()[0] == 1
                assert self.in_transaction is True
                with pytest.raises(sqlite3.OperationalError):
                    super().execute("DELETE FROM runs")
                observed.append(sql)
                if outcome == "read-failure":
                    raise sqlite3.OperationalError("injected read failure")
            return super().execute(sql, parameters)

        def close(self):
            super().close()
            with pytest.raises(sqlite3.ProgrammingError, match="closed"):
                super().execute("SELECT 1")
            self.closed = True

    def connect(*args, **kwargs):
        assert args[0].endswith("?mode=ro") and kwargs["uri"] is True
        connection = original(*args, **kwargs, factory=TrackingConnection)
        opened.append(connection)
        return connection

    monkeypatch.setattr("workbench.run_query.sqlite3.connect", connect)
    request = parse_run_query(
        json.dumps(criteria(projects=["missing"])) if outcome == "missing-project" else EMPTY_QUERY,
        "[]", None, 1, 20,
    )
    if outcome == "missing-project":
        with pytest.raises(RunQueryError) as caught:
            read_run_page(store.path, request)
        assert caught.value.code == "run_query_project_unavailable"
    elif outcome == "read-failure":
        with pytest.raises(sqlite3.OperationalError, match="injected"):
            read_run_page(store.path, request)
    else:
        read_run_page(store.path, request)
    assert len(opened) == 1 and opened[0].closed
    if outcome != "missing-project":
        assert observed


def test_authentication_and_cross_site_boundary_remain_required(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    provider = FakeProvider()
    app = create_app(Settings(tmp_path / "data", workspace, access_token="run-fixture"), provider)
    with TestClient(app) as client:
        assert client.get("/api/runs/query").status_code == 401
        assert client.post(
            "/api/auth", json={"token": "run-fixture"},
            headers={"X-Workbench-Request": "1"},
        ).status_code == 200
        assert client.get("/api/runs/query", headers={"sec-fetch-site": "cross-site"}).status_code == 403
        assert page(client)["total"] == 0
    assert provider.requests == []
