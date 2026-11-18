"""Bounded project references and counts from one read-only workspace snapshot."""

from __future__ import annotations

from contextlib import closing
from pathlib import Path
import sqlite3

from pydantic import Field, field_validator

from .saved_views import ProjectIdentifier, ViewInput
from .task_query import strict_json


MAX_PROJECT_PAGE = 1_000_000
PROJECT_REFERENCE_ORDER = "projects-created-v1"


class ProjectReferenceError(Exception):
    def __init__(self, code: str, status: int = 422):
        self.code, self.status = code, status
        super().__init__(code)


class ProjectReferenceRequest(ViewInput):
    q: str = Field(default="", max_length=2000)
    page: int = Field(default=1, ge=1, le=MAX_PROJECT_PAGE)
    page_size: int = Field(default=20)
    selected: list[ProjectIdentifier] = Field(default_factory=list, max_length=100)

    @field_validator("q")
    @classmethod
    def unicode_query(cls, value):
        value.encode("utf-8")
        return value

    @field_validator("page_size")
    @classmethod
    def finite_capacity(cls, value):
        if value not in (20, 50, 100):
            raise ValueError("project_references_page_size_invalid")
        return value

    @field_validator("selected")
    @classmethod
    def exact_unique_projects(cls, values):
        if len(set(values)) != len(values):
            raise ValueError("project_references_selected_duplicate")
        for value in values:
            if value.strip() != value:
                raise ValueError("project_references_identifier_invalid")
            value.encode("utf-8")
        return sorted(values)


def parse_project_references(q, page, page_size, selected):
    try:
        return ProjectReferenceRequest.model_validate({
            "q": q, "page": page, "page_size": page_size,
            "selected": strict_json(selected),
        })
    except (ValueError, TypeError, RecursionError) as error:
        raise ProjectReferenceError("project_references_invalid") from error


REFERENCE_CTE = """
    WITH task_totals AS (
        SELECT t.project_id,COUNT(*) AS task_count
        FROM tasks t JOIN projects p ON p.id=t.project_id
        GROUP BY t.project_id
    ), run_totals AS (
        SELECT t.project_id,COUNT(*) AS run_count
        FROM runs r JOIN tasks t ON t.id=r.task_id
        JOIN projects p ON p.id=t.project_id
        GROUP BY t.project_id
    ), project_references AS (
        SELECT p.id AS project_id,p.name AS project_name,p.created_at,
               p.rowid AS source_order,
               COALESCE(t.task_count,0) AS task_count,
               COALESCE(r.run_count,0) AS run_count
        FROM projects p
        LEFT JOIN task_totals t ON t.project_id=p.id
        LEFT JOIN run_totals r ON r.project_id=p.id
    )
"""


def reference_item(row):
    return {
        "project": {"id": row["project_id"], "name": row["project_name"]},
        "task_count": row["task_count"], "run_count": row["run_count"],
    }


def read_project_references(database: Path, request: ProjectReferenceRequest):
    request = ProjectReferenceRequest.model_validate(request.model_dump())
    query = request.q.strip()
    where = (
        "WHERE instr(mybot_lower(project_id || ' ' || project_name),?) > 0"
        if query else ""
    )
    arguments = [query.lower()] if query else []
    with closing(sqlite3.connect(
        database.resolve().as_uri() + "?mode=ro", uri=True, timeout=10,
    )) as db:
        db.row_factory = sqlite3.Row
        db.create_function("mybot_lower", 1, str.lower, deterministic=True)
        db.execute("PRAGMA query_only=ON")
        db.execute("BEGIN")
        totals_row = db.execute(
            REFERENCE_CTE +
            "SELECT COUNT(*) AS projects,COALESCE(SUM(task_count),0) AS tasks,"
            "COALESCE(SUM(run_count),0) AS runs FROM project_references",
        ).fetchone()
        totals = dict(totals_row)
        total = db.execute(
            REFERENCE_CTE + f"SELECT COUNT(*) FROM project_references {where}",
            arguments,
        ).fetchone()[0]
        total_pages = max(1, (total + request.page_size - 1) // request.page_size)
        page = min(request.page, total_pages)
        items = [
            reference_item(row) for row in db.execute(
                REFERENCE_CTE + f"SELECT * FROM project_references {where} "
                "ORDER BY created_at DESC,source_order ASC LIMIT ? OFFSET ?",
                [*arguments, request.page_size, (page - 1) * request.page_size],
            ).fetchall()
        ]
        selected_by_id = {}
        if request.selected:
            placeholders = ",".join("?" for _ in request.selected)
            selected_by_id = {
                row["project_id"]: reference_item(row) for row in db.execute(
                    REFERENCE_CTE +
                    f"SELECT * FROM project_references WHERE project_id IN ({placeholders})",
                    request.selected,
                ).fetchall()
            }
        selected = [
            selected_by_id[identifier] for identifier in request.selected
            if identifier in selected_by_id
        ]
        missing_ids = [
            identifier for identifier in request.selected if identifier not in selected_by_id
        ]
    return {
        "schema_version": 1, "unit": "project_references", "query": query,
        "requested_page": request.page, "page": page, "page_size": request.page_size,
        "total": total, "total_pages": total_pages, "has_more": page < total_pages,
        "order": PROJECT_REFERENCE_ORDER, "selected_ids": request.selected,
        "selected": selected, "missing_ids": missing_ids, "totals": totals, "items": items,
    }
