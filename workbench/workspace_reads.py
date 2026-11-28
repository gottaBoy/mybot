"""Read-only workspace counts and bounded cross-resource navigation search."""

from __future__ import annotations

from contextlib import closing
from pathlib import Path
import sqlite3

from pydantic import Field, field_validator

from .saved_views import ProjectIdentifier, SavedViewQuery, ViewInput
from .task_query import strict_json


SEARCH_ORDER = "projects-tasks-runs-created-v1"
TASK_CATEGORIES = ("pending", "active", "attention", "completed", "other")
RUN_CATEGORIES = ("active", "attention", "completed", "other")
STATUS_CATEGORY = (
    "CASE WHEN status IN ('queued','running','pause_requested','cancel_requested') "
    "THEN 'active' WHEN status IN ('failed','interrupted','paused') THEN 'attention' "
    "WHEN status='succeeded' THEN 'completed' ELSE 'other' END"
)


class WorkspaceReadError(Exception):
    def __init__(self, code: str, status: int = 422):
        self.code, self.status = code, status
        super().__init__(code)


def exact_identifier(value):
    if value is not None:
        if value.strip() != value:
            raise ValueError("workspace_scope_invalid")
        value.encode("utf-8")
    return value


class WorkspaceCountsRequest(ViewInput):
    projects: list[ProjectIdentifier] = Field(default_factory=list, max_length=100)
    scope_project_id: ProjectIdentifier | None = None

    @field_validator("projects")
    @classmethod
    def project_values(cls, values):
        query = SavedViewQuery.model_validate({
            "text": "", "projects": values, "states": [], "jql": "", "mode": "basic",
        })
        for value in query.projects:
            value.encode("utf-8")
        return query.projects

    @field_validator("scope_project_id")
    @classmethod
    def scope_value(cls, value):
        return exact_identifier(value)

    def effective_projects(self):
        return (
            [self.scope_project_id] if self.scope_project_id is not None
            else sorted(self.projects)
        )


class WorkspaceSearchRequest(ViewInput):
    q: str = Field(default="", max_length=2000)
    limit: int = Field(default=20)
    scope_project_id: ProjectIdentifier | None = None

    @field_validator("q")
    @classmethod
    def unicode_query(cls, value):
        value.encode("utf-8")
        return value

    @field_validator("scope_project_id")
    @classmethod
    def scope_value(cls, value):
        return exact_identifier(value)

    @field_validator("limit")
    @classmethod
    def finite_limit(cls, value):
        if value not in (20, 50):
            raise ValueError("workspace_search_limit_invalid")
        return value


def parse_workspace_counts(projects, scope_project_id):
    try:
        return WorkspaceCountsRequest.model_validate({
            "projects": strict_json(projects), "scope_project_id": scope_project_id,
        })
    except (ValueError, TypeError, RecursionError) as error:
        raise WorkspaceReadError("workspace_counts_invalid") from error


def parse_workspace_search(q, limit, scope_project_id):
    try:
        return WorkspaceSearchRequest.model_validate({
            "q": q, "limit": limit, "scope_project_id": scope_project_id,
        })
    except (ValueError, TypeError) as error:
        raise WorkspaceReadError("workspace_search_invalid") from error


def require_projects(db, projects, code):
    if not projects:
        return
    placeholders = ",".join("?" for _ in projects)
    present = {
        row[0] for row in db.execute(
            f"SELECT id FROM projects WHERE id IN ({placeholders})", projects,
        )
    }
    if present != set(projects):
        raise WorkspaceReadError(code)


def read_workspace_counts(database: Path, request: WorkspaceCountsRequest):
    request = WorkspaceCountsRequest.model_validate(request.model_dump())
    projects = request.effective_projects()
    where = (
        f"WHERE t.project_id IN ({','.join('?' for _ in projects)})"
        if projects else ""
    )
    cte = f"""
        WITH candidates AS (
            SELECT t.id FROM tasks t JOIN projects p ON p.id=t.project_id {where}
        ), ranked_runs AS (
            SELECT r.id,r.task_id,r.status,
                   ROW_NUMBER() OVER (
                       PARTITION BY r.task_id ORDER BY r.created_at DESC,r.rowid ASC
                   ) AS latest_rank
            FROM runs r JOIN candidates t ON t.id=r.task_id
            WHERE r.run_kind='execution'
        ), task_states AS (
            SELECT CASE WHEN r.id IS NULL THEN 'pending'
                        WHEN r.status IN ('queued','running','pause_requested','cancel_requested')
                            THEN 'active'
                        WHEN r.status IN ('failed','interrupted','paused') THEN 'attention'
                        WHEN r.status='succeeded' THEN 'completed'
                        ELSE 'other' END AS category
            FROM candidates t
            LEFT JOIN ranked_runs r ON r.task_id=t.id AND r.latest_rank=1
        )
    """
    with closing(sqlite3.connect(
        database.resolve().as_uri() + "?mode=ro", uri=True, timeout=10,
    )) as db:
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA query_only=ON")
        db.execute("BEGIN")
        require_projects(db, projects, "workspace_counts_project_unavailable")
        task_counts = dict.fromkeys(TASK_CATEGORIES, 0)
        for row in db.execute(
            cte + "SELECT category,COUNT(*) AS count FROM task_states GROUP BY category",
            projects,
        ):
            task_counts[row["category"]] = row["count"]
        run_counts = dict.fromkeys(RUN_CATEGORIES, 0)
        for row in db.execute(
            cte + f"SELECT {STATUS_CATEGORY} AS category,COUNT(*) AS count "
            "FROM ranked_runs GROUP BY category", projects,
        ):
            run_counts[row["category"]] = row["count"]
    return {
        "schema_version": 1, "unit": "workspace_counts",
        "projects": projects, "scope_project_id": request.scope_project_id,
        "task_counts": {"all": sum(task_counts.values()), **task_counts},
        "run_counts": {"all": sum(run_counts.values()), **run_counts},
    }


def read_workspace_search(database: Path, request: WorkspaceSearchRequest):
    request = WorkspaceSearchRequest.model_validate(request.model_dump())
    query = request.q.strip()
    where = "WHERE p.id=?" if request.scope_project_id is not None else ""
    arguments = [request.scope_project_id] if request.scope_project_id is not None else []
    project_match = task_match = run_match = ""
    if query:
        project_match = "WHERE instr(mybot_lower(project_id || ' ' || project_name),?) > 0"
        task_match = (
            "WHERE instr(mybot_lower(task_id || ' ' || task_title || ' ' || "
            "project_id || ' ' || project_name),?) > 0"
        )
        run_match = (
            "WHERE instr(mybot_lower(run_id || ' ' || task_id || ' ' || task_title || ' ' || "
            "project_id || ' ' || project_name),?) > 0"
        )
        arguments.extend([query.lower()] * 3)
    cte = f"""
        WITH project_candidates AS (
            SELECT p.rowid AS source_order,p.id AS project_id,p.name AS project_name,p.created_at
            FROM projects p {where}
        ), task_candidates AS (
            SELECT t.rowid AS source_order,t.id AS task_id,t.title AS task_title,t.created_at,
                   p.project_id,p.project_name
            FROM tasks t JOIN project_candidates p ON p.project_id=t.project_id
        ), run_candidates AS (
            SELECT r.rowid AS source_order,r.id AS run_id,r.status AS run_status,r.created_at,
                   t.task_id,t.task_title,t.project_id,t.project_name
            FROM runs r JOIN task_candidates t ON t.task_id=r.task_id
            WHERE r.run_kind='execution'
        ), matched AS (
            SELECT 0 AS kind_order,'project' AS kind,source_order,created_at,project_id,project_name,
                   NULL AS task_id,NULL AS task_title,NULL AS run_id,NULL AS run_status
            FROM project_candidates {project_match}
            UNION ALL
            SELECT 1,'task',source_order,created_at,project_id,project_name,task_id,task_title,NULL,NULL
            FROM task_candidates {task_match}
            UNION ALL
            SELECT 2,'run',source_order,created_at,project_id,project_name,
                   task_id,task_title,run_id,run_status
            FROM run_candidates {run_match}
        )
    """
    with closing(sqlite3.connect(
        database.resolve().as_uri() + "?mode=ro", uri=True, timeout=10,
    )) as db:
        db.row_factory = sqlite3.Row
        db.create_function("mybot_lower", 1, str.lower, deterministic=True)
        db.execute("PRAGMA query_only=ON")
        db.execute("BEGIN")
        require_projects(
            db, [request.scope_project_id] if request.scope_project_id is not None else [],
            "workspace_search_project_unavailable",
        )
        total = db.execute(
            cte + "SELECT COUNT(*) FROM matched", arguments,
        ).fetchone()[0]
        rows = db.execute(
            cte + "SELECT * FROM matched "
            "ORDER BY kind_order ASC,created_at DESC,source_order ASC LIMIT ?",
            [*arguments, request.limit],
        ).fetchall()
        items = []
        for row in rows:
            item = {
                "kind": row["kind"],
                "project": {"id": row["project_id"], "name": row["project_name"]},
            }
            if row["kind"] != "project":
                item["task"] = {
                    "id": row["task_id"], "project_id": row["project_id"],
                    "title": row["task_title"],
                }
            if row["kind"] == "run":
                item["run"] = {
                    "id": row["run_id"], "task_id": row["task_id"],
                    "status": row["run_status"], "created_at": row["created_at"],
                }
            items.append(item)
    return {
        "schema_version": 1, "unit": "workspace_search",
        "query": query, "limit": request.limit, "total": total,
        "has_more": total > request.limit, "scope_project_id": request.scope_project_id,
        "order": SEARCH_ORDER, "items": items,
    }
