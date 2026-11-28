"""One task and a bounded Run-history page from one read-only snapshot."""

from __future__ import annotations

from contextlib import closing
import json
from pathlib import Path
import sqlite3

from pydantic import Field, field_validator

from .saved_views import ViewInput
from .task_query import MAX_PAGE


HISTORY_ORDER = "created-desc-source-v1"


class TaskDetailError(Exception):
    def __init__(self, code: str, status: int = 422):
        self.code, self.status = code, status
        super().__init__(code)


class TaskDetailRequest(ViewInput):
    identifier: str = Field(min_length=1, max_length=100)
    scope_project_id: str | None = Field(default=None, min_length=1, max_length=100)
    page: int = Field(default=1, ge=1, le=MAX_PAGE)
    page_size: int = Field(default=20)

    @field_validator("identifier", "scope_project_id")
    @classmethod
    def exact_identifier(cls, value):
        if value is not None:
            if value.strip() != value:
                raise ValueError("task_detail_identifier_invalid")
            value.encode("utf-8")
        return value

    @field_validator("page_size")
    @classmethod
    def finite_capacity(cls, value):
        if value not in (20, 50, 100):
            raise ValueError("task_detail_page_size_invalid")
        return value


def parse_task_detail(identifier, scope_project_id, page, page_size):
    try:
        return TaskDetailRequest.model_validate({
            "identifier": identifier, "scope_project_id": scope_project_id,
            "page": page, "page_size": page_size,
        })
    except (ValueError, TypeError) as error:
        raise TaskDetailError("task_detail_invalid") from error


def run_category(run):
    if run is None:
        return "pending"
    if run["status"] in ("queued", "running", "pause_requested", "cancel_requested"):
        return "active"
    if run["status"] in ("failed", "interrupted", "paused"):
        return "attention"
    return "completed" if run["status"] == "succeeded" else "other"


def read_task_detail(database: Path, request: TaskDetailRequest):
    request = TaskDetailRequest.model_validate(request.model_dump())
    with closing(sqlite3.connect(
        database.resolve().as_uri() + "?mode=ro", uri=True, timeout=10,
    )) as db:
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA query_only=ON")
        db.execute("BEGIN")
        task = db.execute(
            "SELECT t.id,t.project_id,t.title,t.goal,t.acceptance,t.files,t.created_at,"
            "p.name AS project_name FROM tasks t JOIN projects p ON p.id=t.project_id "
            "WHERE t.id=?", (request.identifier,),
        ).fetchone()
        if (
            task is None or
            (request.scope_project_id is not None and
             task["project_id"] != request.scope_project_id)
        ):
            raise TaskDetailError("task_detail_unavailable", 404)
        total = db.execute(
            "SELECT COUNT(*) FROM runs WHERE task_id=? AND run_kind='execution'",
            (request.identifier,),
        ).fetchone()[0]
        latest = db.execute(
            "SELECT id,task_id,status,created_at FROM runs WHERE task_id=? AND run_kind='execution' "
            "AND run_kind='execution' ORDER BY created_at DESC,rowid ASC LIMIT 1",
            (request.identifier,),
        ).fetchone()
        latest = dict(latest) if latest is not None else None
        total_pages = max(1, (total + request.page_size - 1) // request.page_size)
        page = min(request.page, total_pages)
        history = [dict(row) for row in db.execute(
            "SELECT id,task_id,status,created_at FROM runs WHERE task_id=? "
            "ORDER BY created_at DESC,rowid ASC LIMIT ? OFFSET ?",
            (request.identifier, request.page_size, (page - 1) * request.page_size),
        ).fetchall()]
        item = {
            "task": {
                key: json.loads(task[key]) if key == "files" else task[key]
                for key in ("id", "project_id", "title", "goal", "acceptance", "files", "created_at")
            },
            "project": {"id": task["project_id"], "name": task["project_name"]},
            "latest_run": latest, "state_category": run_category(latest),
            "attempts": total,
        }
    return {
        "schema_version": 1, "unit": "task_detail", "item": item,
        "history": {
            "unit": "runs", "items": history, "total": total,
            "requested_page": request.page, "page": page,
            "page_size": request.page_size, "total_pages": total_pages,
            "has_more": page < total_pages, "order": HISTORY_ORDER,
        },
    }
