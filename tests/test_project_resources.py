import json
import sqlite3
from urllib.parse import quote

from fastapi.testclient import TestClient
import pytest

from test_project_references import reference_directory
from test_workbench import FakeProvider
from workbench.app import create_app
from workbench.config import Settings
from workbench.project_resources import (
    ProjectResourceError, parse_project_detail, parse_project_query,
    read_project_detail, read_project_query,
)


def query(client, **params):
    response = client.get("/api/projects/query", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def detail(client, identifier="p00"):
    response = client.get(f"/api/projects/{quote(identifier, safe='')}/detail")
    assert response.status_code == 200, response.text
    return response.json()


def test_bootstrap_explicitly_advertises_independent_resource_capabilities(reference_directory):
    client, _, _ = reference_directory
    capabilities = client.get("/api/bootstrap").json()["capabilities"]
    assert capabilities["project_detail"] is capabilities["project_query"] is True
    assert capabilities["project_references"] is True


def test_query_returns_exact_bounded_summary_without_notes_or_context(reference_directory):
    client, _, _ = reference_directory
    value = query(client)
    assert set(value) == {
        "schema_version", "unit", "query", "requested_page", "page", "page_size",
        "total", "total_pages", "has_more", "order", "items",
    }
    assert value == {
        "schema_version": 1, "unit": "project_query", "query": "",
        "requested_page": 1, "page": 1, "page_size": 20,
        "total": 45, "total_pages": 3, "has_more": True,
        "order": "projects-created-v1",
        "items": [{
            "project": {
                "id": f"p{index:02}", "name": f"Reference {index:02}",
                "goal": "PRIVATE_GOAL", "directory": "PRIVATE_DIRECTORY",
            },
            "task_count": int(index == 44), "run_count": 0,
        } for index in range(44, 24, -1)],
    }
    serialized = json.dumps(value)
    for forbidden in (
        "PRIVATE_NOTES", "PRIVATE_TASK_GOAL", "PRIVATE_ACCEPTANCE",
        "PRIVATE_FILE", "PRIVATE_ERROR", "private_config", "private_context",
    ):
        assert forbidden not in serialized


def test_detail_returns_exact_full_project_and_separate_task_run_counts(reference_directory):
    client, _, _ = reference_directory
    value = detail(client)
    assert value == {
        "schema_version": 1, "unit": "project_detail",
        "project": {
            "id": "p00", "name": "Reference 00", "goal": "PRIVATE_GOAL",
            "directory": "PRIVATE_DIRECTORY", "notes": "PRIVATE_NOTES",
        },
        "task_count": 2, "run_count": 45,
    }
    for forbidden in ("PRIVATE_FILE", "PRIVATE_TASK_GOAL", "PRIVATE_ERROR", "private_config"):
        assert forbidden not in json.dumps(value)
    empty = detail(client, "p01")
    assert empty["task_count"] == empty["run_count"] == 0


def test_missing_detail_is_explicit_404_and_not_an_empty_project(reference_directory):
    client, _, _ = reference_directory
    response = client.get("/api/projects/missing/detail")
    assert response.status_code == 404
    assert response.json() == {"detail": {"code": "project_detail_unavailable"}}


@pytest.mark.parametrize("page_size", [20, 50, 100])
def test_query_capacity_page_clamp_and_global_order(reference_directory, page_size):
    client, _, _ = reference_directory
    value = query(client, page=1_000_000, page_size=page_size)
    total_pages = max(1, (45 + page_size - 1) // page_size)
    assert value["requested_page"] == 1_000_000
    assert value["page"] == value["total_pages"] == total_pages
    assert value["has_more"] is False
    assert len(value["items"]) == 45 - page_size * (total_pages - 1)
    assert value["items"][-1]["project"]["id"] == "p00"
    assert value["items"][-1]["task_count"] == 2
    assert value["items"][-1]["run_count"] == 45


def test_query_three_pages_cover_each_project_once_in_server_order(reference_directory):
    client, _, _ = reference_directory
    pages = [query(client, page=page) for page in (1, 2, 3)]
    assert [row["project"]["id"] for page in pages for row in page["items"]] == [
        f"p{index:02}" for index in range(44, -1, -1)
    ]


def test_equal_created_times_keep_source_order_not_id_order(reference_directory):
    client, store, _ = reference_directory
    with store.transaction() as db:
        for identifier in ("z-tie", "a-tie"):
            db.execute("INSERT INTO projects VALUES(?,?,?,?,?,?)", (
                identifier, "Tie", "", ".", "", "2099",
            ))
    value = query(client, q="Tie")
    assert [row["project"]["id"] for row in value["items"]] == ["z-tie", "a-tie"]


@pytest.mark.parametrize("text", ["研发", "ā_100%", "' OR 1=1 --", "_", "%", "p12"])
def test_query_is_literal_unicode_lower_id_name_only(reference_directory, text):
    client, store, _ = reference_directory
    with store.transaction() as db:
        db.execute("UPDATE projects SET name=? WHERE id='p12'", ("研发 Ā_100% ' OR 1=1 --",))
    value = query(client, q=text)
    assert value["total"] == 1
    assert value["items"][0]["project"]["id"] == "p12"
    for hidden_match in ("PRIVATE_GOAL", "PRIVATE_DIRECTORY", "PRIVATE_NOTES"):
        assert query(client, q=hidden_match)["total"] == 0


@pytest.mark.parametrize("space", [" ", "\t", "\n", "\u0085", "\u001c", "\u001d", "\u001e", "\u001f"])
def test_query_trimming_matches_python_whitespace_and_preserves_bom(reference_directory, space):
    client, _, _ = reference_directory
    value = query(client, q=f"{space}p00{space}")
    assert value["query"] == "p00" and value["total"] == 1
    value = query(client, q="\ufeffp00\ufeff")
    assert value["query"] == "\ufeffp00\ufeff" and value["total"] == 0


def test_detail_exact_unicode_identifier_is_bound_and_not_normalized(reference_directory):
    client, store, _ = reference_directory
    identifier = "研发😀\ufeff"
    with store.transaction() as db:
        db.execute("INSERT INTO projects VALUES(?,?,?,?,?,?)", (
            identifier, "Unicode project", "目标", ".", "资料", "2099",
        ))
    assert detail(client, identifier)["project"] == {
        "id": identifier, "name": "Unicode project", "goal": "目标",
        "directory": ".", "notes": "资料",
    }
    assert parse_project_detail("\ufeffid").identifier == "\ufeffid"


def test_detail_encoded_identifier_delimiters_are_not_reinterpreted(reference_directory):
    client, store, _ = reference_directory
    identifier = "folder/project?literal#percent%"
    with store.transaction() as db:
        db.execute("INSERT INTO projects VALUES(?,?,?,?,?,?)", (
            identifier, "Delimited identity", "", ".", "", "2099",
        ))
    assert detail(client, identifier)["project"]["id"] == identifier


def test_query_empty_match_and_empty_workspace_have_explicit_page_shape(reference_directory, tmp_path):
    client, _, _ = reference_directory
    value = query(client, q="not-present", page=99)
    assert value["items"] == []
    assert value["total"] == 0
    assert value["page"] == value["total_pages"] == 1
    assert value["has_more"] is False
    workspace = tmp_path / "empty-workspace"
    workspace.mkdir()
    provider = FakeProvider()
    app = create_app(Settings(tmp_path / "empty-data", workspace), provider)
    with TestClient(app) as empty_client:
        empty = query(empty_client, page=99)
        assert empty == {**value, "query": ""}
        assert empty_client.get("/api/projects/missing/detail").status_code == 404
    assert provider.requests == []


@pytest.mark.parametrize("params", [
    [("unknown", "x")], [("selected", '["p00"]')], [("q", "a"), ("q", "b")],
    [("page", "1"), ("page", "2")], [("page_size", "20"), ("page_size", "50")],
])
def test_query_rejects_unknown_and_repeated_parameters(reference_directory, params):
    client, _, _ = reference_directory
    response = client.get("/api/projects/query", params=params)
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "project_query_parameters_invalid"}}


@pytest.mark.parametrize("params", [
    {"q": "x"}, {"page": "1"}, {"unknown": "x"},
    [("q", "a"), ("q", "b")],
])
def test_detail_rejects_every_query_parameter(reference_directory, params):
    client, _, _ = reference_directory
    response = client.get("/api/projects/p00/detail", params=params)
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "project_detail_parameters_invalid"}}


@pytest.mark.parametrize("params", [
    {"q": "x" * 2001}, {"page": 0}, {"page": -1}, {"page": 1_000_001},
    {"page": "true"}, {"page": "x"}, {"page_size": 0}, {"page_size": 21},
    {"page_size": 101}, {"page_size": "true"},
])
def test_query_rejects_invalid_transport_values(reference_directory, params):
    client, _, _ = reference_directory
    response = client.get("/api/projects/query", params=params)
    assert response.status_code == 422
    assert "items" not in response.json()


@pytest.mark.parametrize("identifier", [" p00", "p00 ", "p00\u0085", "x" * 101])
def test_detail_rejects_invalid_transport_identifier(reference_directory, identifier):
    client, _, _ = reference_directory
    response = client.get(f"/api/projects/{quote(identifier, safe='')}/detail")
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "project_detail_invalid"}}


@pytest.mark.parametrize("identifier", ["", "\ud800", None, 1, True, "x" * 101, "\u001cp00"])
def test_detail_parser_rejects_malformed_unicode_and_types(identifier):
    with pytest.raises(ProjectResourceError) as caught:
        parse_project_detail(identifier)
    assert caught.value.code == "project_detail_invalid"


@pytest.mark.parametrize("args", [
    ("\ud800", 1, 20), (True, 1, 20), ("", True, 20), ("", 1.0, 20),
    ("", 1, True), ("", 1, 20.0), ("", 1, 21),
])
def test_query_parser_reuses_strict_reference_bounds(args):
    with pytest.raises(ProjectResourceError) as caught:
        parse_project_query(*args)
    assert caught.value.code == "project_query_invalid"


def test_readers_do_not_mutate_business_rows_or_events(reference_directory):
    client, store, provider = reference_directory
    before = {table: store.list(table) for table in ("projects", "tasks", "runs")}
    with sqlite3.connect(store.path) as db:
        events_before = db.execute("SELECT * FROM events").fetchall()
    query(client, q="Reference", page_size=100)
    detail(client)
    assert {table: store.list(table) for table in before} == before
    with sqlite3.connect(store.path) as db:
        assert db.execute("SELECT * FROM events").fetchall() == events_before
    assert provider.requests == []


def test_orphans_do_not_contribute_to_detail_or_summary_counts(reference_directory):
    client, store, _ = reference_directory
    with sqlite3.connect(store.path) as db:
        db.execute("INSERT INTO tasks VALUES('orphan','missing','Orphan','','','[]','')")
        for identifier, task in (("orphan-run", "orphan"), ("unknown-task-run", "missing")):
            db.execute(
                "INSERT INTO runs(id,task_id,request_id,status,config,context,created_at)"
                " VALUES(?,?,?,?,?,?,?)",
                (identifier, task, identifier, "running", "{}", "{}", ""),
            )
    value = query(client, page_size=100)
    assert sum(row["task_count"] for row in value["items"]) == 3
    assert sum(row["run_count"] for row in value["items"]) == 45
    assert detail(client)["run_count"] == 45
    assert client.get("/api/projects/missing/detail").status_code == 404


def test_read_snapshot_does_not_hold_write_lock_or_expose_uncommitted_data(reference_directory):
    client, store, _ = reference_directory
    with store.transaction() as db:
        db.execute("UPDATE projects SET name='Uncommitted' WHERE id='p00'")
        db.execute("INSERT INTO tasks VALUES('new-task','p00','New','','','[]','')")
        assert query(client, q="Uncommitted")["total"] == 0
        value = detail(client)
        assert value["project"]["name"] == "Reference 00"
        assert value["task_count"] == 2
    assert query(client, q="Uncommitted")["total"] == 1
    assert detail(client)["task_count"] == 3


def test_summary_total_items_and_counts_share_one_snapshot(reference_directory, monkeypatch):
    client, store, _ = reference_directory
    original = sqlite3.connect
    changes = []

    class ConcurrentConnection(sqlite3.Connection):
        def execute(self, sql, parameters=()):
            result = super().execute(sql, parameters)
            if "SELECT COUNT(*) FROM project_references" in sql and not changes:
                with original(store.path) as writer:
                    writer.execute("UPDATE projects SET name='Changed' WHERE id='p00'")
                    writer.execute("INSERT INTO projects VALUES('p-new','New','','.','','2099')")
                    writer.execute("INSERT INTO tasks VALUES('new-task','p00','New','','','[]','')")
                changes.append(True)
            return result

    monkeypatch.setattr(
        "workbench.project_resources.sqlite3.connect",
        lambda *args, **kwargs: original(*args, **kwargs, factory=ConcurrentConnection),
    )
    value = query(client, q="Reference", page_size=100)
    assert value["total"] == len(value["items"]) == 45
    p00 = next(row for row in value["items"] if row["project"]["id"] == "p00")
    assert p00["project"]["name"] == "Reference 00"
    assert p00["task_count"] == 2
    assert query(client, q="Reference", page_size=100)["total"] == 44
    assert detail(client)["task_count"] == 3


def test_detail_fields_and_counts_are_one_snapshot_during_concurrent_update(reference_directory, monkeypatch):
    client, store, _ = reference_directory
    original = sqlite3.connect
    changes = []

    class ConcurrentConnection(sqlite3.Connection):
        def execute(self, sql, parameters=()):
            result = super().execute(sql, parameters)
            if "p.notes" in sql and not changes:
                with original(store.path) as writer:
                    writer.execute("UPDATE projects SET notes='Changed notes' WHERE id='p00'")
                    writer.execute("INSERT INTO tasks VALUES('new-task','p00','New','','','[]','')")
                changes.append(True)
            return result

    monkeypatch.setattr(
        "workbench.project_resources.sqlite3.connect",
        lambda *args, **kwargs: original(*args, **kwargs, factory=ConcurrentConnection),
    )
    value = detail(client)
    assert value["project"]["notes"] == "PRIVATE_NOTES"
    assert value["task_count"] == 2
    value = detail(client)
    assert value["project"]["notes"] == "Changed notes"
    assert value["task_count"] == 3


@pytest.mark.parametrize("kind,fail", [("query", False), ("query", True), ("detail", False), ("detail", True)])
def test_read_connections_are_read_only_and_close_on_every_outcome(reference_directory, monkeypatch, kind, fail):
    _, store, _ = reference_directory
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
                    super().execute("DELETE FROM projects")
                observed.append(sql)
                if fail:
                    raise sqlite3.OperationalError("injected read failure")
            return super().execute(sql, parameters)

        def close(self):
            self.closed = True
            return super().close()

    def connect(*args, **kwargs):
        assert args[0].endswith("?mode=ro") and kwargs["uri"] is True
        db = original(*args, **kwargs, factory=TrackingConnection)
        opened.append(db)
        return db

    monkeypatch.setattr("workbench.project_resources.sqlite3.connect", connect)
    if fail:
        with pytest.raises(sqlite3.OperationalError, match="injected read failure"):
            if kind == "query":
                read_project_query(store.path, parse_project_query("", 1, 20))
            else:
                read_project_detail(store.path, parse_project_detail("p00"))
    elif kind == "query":
        read_project_query(store.path, parse_project_query("", 1, 20))
    else:
        read_project_detail(store.path, parse_project_detail("p00"))
    assert observed and opened and all(db.closed for db in opened)


def test_missing_detail_closes_connection(reference_directory, monkeypatch):
    _, store, _ = reference_directory
    original = sqlite3.connect
    closed = []

    class TrackingConnection(sqlite3.Connection):
        def close(self):
            closed.append(True)
            return super().close()

    monkeypatch.setattr(
        "workbench.project_resources.sqlite3.connect",
        lambda *args, **kwargs: original(*args, **kwargs, factory=TrackingConnection),
    )
    with pytest.raises(ProjectResourceError) as caught:
        read_project_detail(store.path, parse_project_detail("missing"))
    assert caught.value.status == 404 and closed == [True]


@pytest.mark.parametrize("kind", ["query", "detail"])
def test_missing_database_is_not_created(tmp_path, kind):
    database = tmp_path / "absent.sqlite3"
    with pytest.raises(sqlite3.OperationalError):
        if kind == "query":
            read_project_query(database, parse_project_query("", 1, 20))
        else:
            read_project_detail(database, parse_project_detail("p00"))
    assert not database.exists()


@pytest.mark.parametrize("path", ["/api/projects/query", "/api/projects/p00/detail"])
def test_resource_routes_retain_authentication_and_cross_site_boundary(tmp_path, path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    provider = FakeProvider()
    app = create_app(Settings(tmp_path / "data", workspace, access_token="fixture-token"), provider)
    with TestClient(app) as client:
        assert client.get(path).status_code == 401
        assert client.post(
            "/api/auth", json={"token": "fixture-token"},
            headers={"X-Workbench-Request": "1"},
        ).status_code == 200
        assert client.get(path, headers={"sec-fetch-site": "cross-site"}).status_code == 403
        assert client.get(path).status_code == (200 if path.endswith("query") else 404)
    assert provider.requests == []
