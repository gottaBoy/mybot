"""Bounded, read-only task-list queries. No execution or provider dependency."""

from __future__ import annotations

from contextlib import closing
import json
from pathlib import Path
import re
import sqlite3

from pydantic import Field, field_validator

from .saved_views import (
    ProjectIdentifier, SavedViewQuery, SavedViewSortRule, ViewInput, unique,
)


MAX_PAGE = 90071992547409
SORT_SEMANTICS = "unicode-natural-v1"
SORT_COLUMNS = {
    "id": "id", "title": "title", "projectName": "project_name",
    "status": "status", "updated": "run_created_at",
    "created_at": "created_at", "attempts": "attempts",
}
EMPTY_QUERY = '{"text":"","projects":[],"states":[],"jql":"","mode":"basic"}'


class TaskQueryError(Exception):
    def __init__(self, code: str, status: int = 422):
        self.code, self.status = code, status
        super().__init__(code)


class TaskQueryRequest(ViewInput):
    query: SavedViewQuery
    sorts: list[SavedViewSortRule] = Field(default_factory=list, max_length=3)
    scope_project_id: ProjectIdentifier | None = None
    page: int = Field(default=1, ge=1, le=MAX_PAGE)
    page_size: int = Field(default=20)

    @field_validator("sorts")
    @classmethod
    def unique_sort_keys(cls, values):
        unique([value.sortKey for value in values], "task_query_sorts_duplicate")
        return values

    @field_validator("scope_project_id")
    @classmethod
    def exact_project(cls, value):
        if value is not None and value.strip() != value:
            raise ValueError("task_query_scope_invalid")
        if value is not None:
            value.encode("utf-8")
        return value

    @field_validator("page_size")
    @classmethod
    def finite_capacity(cls, value):
        if value not in (20, 50, 100):
            raise ValueError("task_query_page_size_invalid")
        return value

    def effective_query(self):
        value = self.query.model_dump()
        value["text"] = value["text"].strip()
        value["projects"] = (
            [self.scope_project_id] if self.scope_project_id is not None
            else sorted(value["projects"])
        )
        value["states"] = [
            state for state in ("pending", "active", "attention", "completed", "other")
            if state in value["states"]
        ]
        return value

    def effective_sorts(self):
        if self.query.jql:
            _, _, field, direction = self.query.jql.split()
            return [{
                "sortKey": "created_at" if field == "CREATED" else "title",
                "direction": "ascending" if direction == "ASC" else "descending",
            }]
        return [rule.model_dump() for rule in self.sorts]


def strict_json(value: str):
    def pairs(items):
        result = {}
        for key, item in items:
            if key in result:
                raise ValueError("duplicate_json_key")
            result[key] = item
        return result

    def constant(_value):
        raise ValueError("non_json_constant")

    result = json.loads(value, object_pairs_hook=pairs, parse_constant=constant)
    json.dumps(result, ensure_ascii=False).encode("utf-8")
    return result


def parse_task_query(query, sorts, scope_project_id, page, page_size):
    try:
        return TaskQueryRequest.model_validate({
            "query": strict_json(query), "sorts": strict_json(sorts),
            "scope_project_id": scope_project_id, "page": page, "page_size": page_size,
        })
    except (ValueError, TypeError, RecursionError) as error:
        raise TaskQueryError("task_query_invalid") from error


def natural_key(value: str):
    # Explicit cross-request collation; not a claim of Intl.Collator equivalence.
    result = []
    for token in re.split(r"([0-9]+)", value.lower()):
        if token.isascii() and token.isdigit():
            significant = token.lstrip("0") or "0"
            result.append((0, len(significant), significant))
        else:
            result.append((1, token))
    return result


def natural_compare(left, right):
    a, b = natural_key(left), natural_key(right)
    return (a > b) - (a < b)


def task_query_sql(query):
    """Shared latest-Run projection and filtering for bounded Task consumers."""
    projects = query["projects"]
    arguments = list(projects)
    project_where = (
        f"WHERE t.project_id IN ({','.join('?' for _ in projects)})"
        if projects else ""
    )
    conditions = []
    if query["text"]:
        conditions.append(
            "instr(mybot_lower(id || ' ' || title || ' ' || project_name || ' ' || "
            "COALESCE(run_id,'')), ?) > 0"
        )
        arguments.append(query["text"].lower())
    if query["states"]:
        conditions.append(
            f"state_category IN ({','.join('?' for _ in query['states'])})"
        )
        arguments.extend(query["states"])
    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    cte = f"""
        WITH candidates AS (
            SELECT t.rowid AS source_order,t.*,p.name AS project_name
            FROM tasks t JOIN projects p ON p.id=t.project_id {project_where}
        ), ranked_runs AS (
            SELECT r.id,r.task_id,r.status,r.created_at,
                   ROW_NUMBER() OVER (
                       PARTITION BY r.task_id ORDER BY r.created_at DESC,r.rowid ASC
                   ) AS latest_rank,
                   COUNT(*) OVER (PARTITION BY r.task_id) AS attempts
            FROM runs r JOIN candidates t ON t.id=r.task_id
        ), task_states AS (
            SELECT t.*,r.id AS run_id,r.status AS run_status,
                   COALESCE(r.status,'pending') AS status,
                   COALESCE(r.created_at,'') AS run_created_at,
                   COALESCE(r.attempts,0) AS attempts,
                   CASE WHEN r.id IS NULL THEN 'pending'
                        WHEN r.status IN ('queued','running','pause_requested','cancel_requested')
                            THEN 'active'
                        WHEN r.status IN ('failed','interrupted','paused') THEN 'attention'
                        WHEN r.status='succeeded' THEN 'completed'
                        ELSE 'other' END AS state_category
            FROM candidates t
            LEFT JOIN ranked_runs r ON r.task_id=t.id AND r.latest_rank=1
        ), filtered AS (SELECT * FROM task_states {where})
    """
    return cte, arguments


def task_query_items(rows):
    return [{
        "task": {
            key: json.loads(row[key]) if key == "files" else row[key]
            for key in ("id", "project_id", "title", "goal", "acceptance", "files", "created_at")
        },
        "project": {"id": row["project_id"], "name": row["project_name"]},
        "latest_run": ({
            "id": row["run_id"], "task_id": row["id"],
            "status": row["run_status"], "created_at": row["run_created_at"],
        } if row["run_id"] is not None else None),
        "state_category": row["state_category"], "attempts": row["attempts"],
    } for row in rows]


def read_task_page(database: Path, request: TaskQueryRequest):
    request = TaskQueryRequest.model_validate(request.model_dump())
    query = request.effective_query()
    sorts = request.effective_sorts()
    projects = query["projects"]
    cte, arguments = task_query_sql(query)
    order = []
    for rule in sorts:
        column = SORT_COLUMNS[rule["sortKey"]]
        direction = "ASC" if rule["direction"] == "ascending" else "DESC"
        collate = "" if column == "attempts" else " COLLATE MYBOT_NATURAL_V1"
        order.append(f"{column}{collate} {direction}")
    # Keep a deterministic continuation for equal sort values and default order.
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
            present = {row[0] for row in db.execute(
                f"SELECT id FROM projects WHERE id IN ({','.join('?' for _ in projects)})",
                projects,
            )}
            if present != set(projects):
                raise TaskQueryError("task_query_project_unavailable")
        total = db.execute(cte + "SELECT COUNT(*) FROM filtered", arguments).fetchone()[0]
        total_pages = max(1, (total + request.page_size - 1) // request.page_size)
        page = min(request.page, total_pages)
        rows = db.execute(
            cte + f"SELECT * FROM filtered ORDER BY {','.join(order)} LIMIT ? OFFSET ?",
            [*arguments, request.page_size, (page - 1) * request.page_size],
        ).fetchall()
        items = task_query_items(rows)
    return {
        "schema_version": 1, "unit": "tasks", "items": items, "total": total,
        "requested_page": request.page, "page": page, "page_size": request.page_size,
        "total_pages": total_pages, "has_more": page < total_pages,
        "query": query, "sorts": sorts, "scope_project_id": request.scope_project_id,
        "sort_semantics": SORT_SEMANTICS,
    }
