"""Explicit, bounded references to completed work in the same Task."""

from __future__ import annotations

import hashlib
import json

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_ARTIFACT_BYTES = 32768
MAX_REFERENCE_BYTES = 65536
ARTIFACT_ORDER = "artifacts-created-v1"
TERMINAL_SQL = "('succeeded','failed','canceled')"


class ArtifactReference(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    id: str = Field(min_length=1, max_length=100)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    @field_validator("id")
    @classmethod
    def exact_identifier(cls, value):
        if value.strip() != value:
            raise ValueError("artifact_identifier_invalid")
        value.encode("utf-8")
        return value


def artifact_record(row):
    record = {key: row[key] for key in (
        "id", "run_id", "task_id", "title", "kind", "content", "created_at",
    )}
    record["bytes"] = len(record["content"].encode("utf-8"))
    record["sha256"] = hashlib.sha256(json.dumps(
        record, sort_keys=True, ensure_ascii=False, separators=(",", ":"),
    ).encode("utf-8")).hexdigest()
    return record


def select_artifacts(db, task_id, references, error):
    selected, size, seen = [], 0, set()
    for ref in references:
        if ref.id in seen:
            raise error("task_artifact_duplicate", 422)
        seen.add(ref.id)
        row = db.execute(
            "SELECT a.id,a.run_id,a.title,a.kind,a.created_at,r.task_id,"
            f"CASE WHEN length(CAST(a.content AS BLOB)) BETWEEN 1 AND {MAX_ARTIFACT_BYTES}"
            " THEN a.content ELSE NULL END AS content"
            " FROM artifacts a JOIN runs r ON r.id=a.run_id"
            f" WHERE a.id=? AND r.task_id=? AND r.status IN {TERMINAL_SQL}",
            (ref.id, task_id),
        ).fetchone()
        if row is None:
            raise error("task_artifact_unavailable", 404)
        if row["content"] is None:
            raise error("task_artifact_too_large", 422)
        record = artifact_record(row)
        size += record["bytes"]
        if not record["content"] or record["bytes"] > MAX_ARTIFACT_BYTES or size > MAX_REFERENCE_BYTES:
            raise error("task_artifact_too_large", 422)
        if record["sha256"] != ref.sha256:
            raise error("task_artifact_changed")
        selected.append(record)
    return selected


def artifact_page(db, task_id, page):
    predicate = f"r.task_id=? AND r.status IN {TERMINAL_SQL}"
    total = db.execute(
        f"SELECT COUNT(*) FROM artifacts a JOIN runs r ON r.id=a.run_id WHERE {predicate}",
        (task_id,),
    ).fetchone()[0]
    pages = max(1, (total + 19) // 20)
    current = min(page, pages)
    # Bodies are admitted only by explicit preview. Oversized records are listed,
    # but never read into the picker or silently truncated.
    rows = db.execute(
        "SELECT a.id,a.run_id,a.title,a.kind,a.created_at,"
        "length(CAST(a.content AS BLOB)) AS bytes,"
        f"CASE WHEN length(CAST(a.content AS BLOB)) BETWEEN 1 AND {MAX_ARTIFACT_BYTES}"
        " THEN a.content ELSE NULL END AS content,r.task_id"
        f" FROM artifacts a JOIN runs r ON r.id=a.run_id WHERE {predicate}"
        " ORDER BY a.created_at DESC,a.id ASC LIMIT 20 OFFSET ?",
        (task_id, (current - 1) * 20),
    ).fetchall()
    items = []
    for row in rows:
        item = {key: row[key] for key in (
            "id", "run_id", "task_id", "title", "kind", "created_at", "bytes",
        )}
        item["sha256"] = artifact_record(row)["sha256"] if row["content"] is not None else None
        items.append(item)
    return {
        "schema_version": 1, "unit": "task_artifacts", "task_id": task_id,
        "items": items, "total": total, "requested_page": page, "page": current,
        "page_size": 20, "total_pages": pages, "has_more": current < pages,
        "order": ARTIFACT_ORDER,
    }
