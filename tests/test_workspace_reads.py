import json
from pathlib import Path
import sqlite3
import tempfile

from fastapi.testclient import TestClient
import pytest

from test_workbench import FakeProvider
from workbench.app import create_app
from workbench.config import Settings
from workbench.workspace_reads import (
    WorkspaceReadError, parse_workspace_counts, parse_workspace_search,
)
from workbench.store import Store
from seed_task_detail_fixture import MARKER, seed


@pytest.fixture
def workspace_reads(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    provider = FakeProvider()
    app = create_app(Settings(tmp_path / "data", workspace), provider)
    store = app.state.store
    with store.transaction() as db:
        for project in ("alpha", "beta", "empty"):
            db.execute("INSERT INTO projects VALUES(?,?,?,?,?,?)", (
                project, project.capitalize(), "PRIVATE_GOAL", ".", "PRIVATE_NOTES",
                "2026-11-17T00:00:00Z",
            ))
        for index, (identifier, project) in enumerate((
            ("never", "alpha"), ("recovered", "alpha"), ("active", "alpha"),
            ("attention", "beta"), ("other", "beta"), ("unknown", "beta"),
        )):
            db.execute("INSERT INTO tasks VALUES(?,?,?,?,?,?,?)", (
                identifier, project, f"Research {identifier}", "PRIVATE_TASK_GOAL",
                "PRIVATE_ACCEPTANCE", '["PRIVATE_FILE"]',
                f"2026-11-17T00:0{index}:00Z",
            ))
        statuses = {
            "recovered": ["failed"] * 40 + ["succeeded"],
            "active": ["running"], "attention": ["paused"],
            "other": ["canceled"], "unknown": ["future_status"],
        }
        for task, values in statuses.items():
            for index, status in enumerate(values):
                db.execute(
                    "INSERT INTO runs(id,task_id,request_id,status,config,context,error,created_at)"
                    " VALUES(?,?,?,?,?,?,?,?)",
                    (f"{task}-{index:03}", task, f"request-{task}-{index:03}", status,
                     '{"private_config":true}', '{"private_context":true}', "PRIVATE_ERROR",
                     f"2026-11-17T01:{index:02}:00Z"),
                )
    client = TestClient(app)
    yield client, store, provider
    assert provider.requests == []
    client.close()


def counts(client, **params):
    response = client.get("/api/workspace/counts", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def search(client, **params):
    response = client.get("/api/workspace/search", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_bootstrap_explicitly_advertises_both_read_capabilities(workspace_reads):
    client, _, _ = workspace_reads
    capability = client.get("/api/bootstrap").json()["capabilities"]
    assert capability["workspace_counts"] is capability["workspace_search"] is True


def test_counts_have_exact_shape_and_distinct_task_run_denominators(workspace_reads):
    client, store, _ = workspace_reads
    before = {table: store.list(table) for table in ("projects", "tasks", "runs")}
    value = counts(client)
    assert set(value) == {
        "schema_version", "unit", "projects", "scope_project_id", "task_counts", "run_counts",
    }
    assert value["schema_version"] == 1
    assert value["unit"] == "workspace_counts"
    assert value["projects"] == []
    assert value["scope_project_id"] is None
    assert value["task_counts"] == {
        "all": 6, "pending": 1, "active": 1, "attention": 1, "completed": 1, "other": 2,
    }
    assert value["run_counts"] == {
        "all": 45, "active": 1, "attention": 41, "completed": 1, "other": 2,
    }
    assert before == {table: store.list(table) for table in before}


def test_project_union_and_fixed_scope_use_only_effective_projects(workspace_reads):
    client, _, _ = workspace_reads
    union = counts(client, projects=json.dumps(["beta", "alpha"]))
    assert union["projects"] == ["alpha", "beta"]
    assert union["task_counts"]["all"] == 6
    fixed = counts(client, projects=json.dumps(["missing", "beta"]), scope_project_id="alpha")
    assert fixed["projects"] == ["alpha"]
    assert fixed["scope_project_id"] == "alpha"
    assert fixed["task_counts"] == {
        "all": 3, "pending": 1, "active": 1, "attention": 0, "completed": 1, "other": 0,
    }
    assert fixed["run_counts"] == {
        "all": 42, "active": 1, "attention": 40, "completed": 1, "other": 0,
    }


def test_valid_empty_project_returns_real_zero_counts(workspace_reads):
    client, _, _ = workspace_reads
    value = counts(client, projects='["empty"]')
    assert set(value["task_counts"].values()) == {0}
    assert set(value["run_counts"].values()) == {0}


def test_equal_latest_time_uses_source_order_and_unknown_states_remain_other(workspace_reads):
    client, store, _ = workspace_reads
    with store.transaction() as db:
        db.execute(
            "INSERT INTO runs(id,task_id,request_id,status,config,context,created_at) "
            "SELECT 'recovered-tie',task_id,'tie','failed','{}','{}',created_at "
            "FROM runs WHERE id='recovered-040'"
        )
    value = counts(client, scope_project_id="alpha")
    assert value["task_counts"]["completed"] == 1
    assert value["task_counts"]["attention"] == 0
    assert value["run_counts"]["attention"] == 41


@pytest.mark.parametrize("status,category", [
    ("queued", "active"), ("running", "active"), ("pause_requested", "active"),
    ("cancel_requested", "active"), ("failed", "attention"), ("paused", "attention"),
    ("interrupted", "attention"), ("succeeded", "completed"), ("canceled", "other"),
    ("future_provider_status", "other"),
])
def test_each_execution_status_keeps_current_task_and_historic_run_denominators(
    workspace_reads, status, category,
):
    client, store, _ = workspace_reads
    with store.transaction() as db:
        db.execute("UPDATE runs SET status=? WHERE id='recovered-040'", (status,))
    value = counts(client, scope_project_id="alpha")
    tasks = {"all": 3, "pending": 1, "active": 1, "attention": 0, "completed": 0, "other": 0}
    runs = {"all": 42, "active": 1, "attention": 40, "completed": 0, "other": 0}
    tasks[category] += 1
    runs[category] += 1
    assert value["task_counts"] == tasks
    assert value["run_counts"] == runs


def test_unicode_project_scope_and_canonical_ids_follow_python_code_points(workspace_reads):
    client, store, _ = workspace_reads
    identifiers = ["\U00010000", "\ue000", "\ufeffproject"]
    with store.transaction() as db:
        for identifier in identifiers:
            db.execute("INSERT INTO projects VALUES(?,?,?,?,?,?)", (
                identifier, f"Unicode {identifier}", "", ".", "", "2026-11-17T02:00:00Z",
            ))
    value = counts(client, projects=json.dumps(identifiers))
    assert value["projects"] == ["\ue000", "\ufeffproject", "\U00010000"]
    assert value["task_counts"]["all"] == value["run_counts"]["all"] == 0
    scoped = search(client, scope_project_id="\ufeffproject", q="\ufeffproject")
    assert scoped["query"] == "\ufeffproject"
    assert scoped["scope_project_id"] == "\ufeffproject"
    assert scoped["items"] == [{
        "kind": "project", "project": {"id": "\ufeffproject", "name": "Unicode \ufeffproject"},
    }]


def test_search_is_bounded_and_has_minimal_tagged_identity_records(workspace_reads):
    client, _, _ = workspace_reads
    value = search(client)
    assert set(value) == {
        "schema_version", "unit", "query", "limit", "total", "has_more",
        "scope_project_id", "order", "items",
    }
    assert value["schema_version"] == 1
    assert value["unit"] == "workspace_search"
    assert value["query"] == ""
    assert value["order"] == "projects-tasks-runs-created-v1"
    assert value["limit"] == 20
    assert value["total"] == 54
    assert value["has_more"] is True
    assert len(value["items"]) == 20
    assert [item["kind"] for item in value["items"][:3]] == ["project"] * 3
    assert [item["kind"] for item in value["items"][3:9]] == ["task"] * 6
    assert [item["kind"] for item in value["items"][9:]] == ["run"] * 11
    assert [item["project"]["id"] for item in value["items"][:3]] == ["alpha", "beta", "empty"]
    assert [item["task"]["id"] for item in value["items"][3:9]] == [
        "unknown", "other", "attention", "active", "recovered", "never",
    ]
    for item in value["items"]:
        assert set(item["project"]) == {"id", "name"}
        if item["kind"] == "project":
            assert set(item) == {"kind", "project"}
        else:
            assert set(item["task"]) == {"id", "project_id", "title"}
            assert item["task"]["project_id"] == item["project"]["id"]
        if item["kind"] == "task":
            assert set(item) == {"kind", "task", "project"}
        elif item["kind"] == "run":
            assert set(item) == {"kind", "run", "task", "project"}
            assert set(item["run"]) == {"id", "task_id", "status", "created_at"}
            assert item["run"]["task_id"] == item["task"]["id"]
    payload = json.dumps(value)
    for private in (
        "PRIVATE_GOAL", "PRIVATE_NOTES", "PRIVATE_TASK_GOAL", "PRIVATE_ACCEPTANCE",
        "PRIVATE_FILE", "private_config", "private_context", "PRIVATE_ERROR",
    ):
        assert private not in payload


@pytest.mark.parametrize("limit,length", [(20, 20), (50, 50)])
def test_search_finite_limits_have_exact_has_more(workspace_reads, limit, length):
    client, _, _ = workspace_reads
    value = search(client, limit=limit)
    assert value["limit"] == limit
    assert len(value["items"]) == length
    assert value["has_more"] is True


def test_old_history_run_id_is_searchable_beyond_former_thirty_limit(workspace_reads):
    client, _, _ = workspace_reads
    value = search(client, q="recovered-000")
    assert value["total"] == 1
    assert value["has_more"] is False
    assert value["items"][0]["kind"] == "run"
    assert value["items"][0]["run"]["id"] == "recovered-000"


def test_never_run_tasks_are_searchable_and_project_names_match_all_resource_kinds(workspace_reads):
    client, _, _ = workspace_reads
    value = search(client, q="never")
    assert value["total"] == 1
    assert value["items"][0]["task"]["id"] == "never"
    alpha = search(client, q="ALPHA", limit=50)
    assert alpha["total"] == 46
    assert {item["project"]["id"] for item in alpha["items"]} == {"alpha"}
    assert {item["kind"] for item in alpha["items"]} == {"project", "task", "run"}


def test_search_scope_is_explicit_and_cannot_leak_another_project(workspace_reads):
    client, _, _ = workspace_reads
    value = search(client, scope_project_id="beta", q="alpha")
    assert value["items"] == []
    assert value["total"] == 0
    assert value["scope_project_id"] == "beta"
    assert value["has_more"] is False
    empty = search(client, scope_project_id="empty")
    assert empty["total"] == 1
    assert empty["items"] == [{"kind": "project", "project": {"id": "empty", "name": "Empty"}}]


def test_search_literal_unicode_and_sql_like_text(workspace_reads):
    client, store, _ = workspace_reads
    with store.transaction() as db:
        db.execute("UPDATE tasks SET title=? WHERE id='never'", ("研发 Ā_100% ' OR 1=1 --",))
    for query in ("研发", "ā_100%", "' OR 1=1 --", "_", "%"):
        value = search(client, q=query)
        assert value["total"] == 1
        assert value["items"][0]["task"]["id"] == "never"
    assert search(client, q="PRIVATE_TASK_GOAL")["total"] == 0
    assert search(client, q="private_context")["total"] == 0


@pytest.mark.parametrize("space", ["\u0085", "\u001c", "\u001d", "\u001e", "\u001f"])
def test_search_python_whitespace_and_bom_literal(workspace_reads, space):
    client, _, _ = workspace_reads
    value = search(client, q=f"{space}never{space}")
    assert value["query"] == "never"
    assert value["total"] == 1
    bom = search(client, q="\ufeffnever\ufeff")
    assert bom["query"] == "\ufeffnever\ufeff"
    assert bom["total"] == 0


@pytest.mark.parametrize("path,params,code", [
    ("/api/workspace/counts", {"projects": '["missing"]'}, "workspace_counts_project_unavailable"),
    ("/api/workspace/counts", {"scope_project_id": "missing"}, "workspace_counts_project_unavailable"),
    ("/api/workspace/search", {"scope_project_id": "missing"}, "workspace_search_project_unavailable"),
])
def test_unavailable_scope_is_not_success_empty_or_unfiltered(workspace_reads, path, params, code):
    client, _, _ = workspace_reads
    response = client.get(path, params=params)
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": code}}


@pytest.mark.parametrize("projects", [
    "null", "true", "{}", '"alpha"', "[1]", '["alpha","alpha"]',
    '[" alpha"]', '["alpha\\u0085"]', '["\\ud800"]', "[NaN]", "[Infinity]",
    "[" * 1000 + "]" * 1000, json.dumps(["x"] * 101), json.dumps(["x" * 101]),
])
def test_counts_rejects_invalid_projects_even_when_scope_is_fixed(workspace_reads, projects):
    client, _, _ = workspace_reads
    response = client.get("/api/workspace/counts", params={
        "projects": projects, "scope_project_id": "alpha",
    })
    assert response.status_code == 422
    assert "task_counts" not in response.json()


@pytest.mark.parametrize("path,params,code", [
    ("/api/workspace/counts", [("unknown", "x")], "workspace_counts_parameters_invalid"),
    ("/api/workspace/counts", [("projects", "[]"), ("projects", "[]")], "workspace_counts_parameters_invalid"),
    ("/api/workspace/counts", [("scope_project_id", "alpha"), ("scope_project_id", "beta")], "workspace_counts_parameters_invalid"),
    ("/api/workspace/search", [("unknown", "x")], "workspace_search_parameters_invalid"),
    ("/api/workspace/search", [("q", "a"), ("q", "b")], "workspace_search_parameters_invalid"),
    ("/api/workspace/search", [("limit", "20"), ("limit", "50")], "workspace_search_parameters_invalid"),
    ("/api/workspace/search", [("scope_project_id", "alpha"), ("scope_project_id", "beta")], "workspace_search_parameters_invalid"),
])
def test_unknown_or_repeated_parameters_fail(workspace_reads, path, params, code):
    client, _, _ = workspace_reads
    response = client.get(path, params=params)
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": code}}


@pytest.mark.parametrize("params", [
    {"limit": 0}, {"limit": 21}, {"limit": 51}, {"limit": "x"}, {"limit": "true"},
    {"q": "x" * 2001}, {"scope_project_id": ""}, {"scope_project_id": " alpha"},
    {"scope_project_id": "alpha\u001c"}, {"scope_project_id": "x" * 101},
])
def test_search_rejects_invalid_transport_values(workspace_reads, params):
    client, _, _ = workspace_reads
    response = client.get("/api/workspace/search", params=params)
    assert response.status_code == 422
    assert "items" not in response.json()


@pytest.mark.parametrize("parser,args", [
    (parse_workspace_counts, ('["\\ud800"]', None)),
    (parse_workspace_counts, ("[]", "\udfff")),
    (parse_workspace_search, ("\ud800", 20, None)),
    (parse_workspace_search, ("", 20, "\udfff")),
    (parse_workspace_search, ("", True, None)),
    (parse_workspace_search, ("", 20.0, None)),
    (parse_workspace_search, (True, 20, None)),
])
def test_parsers_reject_invalid_unicode_and_non_strict_values(parser, args):
    with pytest.raises(WorkspaceReadError):
        parser(*args)


@pytest.mark.parametrize("path", ["/api/workspace/counts", "/api/workspace/search"])
def test_reads_preserve_authentication_and_cross_site_boundary(tmp_path, path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    provider = FakeProvider()
    app = create_app(Settings(tmp_path / "data", workspace, access_token="fixture"), provider)
    client = TestClient(app)
    try:
        assert client.get(path).status_code == 401
        assert client.get(path, headers={"sec-fetch-site": "cross-site"}).status_code == 403
        assert provider.requests == []
    finally:
        client.close()


def test_orphan_tasks_and_runs_do_not_enter_workspace_counts_or_search(workspace_reads):
    client, store, _ = workspace_reads
    with sqlite3.connect(store.path) as db:
        db.execute("INSERT INTO tasks VALUES('orphan','missing','Orphan','','','[]', '')")
        db.execute(
            "INSERT INTO runs(id,task_id,request_id,status,config,context,created_at)"
            " VALUES('orphan-run','orphan','orphan','running','{}','{}','')"
        )
        db.execute(
            "INSERT INTO runs(id,task_id,request_id,status,config,context,created_at)"
            " VALUES('missing-task-run','missing','missing','running','{}','{}','')"
        )
    assert counts(client)["task_counts"]["all"] == 6
    assert counts(client)["run_counts"]["all"] == 45
    assert search(client, q="orphan")["total"] == 0
    assert search(client, q="missing-task-run")["total"] == 0


def test_count_and_search_do_not_hold_write_lock_or_expose_uncommitted_data(workspace_reads):
    client, store, _ = workspace_reads
    with store.transaction() as db:
        db.execute("UPDATE runs SET status='failed' WHERE id='recovered-040'")
        db.execute("UPDATE tasks SET title='Uncommitted' WHERE id='never'")
        assert counts(client)["task_counts"]["completed"] == 1
        assert search(client, q="Uncommitted")["total"] == 0
    assert counts(client)["task_counts"]["completed"] == 0
    assert search(client, q="Uncommitted")["total"] == 1


def test_count_categories_share_one_snapshot_during_committed_change(workspace_reads, monkeypatch):
    client, store, _ = workspace_reads
    original = sqlite3.connect
    changed = []

    class ConcurrentConnection(sqlite3.Connection):
        def execute(self, sql, parameters=()):
            result = super().execute(sql, parameters)
            if "FROM task_states GROUP BY" in sql and not changed:
                with original(store.path) as writer:
                    writer.execute("UPDATE runs SET status='running' WHERE id='recovered-040'")
                changed.append(True)
            return result

    monkeypatch.setattr(
        "workbench.workspace_reads.sqlite3.connect",
        lambda *args, **kwargs: original(*args, **kwargs, factory=ConcurrentConnection),
    )
    value = counts(client)
    assert value["task_counts"]["completed"] == 1
    assert value["run_counts"]["completed"] == 1
    after = counts(client)
    assert after["task_counts"]["completed"] == after["run_counts"]["completed"] == 0
    assert after["task_counts"]["active"] == 2


def test_search_total_and_items_share_one_snapshot_during_commit(workspace_reads, monkeypatch):
    client, store, _ = workspace_reads
    original = sqlite3.connect
    changed = []

    class ConcurrentConnection(sqlite3.Connection):
        def execute(self, sql, parameters=()):
            result = super().execute(sql, parameters)
            if "SELECT COUNT(*) FROM matched" in sql and not changed:
                with original(store.path) as writer:
                    writer.execute("UPDATE tasks SET title='Changed never' WHERE id='never'")
                    writer.execute("INSERT INTO tasks VALUES('new','alpha','Research new','','','[]',?)",
                                   ("2026-11-18T00:00:00Z",))
                changed.append(True)
            return result

    monkeypatch.setattr(
        "workbench.workspace_reads.sqlite3.connect",
        lambda *args, **kwargs: original(*args, **kwargs, factory=ConcurrentConnection),
    )
    value = search(client, q="Research", limit=50)
    assert value["total"] == 51
    assert any(item.get("task", {}).get("title") == "Research never" for item in value["items"])
    assert not any(item.get("task", {}).get("id") == "new" for item in value["items"])
    after = search(client, q="Research", limit=50)
    assert after["total"] == 51
    assert any(item.get("task", {}).get("id") == "new" for item in after["items"])


def test_read_connections_are_readonly_and_closed_on_success_and_failure(workspace_reads, monkeypatch):
    client, _, _ = workspace_reads
    original = sqlite3.connect
    opened, closed = [], []

    class TrackingConnection(sqlite3.Connection):
        def close(self):
            super().close()
            with pytest.raises(sqlite3.ProgrammingError, match="closed"):
                super().execute("SELECT 1")
            closed.append(True)

    def connect(*args, **kwargs):
        assert args[0].endswith("?mode=ro")
        assert kwargs["uri"] is True
        db = original(*args, **kwargs, factory=TrackingConnection)
        with pytest.raises(sqlite3.OperationalError, match="readonly"):
            db.execute("INSERT INTO projects VALUES('bad','Bad','','.','','')")
        db.rollback()
        opened.append(True)
        return db

    monkeypatch.setattr("workbench.workspace_reads.sqlite3.connect", connect)
    counts(client)
    search(client)
    assert client.get("/api/workspace/counts", params={"scope_project_id": "missing"}).status_code == 422
    assert client.get("/api/workspace/search", params={"scope_project_id": "missing"}).status_code == 422
    assert len(opened) == len(closed) == 4


def test_disposable_seed_accepts_tempfile_underscore_suffix_without_weakening_marker_checks():
    with tempfile.TemporaryDirectory(prefix="mybot-astryx-workbench.fixture_", dir="/tmp") as directory:
        root = Path(directory)
        (root / "workspace").mkdir()
        (root / "workspace/README.md").write_text(MARKER, encoding="utf-8")
        store = Store(root / "data")
        value = seed(directory)
        assert value["runs"] == 45
        assert len(store.list("tasks")) == 2
        assert store.list("models") == []
