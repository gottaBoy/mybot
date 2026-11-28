"""Bounded all-Run history pages without execution or provider dependencies."""

from __future__ import annotations

from contextlib import closing
import json
from pathlib import Path
import sqlite3
from typing import Literal

from pydantic import Field, field_validator

from .saved_views import ViewInput
from .task_query import (
    SORT_SEMANTICS, TaskQueryRequest, natural_compare, strict_json,
)


RUN_SORT_COLUMNS = {
    "id": "run_id", "title": "title", "projectName": "project_name",
    "status": "status", "created_at": "created_at",
}


class RunQueryError(Exception):
    def __init__(self, code: str, status: int = 422):
        self.code, self.status = code, status
        super().__init__(code)


class RunSortRule(ViewInput):
    sortKey: Literal["id", "title", "projectName", "status", "created_at"]
    direction: Literal["ascending", "descending"]


class RunQueryRequest(TaskQueryRequest):
    sorts: list[RunSortRule] = Field(default_factory=list, max_length=1)

    @field_validator("query")
    @classmethod
    def unicode_query(cls, value):
        json.dumps(value.model_dump(), ensure_ascii=False).encode("utf-8")
        return value


def parse_run_query(query, sorts, scope_project_id, page, page_size):
    try:
        return RunQueryRequest.model_validate({
            "query": strict_json(query), "sorts": strict_json(sorts),
            "scope_project_id": scope_project_id, "page": page, "page_size": page_size,
        })
    except (ValueError, TypeError, RecursionError) as error:
        raise RunQueryError("run_query_invalid") from error


def read_run_page(database: Path, request: RunQueryRequest):
    request = RunQueryRequest.model_validate(request.model_dump())
    query = request.effective_query()
    sorts = request.effective_sorts()
    projects = query["projects"]
    arguments = list(projects)
    project_where = (
        f"AND p.id IN ({','.join('?' for _ in projects)})" if projects else ""
    )
    conditions = []
    if query["text"]:
        conditions.append(
            "instr(mybot_lower(run_id || ' ' || task_id || ' ' || title || ' ' || "
            "project_id || ' ' || project_name), ?) > 0"
        )
        arguments.append(query["text"].lower())
    if query["states"]:
        conditions.append(
            f"state_category IN ({','.join('?' for _ in query['states'])})"
        )
        arguments.extend(query["states"])
    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    cte = f"""
        WITH run_states AS (
            SELECT r.id AS run_id,r.rowid AS source_order,r.task_id,r.status,r.created_at,
                   t.title,t.project_id,p.name AS project_name,
                   CASE WHEN r.status IN ('queued','running','pause_requested','cancel_requested')
                            THEN 'active'
                        WHEN r.status IN ('failed','interrupted','paused') THEN 'attention'
                        WHEN r.status='succeeded' THEN 'completed'
                        ELSE 'other' END AS state_category
            FROM runs r JOIN tasks t ON t.id=r.task_id
                JOIN projects p ON p.id=t.project_id
                WHERE r.run_kind='execution' {project_where}
        ), filtered AS (SELECT * FROM run_states {where})
    """
    order = [
        f"{RUN_SORT_COLUMNS[rule['sortKey']]} COLLATE MYBOT_NATURAL_V1 "
        f"{'ASC' if rule['direction'] == 'ascending' else 'DESC'}"
        for rule in sorts
    ]
    order.extend(["created_at DESC", "source_order ASC"])
    with closing(sqlite3.connect(
        database.resolve().as_uri() + "?mode=ro", uri=True, timeout=10,
    )) as db:
        db.row_factory = sqlite3.Row
        db.create_function("mybot_lower", 1, str.lower, deterministic=True)
        db.create_collation("MYBOT_NATURAL_V1", natural_compare)
        db.execute("PRAGMA query_only=ON")
        db.execute("BEGIN")
        if projects:
            present = {
                row[0] for row in db.execute(
                    f"SELECT id FROM projects WHERE id IN ({','.join('?' for _ in projects)})",
                    projects,
                )
            }
            if present != set(projects):
                raise RunQueryError("run_query_project_unavailable")
        total = db.execute(cte + "SELECT COUNT(*) FROM filtered", arguments).fetchone()[0]
        total_pages = max(1, (total + request.page_size - 1) // request.page_size)
        page = min(request.page, total_pages)
        rows = db.execute(
            cte + f"SELECT * FROM filtered ORDER BY {','.join(order)} LIMIT ? OFFSET ?",
            [*arguments, request.page_size, (page - 1) * request.page_size],
        ).fetchall()
        items = [{
            "run": {
                "id": row["run_id"], "task_id": row["task_id"],
                "status": row["status"], "created_at": row["created_at"],
            },
            "task": {
                "id": row["task_id"], "project_id": row["project_id"], "title": row["title"],
            },
            "project": {"id": row["project_id"], "name": row["project_name"]},
            "state_category": row["state_category"],
        } for row in rows]
    return {
        "schema_version": 1, "unit": "runs", "items": items, "total": total,
        "requested_page": request.page, "page": page, "page_size": request.page_size,
        "total_pages": total_pages, "has_more": page < total_pages,
        "query": query, "sorts": sorts, "scope_project_id": request.scope_project_id,
        "sort_semantics": SORT_SEMANTICS,
    }
