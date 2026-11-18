import json
from pathlib import Path
import sqlite3
import tempfile

from fastapi.testclient import TestClient
import pytest

from test_workbench import FakeProvider
from workbench.app import create_app
from workbench.config import Settings
from workbench.project_references import (
    ProjectReferenceError, parse_project_references, read_project_references,
)
from workbench.store import Store


@pytest.fixture
def reference_directory(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    provider = FakeProvider()
    app = create_app(Settings(tmp_path / "data", workspace), provider)
    store = app.state.store
    with store.transaction() as db:
        for index in range(45):
            db.execute("INSERT INTO projects VALUES(?,?,?,?,?,?)", (
                f"p{index:02}", f"Reference {index:02}", "PRIVATE_GOAL",
                "PRIVATE_DIRECTORY", "PRIVATE_NOTES", f"2026-11-18T00:{index:02}:00Z",
            ))
        for identifier, project in (("history", "p00"), ("never", "p00"), ("other", "p44")):
            db.execute("INSERT INTO tasks VALUES(?,?,?,?,?,?,?)", (
                identifier, project, identifier, "PRIVATE_TASK_GOAL",
                "PRIVATE_ACCEPTANCE", '["PRIVATE_FILE"]', "2026-11-18T00:00:00Z",
            ))
        for index in range(45):
            db.execute(
                "INSERT INTO runs(id,task_id,request_id,status,config,context,error,created_at)"
                " VALUES(?,?,?,?,?,?,?,?)",
                (f"run-{index:03}", "history", f"request-{index:03}",
                 "succeeded" if index == 44 else "failed",
                 '{"private_config":true}', '{"private_context":true}', "PRIVATE_ERROR",
                 f"2026-11-18T01:{index:02}:00Z"),
            )
    client = TestClient(app)
    yield client, store, provider
    assert provider.requests == []
    client.close()


def directory(client, **params):
    response = client.get("/api/project-references", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_bootstrap_explicitly_advertises_reference_capability(reference_directory):
    client, _, _ = reference_directory
    assert client.get("/api/bootstrap").json()["capabilities"]["project_references"] is True


def test_exact_bounded_projection_totals_and_distinct_denominators(reference_directory):
    client, store, _ = reference_directory
    before = {table: store.list(table) for table in ("projects", "tasks", "runs")}
    with sqlite3.connect(store.path) as db:
        events_before = db.execute("SELECT * FROM events").fetchall()
    value = directory(client)
    assert set(value) == {
        "schema_version", "unit", "query", "requested_page", "page", "page_size",
        "total", "total_pages", "has_more", "order", "selected_ids", "selected",
        "missing_ids", "totals", "items",
    }
    assert value == {
        "schema_version": 1, "unit": "project_references", "query": "",
        "requested_page": 1, "page": 1, "page_size": 20, "total": 45,
        "total_pages": 3, "has_more": True, "order": "projects-created-v1",
        "selected_ids": [], "selected": [], "missing_ids": [],
        "totals": {"projects": 45, "tasks": 3, "runs": 45},
        "items": [{
            "project": {"id": f"p{index:02}", "name": f"Reference {index:02}"},
            "task_count": int(index == 44), "run_count": 0,
        } for index in range(44, 24, -1)],
    }
    assert before == {table: store.list(table) for table in before}
    with sqlite3.connect(store.path) as db:
        assert db.execute("SELECT * FROM events").fetchall() == events_before
    serialized = json.dumps(value)
    assert "PRIVATE" not in serialized and "private_" not in serialized


@pytest.mark.parametrize("page_size", [20, 50, 100])
def test_finite_capacity_and_clamped_page(reference_directory, page_size):
    client, _, _ = reference_directory
    value = directory(client, page=1_000_000, page_size=page_size)
    total_pages = (45 + page_size - 1) // page_size
    assert value["requested_page"] == 1_000_000
    assert value["page"] == value["total_pages"] == total_pages
    assert value["has_more"] is False
    assert len(value["items"]) == 45 - page_size * (total_pages - 1)
    assert value["items"][-1] == {
        "project": {"id": "p00", "name": "Reference 00"}, "task_count": 2, "run_count": 45,
    }


def test_three_pages_preserve_global_creation_order(reference_directory):
    client, _, _ = reference_directory
    pages = [directory(client, page=page) for page in (1, 2, 3)]
    assert [row["project"]["id"] for page in pages for row in page["items"]] == [
        f"p{index:02}" for index in range(44, -1, -1)
    ]
    assert [page["has_more"] for page in pages] == [True, True, False]


def test_selected_hydration_is_independent_of_query_and_page(reference_directory):
    client, _, _ = reference_directory
    value = directory(client, q="Reference 44", selected='["p44","missing","p00"]')
    assert value["total"] == 1
    assert value["selected_ids"] == ["missing", "p00", "p44"]
    assert value["missing_ids"] == ["missing"]
    assert value["selected"] == [
        {"project": {"id": "p00", "name": "Reference 00"}, "task_count": 2, "run_count": 45},
        {"project": {"id": "p44", "name": "Reference 44"}, "task_count": 1, "run_count": 0},
    ]
    assert value["items"] == [value["selected"][1]]
    assert value["totals"] == {"projects": 45, "tasks": 3, "runs": 45}
    second = directory(client, page=2, selected='["p00","p44"]')
    assert second["selected"] == value["selected"]
    assert not {item["project"]["id"] for item in second["selected"]} & {
        item["project"]["id"] for item in second["items"]
    }


def test_selected_partition_uses_code_point_order_and_is_not_missing_when_off_page(reference_directory):
    client, store, _ = reference_directory
    with store.transaction() as db:
        for identifier in ("\ue000", "\U00010000", "A", "a"):
            db.execute("INSERT INTO projects VALUES(?,?,?,?,?,?)", (
                identifier, identifier, "", ".", "", "2020-01-01",
            ))
    ids = ["\U00010000", "\ue000", "missing-z", "a", "A", "missing-a"]
    value = directory(client, selected=json.dumps(ids), q="unmatched")
    assert value["selected_ids"] == sorted(ids)
    assert [item["project"]["id"] for item in value["selected"]] == ["A", "a", "\ue000", "\U00010000"]
    assert value["missing_ids"] == ["missing-a", "missing-z"]
    assert value["items"] == []
    assert value["total"] == 0


def test_empty_match_and_workspace_are_real_zero_not_missing_failure(reference_directory, tmp_path):
    client, _, _ = reference_directory
    value = directory(client, q="not-present", page=99, selected='["p00","missing"]')
    assert value["items"] == []
    assert value["page"] == value["total_pages"] == 1
    assert value["total"] == 0
    assert value["has_more"] is False
    assert value["missing_ids"] == ["missing"]
    workspace = tmp_path / "empty-workspace"
    workspace.mkdir()
    app = create_app(Settings(tmp_path / "empty-data", workspace), FakeProvider())
    with TestClient(app) as empty_client:
        empty = directory(empty_client, selected='["missing"]')
    assert empty["totals"] == {"projects": 0, "tasks": 0, "runs": 0}
    assert empty["missing_ids"] == ["missing"]


def test_equal_created_timestamp_uses_source_order_not_id_order(reference_directory):
    client, store, _ = reference_directory
    with store.transaction() as db:
        for identifier in ("z-tie", "a-tie"):
            db.execute("INSERT INTO projects VALUES(?,?,?,?,?,?)", (
                identifier, "Tie project", "", ".", "", "2099-01-01",
            ))
    value = directory(client, q="tie")
    assert [item["project"]["id"] for item in value["items"]] == ["z-tie", "a-tie"]


@pytest.mark.parametrize("query", ["研发", "ā_100%", "' OR 1=1 --", "_", "%", "p12"])
def test_literal_unicode_and_sql_like_query(reference_directory, query):
    client, store, _ = reference_directory
    with store.transaction() as db:
        db.execute("UPDATE projects SET name=? WHERE id='p12'", ("研发 Ā_100% ' OR 1=1 --",))
    value = directory(client, q=query)
    assert value["total"] == 1
    assert value["items"][0]["project"]["id"] == "p12"
    assert directory(client, q="PRIVATE_GOAL")["total"] == 0
    assert directory(client, q="PRIVATE_NOTES")["total"] == 0


@pytest.mark.parametrize("space", [" ", "\t", "\n", "\u0085", "\u001c", "\u001d", "\u001e", "\u001f"])
def test_query_trims_python_whitespace_but_not_bom(reference_directory, space):
    client, _, _ = reference_directory
    value = directory(client, q=f"{space}p12{space}")
    assert value["query"] == "p12" and value["total"] == 1
    bom = directory(client, q="\ufeffp12\ufeff")
    assert bom["query"] == "\ufeffp12\ufeff" and bom["total"] == 0


@pytest.mark.parametrize("selected", [
    "null", "true", "{}", '"p00"', "[1]", '["p00","p00"]', '[" p00"]',
    '["p00\\u0085"]', '["\\ud800"]', "[NaN]", "[Infinity]",
    '{"x":1,"x":2}', "[" * 1000 + "]" * 1000,
    json.dumps([f"id-{i}" for i in range(101)]), json.dumps(["x" * 101]), '[""]',
])
def test_invalid_selected_input_is_never_ignored(reference_directory, selected):
    client, _, _ = reference_directory
    response = client.get("/api/project-references", params={"selected": selected})
    assert response.status_code == 422
    assert "items" not in response.json()


@pytest.mark.parametrize("params", [
    [("unknown", "x")], [("q", "a"), ("q", "b")],
    [("page", "1"), ("page", "2")], [("page_size", "20"), ("page_size", "50")],
    [("selected", '["p00"]'), ("selected", '["p44"]')],
])
def test_unknown_and_repeated_parameters_are_rejected(reference_directory, params):
    client, _, _ = reference_directory
    response = client.get("/api/project-references", params=params)
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "project_references_parameters_invalid"}}


@pytest.mark.parametrize("params", [
    {"q": "x" * 2001}, {"page": 0}, {"page": -1}, {"page": 1_000_001},
    {"page": "true"}, {"page": "x"}, {"page_size": 0}, {"page_size": 21},
    {"page_size": 101}, {"page_size": "true"}, {"selected": " " * 24001},
])
def test_invalid_transport_values_fail_explicitly(reference_directory, params):
    client, _, _ = reference_directory
    response = client.get("/api/project-references", params=params)
    assert response.status_code == 422
    assert "items" not in response.json()


@pytest.mark.parametrize("args", [
    ("\ud800", 1, 20, "[]"), ("", 1, 20, '["\\udfff"]'),
    (True, 1, 20, "[]"), ("", True, 20, "[]"), ("", 1.0, 20, "[]"),
    ("", 1, True, "[]"), ("", 1, 20.0, "[]"), ("", 1, 20, None),
])
def test_direct_parser_preserves_strict_types_and_unicode(args):
    with pytest.raises(ProjectReferenceError):
        parse_project_references(*args)


def test_orphan_tasks_and_runs_do_not_enter_counts(reference_directory):
    client, store, _ = reference_directory
    with sqlite3.connect(store.path) as db:
        db.execute("INSERT INTO tasks VALUES('orphan','missing','Orphan','','','[]','')")
        for identifier, task in (("orphan-run", "orphan"), ("missing-task-run", "missing")):
            db.execute(
                "INSERT INTO runs(id,task_id,request_id,status,config,context,created_at)"
                " VALUES(?,?,?,?,?,?,?)",
                (identifier, task, identifier, "running", "{}", "{}", ""),
            )
    value = directory(client, selected='["missing","p00"]')
    assert value["totals"] == {"projects": 45, "tasks": 3, "runs": 45}
    assert value["selected"][0]["run_count"] == 45
    assert value["missing_ids"] == ["missing"]


def test_reads_do_not_hold_write_lock_or_expose_uncommitted_data(reference_directory):
    client, store, _ = reference_directory
    with store.transaction() as db:
        db.execute("UPDATE projects SET name='Uncommitted' WHERE id='p00'")
        db.execute("INSERT INTO tasks VALUES('new-task','p00','New','','','[]','')")
        value = directory(client, q="Uncommitted", selected='["p00"]')
        assert value["total"] == 0
        assert value["selected"][0]["task_count"] == 2
    after = directory(client, q="Uncommitted", selected='["p00"]')
    assert after["total"] == 1
    assert after["selected"][0]["task_count"] == 3


def test_totals_pages_and_selected_share_one_snapshot(reference_directory, monkeypatch):
    client, store, _ = reference_directory
    original = sqlite3.connect
    changes = []

    class ConcurrentConnection(sqlite3.Connection):
        def execute(self, sql, parameters=()):
            result = super().execute(sql, parameters)
            if "COALESCE(SUM(task_count),0) AS tasks" in sql and not changes:
                with original(store.path) as writer:
                    writer.execute("UPDATE projects SET name='Changed' WHERE id='p00'")
                    writer.execute("INSERT INTO projects VALUES('p-new','New','','.','','2099')")
                    writer.execute("INSERT INTO tasks VALUES('new-task','p00','New','','','[]','')")
                    writer.execute(
                        "INSERT INTO runs(id,task_id,request_id,status,config,context,created_at)"
                        " VALUES('new-run','new-task','new-request','succeeded','{}','{}','2099')"
                    )
                changes.append(True)
            return result

    monkeypatch.setattr(
        "workbench.project_references.sqlite3.connect",
        lambda *args, **kwargs: original(*args, **kwargs, factory=ConcurrentConnection),
    )
    value = directory(client, q="Reference", page_size=100, selected='["p00","p-new"]')
    assert value["totals"] == {"projects": 45, "tasks": 3, "runs": 45}
    assert value["total"] == len(value["items"]) == 45
    assert value["selected"] == [{
        "project": {"id": "p00", "name": "Reference 00"}, "task_count": 2, "run_count": 45,
    }]
    assert value["missing_ids"] == ["p-new"]
    after = directory(client, selected='["p00","p-new"]')
    assert after["totals"] == {"projects": 46, "tasks": 4, "runs": 46}
    hydrated = {item["project"]["id"]: item for item in after["selected"]}
    assert hydrated["p00"]["project"]["name"] == "Changed"
    assert hydrated["p00"]["task_count"] == 3
    assert hydrated["p00"]["run_count"] == 46
    assert after["missing_ids"] == []


def test_connections_are_readonly_query_only_and_closed_on_success_and_failure(reference_directory, monkeypatch):
    _, store, _ = reference_directory
    original = sqlite3.connect
    connections, closed, traces = [], [], []
    fail = []

    class TrackingConnection(sqlite3.Connection):
        def execute(self, sql, parameters=()):
            if "SELECT COUNT(*) FROM project_references" in sql and fail:
                raise sqlite3.OperationalError("fixture read failure")
            return super().execute(sql, parameters)

        def close(self):
            super().close()
            with pytest.raises(sqlite3.ProgrammingError, match="closed"):
                super().execute("SELECT 1")
            closed.append(True)

    def connect(*args, **kwargs):
        assert args[0].endswith("?mode=ro") and kwargs["uri"] is True
        db = original(*args, **kwargs, factory=TrackingConnection)
        with pytest.raises(sqlite3.OperationalError, match="readonly"):
            db.execute("DELETE FROM projects")
        db.rollback()
        db.set_trace_callback(traces.append)
        connections.append(db)
        return db

    monkeypatch.setattr("workbench.project_references.sqlite3.connect", connect)
    request = parse_project_references("", 1, 20, '["p00"]')
    assert read_project_references(store.path, request)["selected"][0]["run_count"] == 45
    fail.append(True)
    with pytest.raises(sqlite3.OperationalError, match="fixture read failure"):
        read_project_references(store.path, request)
    assert len(connections) == len(closed) == 2
    assert sum(sql == "PRAGMA query_only=ON" for sql in traces) == 2
    assert sum(sql == "BEGIN" for sql in traces) == 2


def test_authentication_and_cross_site_boundary(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    provider = FakeProvider()
    app = create_app(Settings(tmp_path / "data", workspace, access_token="fixture"), provider)
    client = TestClient(app)
    try:
        assert client.get("/api/project-references").status_code == 401
        assert client.get(
            "/api/project-references", headers={"sec-fetch-site": "cross-site"},
        ).status_code == 403
        assert provider.requests == []
    finally:
        client.close()


def test_disposable_reference_seed_is_bounded_terminal_and_refuses_second_write():
    from seed_project_references_fixture import seed
    from seed_task_detail_fixture import MARKER

    with tempfile.TemporaryDirectory(prefix="mybot-astryx-workbench.references_", dir="/tmp") as directory_path:
        root = Path(directory_path)
        (root / "workspace").mkdir()
        (root / "workspace/README.md").write_text(MARKER, encoding="utf-8")
        store = Store(root / "data")
        value = seed(directory_path)
        assert (value["projects"], value["tasks"], value["runs"]) == (45, 45, 88)
        assert value["all_runs_terminal"] is True
        assert {run["status"] for run in store.list("runs")} <= {"failed", "canceled", "succeeded"}
        assert store.list("models") == []
        with sqlite3.connect(store.path) as db:
            assert db.execute("SELECT COUNT(*) FROM events").fetchone()[0] == 0
        with pytest.raises(ValueError, match="no business records"):
            seed(directory_path)


def test_disposable_reference_seed_rejects_unmarked_or_unrelated_paths(tmp_path):
    from seed_project_references_fixture import seed

    with pytest.raises(ValueError, match="explicit"):
        seed(str(tmp_path))
    with tempfile.TemporaryDirectory(prefix="mybot-astryx-workbench.references_", dir="/tmp") as directory_path:
        root = Path(directory_path)
        (root / "workspace").mkdir()
        (root / "workspace/README.md").write_text("unmarked", encoding="utf-8")
        Store(root / "data")
        with pytest.raises(ValueError, match="marker"):
            seed(directory_path)
