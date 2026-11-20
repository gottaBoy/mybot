import json
import sqlite3

from fastapi.testclient import TestClient
import pytest

from test_workbench import FakeProvider
from workbench.app import create_app
from workbench.config import Settings
from workbench.task_board import (
    BOARD_STATES, EMPTY_PAGES, TaskBoardError, parse_task_board, read_task_board,
)
from workbench.task_query import EMPTY_QUERY, MAX_PAGE


def criteria(**patch):
    return {
        "text": "", "projects": [], "states": [], "jql": "", "mode": "basic", **patch,
    }


def pages(**patch):
    return {**dict.fromkeys(BOARD_STATES, 1), **patch}


def params(query=None, column_pages=None, **patch):
    return {
        "query": json.dumps(criteria() if query is None else query),
        "pages": json.dumps(pages() if column_pages is None else column_pages),
        **patch,
    }


def add_run(db, identifier, task, status, created_at="2026-11-20T02:00:00Z"):
    db.execute(
        "INSERT INTO runs(id,task_id,request_id,status,config,context,error,created_at)"
        " VALUES(?,?,?,?,?,?,?,?)",
        (identifier, task, f"request-{identifier}", status,
         '{"PRIVATE_CONFIG":true}', '{"PRIVATE_CONTEXT":true}', "PRIVATE_ERROR", created_at),
    )


@pytest.fixture
def board(tmp_path):
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
        for state, status in zip(BOARD_STATES, (None, "running", "failed", "succeeded", "canceled")):
            for index in range(45):
                task = f"{state}-{index:03}"
                db.execute("INSERT INTO tasks VALUES(?,?,?,?,?,?,?)", (
                    task, "alpha" if index % 2 == 0 else "beta",
                    f"Release {state} {index}", f"Task goal {index}", f"Acceptance {index}",
                    json.dumps([f"file-{index}.md"]), f"2026-11-20T00:{index:02}:00Z",
                ))
                if status is not None:
                    add_run(db, f"run-{task}", task, status)
        add_run(db, "recovered-failure", "completed-000", "failed", "2026-11-19T00:00:00Z")
    # Keep active status records as data without starting the execution lifespan.
    client = TestClient(app)
    yield client, store, provider
    assert provider.requests == []
    client.close()


def read(client, **kwargs):
    response = client.get("/api/tasks/board", params=params(**kwargs))
    assert response.status_code == 200, response.text
    return response.json()


def column(value, state):
    return next(item for item in value["columns"] if item["state_category"] == state)


def task_ids(value):
    return [item["task"]["id"] for item in value["items"]]


def test_capability_and_static_route(board):
    client, _, _ = board
    assert client.get("/api/bootstrap").json()["capabilities"]["task_board"] is True
    assert client.get("/api/tasks/board").json()["unit"] == "task_board"
    assert client.get("/api/tasks/query").json()["unit"] == "tasks"
    assert client.get("/api/tasks/missing/detail").status_code == 404


def test_exact_bounded_projection_and_real_column_totals(board):
    client, _, _ = board
    value = read(client)
    assert set(value) == {
        "schema_version", "unit", "query", "scope_project_id", "order",
        "column_size", "total", "columns",
    }
    assert {key: value[key] for key in value if key != "columns"} == {
        "schema_version": 1, "unit": "task_board", "query": criteria(),
        "scope_project_id": None, "order": "tasks-created-v1", "column_size": 20,
        "total": 225,
    }
    assert [item["state_category"] for item in value["columns"]] == list(BOARD_STATES)
    assert sum(len(item["items"]) for item in value["columns"]) == 100
    for item in value["columns"]:
        assert set(item) == {
            "state_category", "total", "requested_page", "page",
            "total_pages", "has_more", "items",
        }
        assert item["total"] == 45
        assert item["requested_page"] == item["page"] == 1
        assert item["total_pages"] == 3 and item["has_more"] is True
        assert len(item["items"]) == 20
        assert task_ids(item) == [f"{item['state_category']}-{index:03}" for index in range(44, 24, -1)]
    assert "PRIVATE" not in json.dumps(value)
    assert column(value, "pending")["items"][0] == {
        "task": {
            "id": "pending-044", "project_id": "alpha", "title": "Release pending 44",
            "goal": "Task goal 44", "acceptance": "Acceptance 44", "files": ["file-44.md"],
            "created_at": "2026-11-20T00:44:00Z",
        },
        "project": {"id": "alpha", "name": "Alpha"},
        "latest_run": None, "state_category": "pending", "attempts": 0,
    }


def test_column_pages_are_independent_and_total_is_not_current_page_length(board):
    client, _, _ = board
    value = read(client, column_pages=pages(active=2, attention=3, other=MAX_PAGE))
    assert task_ids(column(value, "pending"))[0] == "pending-044"
    assert task_ids(column(value, "active")) == [f"active-{index:03}" for index in range(24, 4, -1)]
    for state in ("attention", "other"):
        item = column(value, state)
        assert task_ids(item) == [f"{state}-{index:03}" for index in range(4, -1, -1)]
        assert item["page"] == item["total_pages"] == 3 and item["has_more"] is False
    assert column(value, "other")["requested_page"] == MAX_PAGE
    assert value["total"] == 225


def test_filters_apply_before_counts_with_canonical_empty_columns(board):
    client, _, _ = board
    value = read(client, query=criteria(
        text="  Release  ", projects=["beta", "alpha"], states=["completed", "active"],
    ))
    assert value["query"] == criteria(
        text="Release", projects=["alpha", "beta"], states=["active", "completed"],
    )
    assert value["total"] == 90
    for item in value["columns"]:
        if item["state_category"] in ("active", "completed"):
            assert item["total"] == 45 and len(item["items"]) == 20
        else:
            assert item["total"] == 0 and item["items"] == []
            assert item["page"] == item["total_pages"] == 1


def test_fixed_scope_and_effective_project_availability(board):
    client, _, _ = board
    value = read(
        client, query=criteria(projects=["missing", "beta"]), scope_project_id="alpha",
    )
    assert value["query"]["projects"] == ["alpha"]
    assert value["scope_project_id"] == "alpha"
    assert value["total"] == 115
    assert all(item["project"]["id"] == "alpha"
               for col in value["columns"] for item in col["items"])
    response = client.get("/api/tasks/board", params=params(query=criteria(projects=["missing"])))
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "task_board_project_unavailable"}}
    value = read(client, query=criteria(projects=["empty"]), column_pages=pages(active=99))
    assert value["total"] == 0
    assert all(col["page"] == col["total_pages"] == 1 and col["items"] == []
               for col in value["columns"])
    assert column(value, "active")["requested_page"] == 99


def test_latest_recovered_task_and_full_task_dto_match_existing_list(board):
    client, _, _ = board
    value = read(client, query=criteria(text="completed-000"))
    item = column(value, "completed")["items"][0]
    assert item["attempts"] == 2 and item["latest_run"]["status"] == "succeeded"
    assert column(value, "attention")["total"] == 0
    listed = client.get("/api/tasks/query", params={"query": json.dumps(criteria(text="completed-000"))})
    assert listed.status_code == 200 and listed.json()["items"] == [item]


@pytest.mark.parametrize("status,state", [
    ("queued", "active"), ("running", "active"), ("pause_requested", "active"),
    ("cancel_requested", "active"), ("failed", "attention"), ("interrupted", "attention"),
    ("paused", "attention"), ("succeeded", "completed"), ("canceled", "other"),
    ("pending", "other"), ("future_status", "other"),
])
def test_latest_run_status_classification(board, status, state):
    client, store, _ = board
    with store.transaction() as db:
        db.execute("UPDATE runs SET status=? WHERE id='run-active-000'", (status,))
    value = read(client, query=criteria(text="active-000"))
    assert value["total"] == 1
    assert column(value, state)["items"][0]["latest_run"]["status"] == status


def test_latest_run_and_task_default_ties_follow_source_rowid(board):
    client, store, _ = board
    with store.transaction() as db:
        add_run(db, "later-tie", "completed-000", "failed")
        db.execute("UPDATE tasks SET created_at='2099' WHERE id IN ('pending-000','pending-001')")
    value = read(client)
    assert task_ids(column(value, "pending"))[:2] == ["pending-000", "pending-001"]
    item = column(read(client, query=criteria(text="completed-000")), "completed")["items"][0]
    assert item["latest_run"]["id"] == "run-completed-000" and item["attempts"] == 3


@pytest.mark.parametrize("term,total", [
    ("PENDING-000", 1), ("run-active-000", 1), ("Release active", 45),
    ("Alpha", 115), ("recovered-failure", 0), ("PRIVATE", 0),
    ("Task goal", 0), ("file-", 0), ("[", 0), ("%", 0), ("_", 0),
])
def test_literal_text_uses_existing_task_query_fields(board, term, total):
    client, _, _ = board
    assert read(client, query=criteria(text=term))["total"] == total


def test_unicode_ids_and_text_are_admitted_without_browser_semantics(board):
    client, store, _ = board
    with store.transaction() as db:
        db.execute("INSERT INTO projects VALUES(?,?,?,?,?,?)", (
            "项目/😀", "Équipe 中文", "", ".", "", "2026-11-20T00:00:00Z",
        ))
        db.execute("INSERT INTO tasks VALUES(?,?,?,?,?,?,?)", (
            "任务😀", "项目/😀", "İstanbul 😀", "", "", "[]", "2026-11-20T00:00:00Z",
        ))
    assert read(client, query=criteria(text="i\u0307stanbul"))["total"] == 1
    value = read(client, scope_project_id="项目/😀")
    assert value["total"] == 1 and column(value, "pending")["items"][0]["task"]["id"] == "任务😀"


@pytest.mark.parametrize("patch", [
    {"projects": ["alpha", "alpha"]}, {"projects": [1]}, {"projects": [" alpha"]},
    {"projects": ["x"] * 101}, {"projects": ["x" * 101]}, {"projects": ["\udfff"]},
    {"states": ["active", "active"]}, {"states": ["unknown"]}, {"states": "active"},
    {"text": True}, {"text": "x" * 2001}, {"text": "\ud800"}, {"mode": "unknown"},
    {"jql": "assignee = currentUser()"}, {"jql": "ORDER BY CREATED DESC"},
    {"jql": "ORDER BY SUMMARY ASC"}, {"extra": "not admitted"},
])
def test_malformed_query_or_any_nonempty_jql_fails_closed(board, patch):
    client, _, _ = board
    response = client.get("/api/tasks/board", params=params(
        query=criteria(**patch), scope_project_id="alpha",
    ))
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "task_board_invalid"}}


@pytest.mark.parametrize("value", [
    {}, [], None, "pending", {"active": 1}, {**pages(), "unknown": 1},
    pages(active=True), pages(active=False), pages(active=1.0), pages(active=1.1),
    pages(active="1"), pages(active=0), pages(active=-1), pages(active=MAX_PAGE + 1),
])
def test_pages_exact_schema_and_strict_safe_integer_bounds(board, value):
    client, _, _ = board
    response = client.get("/api/tasks/board", params=params(column_pages=value) if value is not None
                          else {"pages": "null"})
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "task_board_invalid"}}


@pytest.mark.parametrize("field,raw", [
    ("query", "{"), ("query", "null"), ("query", "[]"), ("query", "{" * 1500),
    ("query", '{"text":"","text":"different"}'), ("query", '{"text":NaN}'),
    ("pages", '{"active":1,"active":2}'), ("pages", '{"active":Infinity}'),
])
def test_invalid_or_duplicate_json_is_not_silently_normalized(board, field, raw):
    client, _, _ = board
    response = client.get("/api/tasks/board", params={field: raw})
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "task_board_invalid"}}


@pytest.mark.parametrize("arguments", [
    [("query", EMPTY_QUERY), ("query", EMPTY_QUERY)],
    [("pages", EMPTY_PAGES), ("pages", EMPTY_PAGES)],
    [("scope_project_id", "alpha"), ("scope_project_id", "beta")],
    [("page", 1)], [("page_size", 20)], [("sorts", "[]")],
    [("runOrder", "id:ascending")], [("group", "none")],
])
def test_unknown_and_duplicate_transport_parameters_rejected(board, arguments):
    client, _, _ = board
    response = client.get("/api/tasks/board", params=arguments)
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "task_board_parameters_invalid"}}


@pytest.mark.parametrize("scope", [" alpha", "alpha\u0085", "", "x" * 101])
def test_scope_exact_transport_bounds(board, scope):
    client, _, _ = board
    assert client.get("/api/tasks/board", params={"scope_project_id": scope}).status_code == 422


def test_parser_rejects_surrogate_scope_and_read_cannot_create_database(tmp_path):
    with pytest.raises(TaskBoardError):
        parse_task_board(EMPTY_QUERY, EMPTY_PAGES, "\ud800")
    missing = tmp_path / "absent.sqlite3"
    with pytest.raises(sqlite3.OperationalError):
        read_task_board(missing, parse_task_board(EMPTY_QUERY, EMPTY_PAGES, None))
    assert not missing.exists()


def test_orphans_and_private_payload_are_excluded(board):
    client, store, _ = board
    with sqlite3.connect(store.path) as db:
        db.execute("INSERT INTO tasks VALUES('orphan','missing','Orphan','','','[]','')")
        add_run(db, "orphan-run", "orphan", "running")
        add_run(db, "missing-task-run", "missing-task", "running")
    assert read(client)["total"] == 225
    assert read(client, query=criteria(text="orphan"))["total"] == 0


def test_read_does_not_mutate_business_rows_or_events(board):
    client, store, provider = board
    before = {table: store.list(table) for table in ("projects", "tasks", "runs", "models")}
    with sqlite3.connect(store.path) as db:
        events = db.execute("SELECT * FROM events").fetchall()
    read(client)
    assert before == {table: store.list(table) for table in before}
    with sqlite3.connect(store.path) as db:
        assert events == db.execute("SELECT * FROM events").fetchall()
    assert provider.requests == []


def test_read_never_takes_write_lock_or_observes_uncommitted_status(board):
    client, store, _ = board
    with store.transaction() as db:
        db.execute("UPDATE runs SET status='failed' WHERE id='run-active-000'")
        value = read(client, query=criteria(text="active-000"))
        assert column(value, "active")["total"] == 1
    assert column(read(client, query=criteria(text="active-000")), "attention")["total"] == 1


def test_all_column_counts_and_rows_share_one_snapshot_across_concurrent_commit(board, monkeypatch):
    client, store, _ = board
    original = sqlite3.connect
    changed = []

    class ConcurrentConnection(sqlite3.Connection):
        def execute(self, sql, parameters=()):
            result = super().execute(sql, parameters)
            if sql.endswith("FROM filtered GROUP BY state_category") and not changed:
                with original(store.path) as writer:
                    writer.execute("UPDATE runs SET status='failed' WHERE id='run-active-044'")
                    writer.execute("UPDATE tasks SET title='Changed title' WHERE id='active-044'")
                    add_run(writer, "concurrent-run", "completed-044", "failed", "2099")
                changed.append(True)
            return result

    monkeypatch.setattr(
        "workbench.task_board.sqlite3.connect",
        lambda *args, **kwargs: original(*args, **kwargs, factory=ConcurrentConnection),
    )
    value = read(client)
    assert all(col["total"] == 45 for col in value["columns"])
    active = column(value, "active")["items"][0]
    assert active["task"]["title"] == "Release active 44"
    assert active["latest_run"]["status"] == "running"
    completed = column(value, "completed")["items"][0]
    assert completed["latest_run"]["id"] == "run-completed-044"
    after = read(client)
    assert column(after, "active")["total"] == column(after, "completed")["total"] == 44
    assert column(after, "attention")["total"] == 47


@pytest.mark.parametrize("outcome", ["success", "missing-project", "read-failure"])
def test_one_readonly_connection_closes_on_every_outcome(board, monkeypatch, outcome):
    _, store, _ = board
    original = sqlite3.connect
    opened, observed = [], []

    class TrackingConnection(sqlite3.Connection):
        closed = False

        def execute(self, sql, parameters=()):
            if sql.lstrip().startswith("WITH"):
                assert super().execute("PRAGMA query_only").fetchone()[0] == 1
                assert self.in_transaction is True
                with pytest.raises(sqlite3.OperationalError):
                    super().execute("DELETE FROM tasks")
                observed.append(sql)
                if outcome == "read-failure":
                    raise sqlite3.OperationalError("injected board read failure")
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

    monkeypatch.setattr("workbench.task_board.sqlite3.connect", connect)
    request = parse_task_board(
        json.dumps(criteria(projects=["missing"])) if outcome == "missing-project" else EMPTY_QUERY,
        EMPTY_PAGES, None,
    )
    if outcome == "missing-project":
        with pytest.raises(TaskBoardError) as caught:
            read_task_board(store.path, request)
        assert caught.value.code == "task_board_project_unavailable"
    elif outcome == "read-failure":
        with pytest.raises(sqlite3.OperationalError, match="injected"):
            read_task_board(store.path, request)
    else:
        read_task_board(store.path, request)
    assert len(opened) == 1 and opened[0].closed
    if outcome != "missing-project":
        assert len(observed) == (1 if outcome == "read-failure" else 6)


def test_empty_authenticated_workspace_and_cross_site_protection(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    provider = FakeProvider()
    app = create_app(Settings(tmp_path / "data", workspace, access_token="board-fixture"), provider)
    with TestClient(app) as client:
        assert client.get("/api/tasks/board").status_code == 401
        assert client.post(
            "/api/auth", json={"token": "board-fixture"},
            headers={"X-Workbench-Request": "1"},
        ).status_code == 200
        assert client.get("/api/tasks/board", headers={"sec-fetch-site": "cross-site"}).status_code == 403
        value = read(client)
        assert value["total"] == 0 and len(value["columns"]) == 5
        assert all(col["total"] == 0 and col["items"] == [] for col in value["columns"])
    assert provider.requests == []
