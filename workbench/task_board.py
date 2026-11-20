"""Bounded Task board columns from one read-only latest-Run snapshot."""

from __future__ import annotations

from contextlib import closing
import json
from pathlib import Path
import sqlite3
from typing import Annotated

from pydantic import Field, field_validator

from .saved_views import ProjectIdentifier, SavedViewQuery, ViewInput
from .task_query import (
    MAX_PAGE, TaskQueryRequest, strict_json, task_query_items, task_query_sql,
)


BOARD_STATES = ("pending", "active", "attention", "completed", "other")
COLUMN_SIZE = 20
BOARD_ORDER = "tasks-created-v1"
EMPTY_PAGES = '{"pending":1,"active":1,"attention":1,"completed":1,"other":1}'
BoardPage = Annotated[int, Field(ge=1, le=MAX_PAGE)]


class TaskBoardError(Exception):
    def __init__(self, code: str, status: int = 422):
        self.code, self.status = code, status
        super().__init__(code)


class BoardPages(ViewInput):
    pending: BoardPage
    active: BoardPage
    attention: BoardPage
    completed: BoardPage
    other: BoardPage


class TaskBoardRequest(ViewInput):
    query: SavedViewQuery
    pages: BoardPages
    scope_project_id: ProjectIdentifier | None = None

    @field_validator("query")
    @classmethod
    def no_board_jql(cls, value):
        if value.jql:
            raise ValueError("task_board_jql_unsupported")
        json.dumps(value.model_dump(), ensure_ascii=False).encode("utf-8")
        return value

    @field_validator("scope_project_id")
    @classmethod
    def exact_project(cls, value):
        if value is not None:
            if value.strip() != value:
                raise ValueError("task_board_scope_invalid")
            value.encode("utf-8")
        return value

    def effective_query(self):
        return TaskQueryRequest(
            query=self.query, scope_project_id=self.scope_project_id,
        ).effective_query()


def parse_task_board(query, pages, scope_project_id):
    try:
        return TaskBoardRequest.model_validate({
            "query": strict_json(query), "pages": strict_json(pages),
            "scope_project_id": scope_project_id,
        })
    except (ValueError, TypeError, RecursionError) as error:
        raise TaskBoardError("task_board_invalid") from error


def read_task_board(database: Path, request: TaskBoardRequest):
    request = TaskBoardRequest.model_validate(request.model_dump())
    query = request.effective_query()
    pages = request.pages.model_dump()
    projects = query["projects"]
    cte, arguments = task_query_sql(query)
    with closing(sqlite3.connect(
        database.resolve().as_uri() + "?mode=ro", uri=True, timeout=10,
    )) as db:
        db.row_factory = sqlite3.Row
        db.create_function("mybot_lower", 1, str.lower, deterministic=True)
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
                raise TaskBoardError("task_board_project_unavailable")
        counts = {
            row["state_category"]: row["total"]
            for row in db.execute(
                cte + "SELECT state_category,COUNT(*) AS total FROM filtered GROUP BY state_category",
                arguments,
            )
        }
        columns = []
        for state in BOARD_STATES:
            total = counts.get(state, 0)
            total_pages = max(1, (total + COLUMN_SIZE - 1) // COLUMN_SIZE)
            page = min(pages[state], total_pages)
            rows = db.execute(
                cte + "SELECT * FROM filtered WHERE state_category=?"
                " ORDER BY created_at DESC,source_order ASC LIMIT ? OFFSET ?",
                [*arguments, state, COLUMN_SIZE, (page - 1) * COLUMN_SIZE],
            ).fetchall()
            columns.append({
                "state_category": state, "total": total,
                "requested_page": pages[state], "page": page,
                "total_pages": total_pages, "has_more": page < total_pages,
                "items": task_query_items(rows),
            })
    return {
        "schema_version": 1, "unit": "task_board", "query": query,
        "scope_project_id": request.scope_project_id, "order": BOARD_ORDER,
        "column_size": COLUMN_SIZE, "total": sum(counts.values()), "columns": columns,
    }
