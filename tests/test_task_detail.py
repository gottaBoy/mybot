import json
from pathlib import Path
import sqlite3
import tempfile
from urllib.parse import quote

from fastapi.testclient import TestClient
import pytest

from test_workbench import FakeProvider
from workbench.app import create_app
from workbench.config import Settings
from workbench.task_detail import TaskDetailError, parse_task_detail
from workbench.task_query import MAX_PAGE
from workbench.store import Store
from seed_task_detail_fixture import EMPTY_TASK, MARKER, TASK, seed


@pytest.fixture
def detail_fixture(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    provider = FakeProvider()
    app = create_app(Settings(tmp_path / "data", workspace), provider)
    store = app.state.store
    with store.transaction() as db:
        for project in ("alpha", "beta"):
            db.execute("INSERT INTO projects VALUES(?,?,?,?,?,?)", (
                project, project.capitalize(), "Project goal", ".", "PRIVATE_NOTES",
                "2026-11-17T00:00:00Z",
            ))
        for identifier, project in (("research", "alpha"), ("empty", "beta")):
            db.execute("INSERT INTO tasks VALUES(?,?,?,?,?,?,?)", (
                identifier, project, identifier.capitalize(), "Task goal", "Acceptance",
                '["README.md"]', "2026-11-17T00:00:00Z",
            ))
        for index in range(45):
            db.execute(
                "INSERT INTO runs(id,task_id,request_id,status,config,context,error,created_at)"
                " VALUES(?,?,?,?,?,?,?,?)",
                (f"history-{index:03}", "research", f"history-request-{index:03}",
                 ("failed", "canceled", "succeeded")[index % 3],
                 '{"private_config":true}', '{"private_context":true}', "PRIVATE_ERROR",
                 f"2026-11-17T01:{index:02}:00Z"),
            )
    # No execution lifespan: active-status test rows must never run a Provider.
    client = TestClient(app)
    yield client, store, provider
    assert provider.requests == []
    client.close()


def read(client, identifier="research", **params):
    response = client.get(f"/api/tasks/{quote(identifier, safe='')}/detail", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def history_ids(response):
    return [item["id"] for item in response["history"]["items"]]


def test_bootstrap_declares_detail_without_invoking_provider(detail_fixture):
    client, _, _ = detail_fixture
    assert client.get("/api/bootstrap").json()["capabilities"]["task_detail"] is True


def test_detail_has_minimal_exact_shape_and_does_not_mutate(detail_fixture):
    client, store, _ = detail_fixture
    before = {table: store.list(table) for table in ("projects", "tasks", "runs")}
    with sqlite3.connect(store.path) as db:
        event_count = db.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    value = read(client)
    assert set(value) == {"schema_version", "unit", "item", "history"}
    assert value["schema_version"] == 1
    assert value["unit"] == "task_detail"
    item = value["item"]
    assert set(item) == {"task", "project", "latest_run", "state_category", "attempts"}
    assert item["task"] == {
        "id": "research", "project_id": "alpha", "title": "Research", "goal": "Task goal",
        "acceptance": "Acceptance", "files": ["README.md"], "created_at": "2026-11-17T00:00:00Z",
    }
    assert item["project"] == {"id": "alpha", "name": "Alpha"}
    assert item["latest_run"] == value["history"]["items"][0]
    assert item["latest_run"]["id"] == "history-044"
    assert item["state_category"] == "completed"
    assert item["attempts"] == 45
    history = value["history"]
    assert set(history) == {
        "unit", "items", "total", "requested_page", "page", "page_size",
        "total_pages", "has_more", "order",
    }
    assert history["unit"] == "runs"
    assert history["total"] == 45
    assert history["page"] == history["requested_page"] == 1
    assert history["page_size"] == 20
    assert history["total_pages"] == 3
    assert history["has_more"] is True
    assert history["order"] == "created-desc-source-v1"
    assert len(history["items"]) == 20
    assert all(set(run) == {"id", "task_id", "status", "created_at"} for run in history["items"])
    rendered = json.dumps(value)
    assert all(private not in rendered for private in (
        "PRIVATE_NOTES", "PRIVATE_ERROR", "private_context", "private_config",
    ))
    assert before == {table: store.list(table) for table in before}
    with sqlite3.connect(store.path) as db:
        assert db.execute("SELECT COUNT(*) FROM events").fetchone()[0] == event_count


def test_real_history_pages_are_bounded_complete_and_clamped(detail_fixture):
    client, _, _ = detail_fixture
    pages = [read(client, page=page) for page in (1, 2, 3)]
    assert [len(value["history"]["items"]) for value in pages] == [20, 20, 5]
    assert [value["history"]["has_more"] for value in pages] == [True, True, False]
    assert [identifier for value in pages for identifier in history_ids(value)] == [
        f"history-{index:03}" for index in range(44, -1, -1)
    ]
    clamped = read(client, page=MAX_PAGE)
    assert clamped["history"]["requested_page"] == MAX_PAGE
    assert clamped["history"]["page"] == 3
    assert history_ids(clamped) == history_ids(pages[-1])
    assert clamped["item"]["latest_run"]["id"] == "history-044"


@pytest.mark.parametrize("page_size", [20, 50, 100])
def test_only_finite_history_capacities_are_admitted(detail_fixture, page_size):
    client, _, _ = detail_fixture
    value = read(client, page_size=page_size)
    assert len(value["history"]["items"]) == min(45, page_size)
    assert value["history"]["page_size"] == page_size


def test_never_run_task_is_real_empty_with_one_page(detail_fixture):
    client, _, _ = detail_fixture
    value = read(client, "empty", page=MAX_PAGE)
    assert value["item"]["latest_run"] is None
    assert value["item"]["attempts"] == 0
    assert value["item"]["state_category"] == "pending"
    assert value["history"]["items"] == []
    assert value["history"]["total"] == 0
    assert value["history"]["page"] == value["history"]["total_pages"] == 1
    assert value["history"]["requested_page"] == MAX_PAGE
    assert value["history"]["has_more"] is False


@pytest.mark.parametrize("status,category", [
    ("queued", "active"), ("running", "active"), ("pause_requested", "active"),
    ("cancel_requested", "active"), ("paused", "attention"), ("failed", "attention"),
    ("interrupted", "attention"), ("succeeded", "completed"), ("canceled", "other"),
    ("future_status", "other"),
])
def test_latest_classification_matches_query_not_historical_failures(detail_fixture, status, category):
    client, store, _ = detail_fixture
    with store.transaction() as db:
        db.execute("UPDATE runs SET status=? WHERE id='history-044'", (status,))
    value = read(client)
    query = client.get("/api/tasks/query", params={"query": json.dumps({
        "text": "research", "projects": [], "states": [], "jql": "", "mode": "basic",
    })})
    assert query.status_code == 200
    assert value["item"] == query.json()["items"][0]
    assert value["item"]["state_category"] == category


def test_equal_timestamp_uses_source_row_order_for_latest_and_history(detail_fixture):
    client, store, _ = detail_fixture
    with store.transaction() as db:
        db.execute(
            "INSERT INTO runs(id,task_id,request_id,status,config,context,created_at)"
            " SELECT 'history-tie','research','history-tie','failed','{}','{}',created_at"
            " FROM runs WHERE id='history-044'"
        )
    value = read(client)
    assert history_ids(value)[:2] == ["history-044", "history-tie"]
    assert value["item"]["latest_run"]["id"] == "history-044"
    assert value["item"]["state_category"] == "completed"
    assert value["item"]["attempts"] == 46


@pytest.mark.parametrize("identifier,scope", [
    ("missing", None), ("research", "beta"), ("research", "missing"),
    ("research' OR 1=1 --", None),
])
def test_missing_and_cross_scope_tasks_share_unavailable_without_leak(detail_fixture, identifier, scope):
    client, _, _ = detail_fixture
    params = {} if scope is None else {"scope_project_id": scope}
    response = client.get(f"/api/tasks/{quote(identifier, safe='')}/detail", params=params)
    assert response.status_code == 404
    assert response.json() == {"detail": {"code": "task_detail_unavailable"}}
    assert "Research" not in response.text


def test_matching_fixed_scope_keeps_the_exact_requested_task(detail_fixture):
    client, _, _ = detail_fixture
    assert read(client, scope_project_id="alpha")["item"]["task"]["id"] == "research"


def test_task_with_missing_project_is_unavailable(detail_fixture):
    client, store, _ = detail_fixture
    with sqlite3.connect(store.path) as db:
        db.execute("INSERT INTO tasks VALUES('orphan','missing','Secret','','','[]',?)",
                   ("2026-11-17T00:00:00Z",))
    response = client.get("/api/tasks/orphan/detail")
    assert response.status_code == 404
    assert response.json() == {"detail": {"code": "task_detail_unavailable"}}


@pytest.mark.parametrize("params", [
    {"page": 0}, {"page": -1}, {"page": MAX_PAGE + 1}, {"page": "x"}, {"page": "true"},
    {"page_size": 0}, {"page_size": 21}, {"page_size": 101}, {"page_size": "x"},
    {"scope_project_id": ""}, {"scope_project_id": " alpha"},
    {"scope_project_id": "alpha\u0085"}, {"scope_project_id": "x" * 101},
])
def test_invalid_transport_values_are_explicit_errors(detail_fixture, params):
    client, _, _ = detail_fixture
    response = client.get("/api/tasks/research/detail", params=params)
    assert response.status_code == 422
    assert "item" not in response.json()


@pytest.mark.parametrize("params", [
    [("unknown", "1")], [("page", "1"), ("page", "2")],
    [("page_size", "20"), ("page_size", "50")],
    [("scope_project_id", "alpha"), ("scope_project_id", "beta")],
])
def test_unknown_and_repeated_parameters_never_fall_back(detail_fixture, params):
    client, _, _ = detail_fixture
    response = client.get("/api/tasks/research/detail", params=params)
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "task_detail_parameters_invalid"}}


@pytest.mark.parametrize("identifier", [" research", "research\u001c", "x" * 101])
def test_padded_and_overlong_route_ids_are_invalid(detail_fixture, identifier):
    client, _, _ = detail_fixture
    response = client.get(f"/api/tasks/{quote(identifier, safe='')}/detail")
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "task_detail_invalid"}}


@pytest.mark.parametrize("patch", [
    {"identifier": "\ud800"}, {"scope_project_id": "\udfff"}, {"identifier": ""},
    {"identifier": True}, {"page": True}, {"page_size": True}, {"page_size": 20.0},
    {"page": MAX_PAGE + 1},
])
def test_parser_rejects_invalid_unicode_and_non_strict_inputs(patch):
    value = {"identifier": "research", "scope_project_id": None, "page": 1, "page_size": 20}
    value.update(patch)
    with pytest.raises(TaskDetailError, match="task_detail_invalid"):
        parse_task_detail(**value)


def test_unicode_ids_and_bom_are_literals_not_ecmascript_trim(detail_fixture):
    client, store, _ = detail_fixture
    identifier = "\ufefftask\u0001\u4e2d\U00010000"
    with store.transaction() as db:
        db.execute("INSERT INTO tasks VALUES(?,?,?,?,?,?,?)", (
            identifier, "alpha", "Unicode", "", "", "[]", "2026-11-17T00:00:00Z",
        ))
    assert read(client, identifier)["item"]["task"]["id"] == identifier


def test_detail_auth_boundary_requires_a_real_session(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    provider = FakeProvider()
    app = create_app(Settings(tmp_path / "data", workspace, access_token="x" * 32), provider)
    client = TestClient(app)
    try:
        assert client.get("/api/tasks/research/detail").status_code == 401
        assert client.get("/api/tasks/research/detail", headers={
            "sec-fetch-site": "cross-site",
        }).status_code == 403
        assert provider.requests == []
    finally:
        client.close()


def test_read_does_not_take_a_write_lock_or_expose_uncommitted_changes(detail_fixture):
    client, store, _ = detail_fixture
    with store.transaction() as db:
        db.execute("UPDATE runs SET status='failed' WHERE id='history-044'")
        assert read(client)["item"]["state_category"] == "completed"
    assert read(client)["item"]["state_category"] == "attention"


def test_task_total_latest_and_history_share_one_snapshot(detail_fixture, monkeypatch):
    client, store, _ = detail_fixture
    original_connect = sqlite3.connect
    inserted = []

    class ConcurrentConnection(sqlite3.Connection):
        def execute(self, sql, parameters=()):
            cursor = super().execute(sql, parameters)
            if sql.startswith("SELECT COUNT(*) FROM runs") and not inserted:
                with original_connect(store.path) as writer:
                    writer.execute(
                        "INSERT INTO runs(id,task_id,request_id,status,config,context,created_at)"
                        " VALUES('concurrent','research','concurrent','failed','{}','{}',?)",
                        ("2026-11-18T00:00:00Z",),
                    )
                    writer.execute("UPDATE tasks SET title='Changed' WHERE id='research'")
                inserted.append(True)
            return cursor

    def connect(*args, **kwargs):
        return original_connect(*args, **kwargs, factory=ConcurrentConnection)

    monkeypatch.setattr("workbench.task_detail.sqlite3.connect", connect)
    value = read(client)
    assert value["item"]["task"]["title"] == "Research"
    assert value["item"]["attempts"] == value["history"]["total"] == 45
    assert value["item"]["latest_run"]["id"] == history_ids(value)[0] == "history-044"
    after = read(client)
    assert after["item"]["task"]["title"] == "Changed"
    assert after["item"]["attempts"] == after["history"]["total"] == 46
    assert after["item"]["latest_run"]["id"] == history_ids(after)[0] == "concurrent"


def test_read_connections_are_readonly_and_close_on_success_and_missing(detail_fixture, monkeypatch):
    client, _, _ = detail_fixture
    original_connect = sqlite3.connect
    opened = []
    closed = []

    class TrackingConnection(sqlite3.Connection):
        def close(self):
            super().close()
            with pytest.raises(sqlite3.ProgrammingError, match="closed"):
                super().execute("SELECT 1")
            closed.append(True)

    def connect(*args, **kwargs):
        assert args[0].endswith("?mode=ro")
        assert kwargs["uri"] is True
        db = original_connect(*args, **kwargs, factory=TrackingConnection)
        with pytest.raises(sqlite3.OperationalError, match="readonly"):
            db.execute("INSERT INTO projects VALUES('bad','bad','','.','', '')")
        db.rollback()
        opened.append(True)
        return db

    monkeypatch.setattr("workbench.task_detail.sqlite3.connect", connect)
    read(client)
    assert client.get("/api/tasks/missing/detail").status_code == 404
    assert len(opened) == len(closed) == 2


def test_seed_only_accepts_empty_disposable_fixture_and_all_runs_are_terminal():
    with tempfile.TemporaryDirectory(prefix="mybot-astryx-workbench.", dir="/tmp") as directory:
        root = Path(directory)
        (root / "workspace").mkdir()
        (root / "workspace/README.md").write_text(MARKER)
        store = Store(root / "data")
        result = seed(str(root))
        assert result["all_runs_terminal"] is True
        assert result["runs"] == 45
        tasks = store.list("tasks")
        runs = store.list("runs")
        assert {task["id"] for task in tasks} == {TASK, EMPTY_TASK}
        assert len(runs) == 45
        assert {run["status"] for run in runs} == {"failed", "canceled", "succeeded"}
        assert store.list("models") == []
        with pytest.raises(ValueError, match="no business records"):
            seed(str(root))
        assert store.list("tasks") == tasks
        assert store.list("runs") == runs


@pytest.mark.parametrize("target", [
    ".", "/tmp", "/tmp/other-fixture", "/home/my/workspace/ainfra/mywork/mybot/.runtime",
])
def test_seed_rejects_non_fixture_paths_before_opening_them(target):
    with pytest.raises(ValueError, match="explicit, nonsymlink"):
        seed(target)


def test_seed_rejects_marker_mismatch_and_symlink_database(tmp_path):
    with tempfile.TemporaryDirectory(prefix="mybot-astryx-workbench.", dir="/tmp") as directory:
        root = Path(directory)
        (root / "workspace").mkdir()
        marker = root / "workspace/README.md"
        marker.write_text("not a disposable browser fixture")
        store = Store(root / "data")
        with pytest.raises(ValueError, match="marker is missing"):
            seed(str(root))
        assert store.list("tasks") == []
        marker.write_text(MARKER)
        database = root / "data/workbench.sqlite3"
        target = tmp_path / "outside.sqlite3"
        target.write_bytes(database.read_bytes())
        database.unlink()
        database.symlink_to(target)
        with pytest.raises(ValueError, match="without symlinks"):
            seed(str(root))
        with sqlite3.connect(target) as db:
            assert db.execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 0
