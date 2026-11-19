"""Bounded project summaries and one full project from read-only snapshots."""

from __future__ import annotations

from contextlib import closing
from pathlib import Path
import sqlite3

from pydantic import Field, field_validator

from .project_references import (
    PROJECT_REFERENCE_ORDER, REFERENCE_CTE, ProjectReferenceError,
    ProjectReferenceRequest, parse_project_references,
)
from .saved_views import ViewInput


class ProjectResourceError(Exception):
    def __init__(self, code: str, status: int = 422):
        self.code, self.status = code, status
        super().__init__(code)


class ProjectDetailRequest(ViewInput):
    identifier: str = Field(min_length=1, max_length=100)

    @field_validator("identifier")
    @classmethod
    def exact_identifier(cls, value):
        if value.strip() != value:
            raise ValueError("project_detail_identifier_invalid")
        value.encode("utf-8")
        return value


def parse_project_detail(identifier):
    try:
        return ProjectDetailRequest.model_validate({"identifier": identifier})
    except (ValueError, TypeError) as error:
        raise ProjectResourceError("project_detail_invalid") from error


def parse_project_query(q, page, page_size):
    try:
        return parse_project_references(q, page, page_size, "[]")
    except ProjectReferenceError as error:
        raise ProjectResourceError("project_query_invalid") from error


def project_item(row, *, full=False):
    fields = ["id", "name", "goal", "directory"]
    if full:
        fields.append("notes")
    return {
        "project": {field: row[field] for field in fields},
        "task_count": row["task_count"], "run_count": row["run_count"],
    }


def read_project_query(database: Path, request: ProjectReferenceRequest):
    request = ProjectReferenceRequest.model_validate(request.model_dump())
    if request.selected:
        raise ProjectResourceError("project_query_invalid")
    query = request.q.strip()
    where = (
        "WHERE instr(mybot_lower(r.project_id || ' ' || r.project_name),?) > 0"
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
        total = db.execute(
            REFERENCE_CTE + f"SELECT COUNT(*) FROM project_references r {where}",
            arguments,
        ).fetchone()[0]
        total_pages = max(1, (total + request.page_size - 1) // request.page_size)
        page = min(request.page, total_pages)
        items = [
            project_item(row) for row in db.execute(
                REFERENCE_CTE +
                "SELECT r.project_id AS id,r.project_name AS name,p.goal,p.directory,"
                "r.task_count,r.run_count FROM project_references r "
                f"JOIN projects p ON p.id=r.project_id {where} "
                "ORDER BY r.created_at DESC,r.source_order ASC LIMIT ? OFFSET ?",
                [*arguments, request.page_size, (page - 1) * request.page_size],
            ).fetchall()
        ]
    return {
        "schema_version": 1, "unit": "project_query", "query": query,
        "requested_page": request.page, "page": page, "page_size": request.page_size,
        "total": total, "total_pages": total_pages, "has_more": page < total_pages,
        "order": PROJECT_REFERENCE_ORDER, "items": items,
    }


def read_project_detail(database: Path, request: ProjectDetailRequest):
    request = ProjectDetailRequest.model_validate(request.model_dump())
    with closing(sqlite3.connect(
        database.resolve().as_uri() + "?mode=ro", uri=True, timeout=10,
    )) as db:
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA query_only=ON")
        db.execute("BEGIN")
        row = db.execute(
            REFERENCE_CTE +
            "SELECT r.project_id AS id,r.project_name AS name,p.goal,p.directory,p.notes,"
            "r.task_count,r.run_count FROM project_references r "
            "JOIN projects p ON p.id=r.project_id WHERE r.project_id=?",
            (request.identifier,),
        ).fetchone()
        if row is None:
            raise ProjectResourceError("project_detail_unavailable", 404)
        item = project_item(row, full=True)
    return {"schema_version": 1, "unit": "project_detail", **item}
