"""Trusted code checkpoints and exact-base continuation, without patch execution."""

from __future__ import annotations

import difflib
import json
from pathlib import PurePosixPath

from .coding_runner import CodingError
from .recovery import fingerprint
from .task_artifacts import artifact_record, TERMINAL_SQL

MAX_CHECKPOINT_BYTES = 524288


def code_diff(original, current):
    return "".join("".join(
        line if line.endswith("\n") else line + "\n\\ No newline at end of file\n"
        for line in difflib.unified_diff(
            original[path].splitlines(keepends=True), current[path].splitlines(keepends=True),
            fromfile=f"a/{path}", tofile=f"b/{path}",
        )
    ) for path in sorted(original) if current[path] != original[path])


def file_records(files):
    if not isinstance(files, list) or not 1 <= len(files) <= 10:
        raise ValueError("checkpoint_files_invalid")
    result = {}
    total = 0
    for record in files:
        if not isinstance(record, dict) or set(record) != {"path", "content", "bytes"}:
            raise ValueError("checkpoint_file_invalid")
        path, content, size = record["path"], record["content"], record["bytes"]
        if (
            not isinstance(path, str) or not path or path in result
            or str(PurePosixPath(path)) != path or "\\" in path
            or path.startswith("/") or any(part.startswith(".") for part in path.split("/"))
            or any(ord(char) < 32 for char in path)
            or not isinstance(content, str) or "\0" in content or type(size) is not int
        ):
            raise ValueError("checkpoint_file_invalid")
        raw = content.encode("utf-8")
        total += len(raw)
        if not 0 <= size <= 32768 or size != len(raw) or total > 65536:
            raise ValueError("checkpoint_file_size_invalid")
        result[path] = content
    return result


def checkpoint_content(run, round_number, files):
    candidate = run["context"]["coding"]
    origin = candidate["snapshot"].get("origin_files", candidate["snapshot"]["files"])
    return {
        "schema_version": 1, "task_id": run["task_id"], "run_id": run["id"],
        "candidate_hash": candidate["candidate_hash"], "round": round_number,
        "origin_hash": fingerprint(origin),
        "files": [{"path": path, "content": content, "bytes": len(content.encode("utf-8"))}
                  for path, content in files.items()],
    }


def checkpoint_value(row):
    value = json.loads(row["content"])
    if (
        not isinstance(value, dict) or set(value) != {
            "schema_version", "task_id", "run_id", "candidate_hash", "round", "origin_hash", "files",
        } or value["schema_version"] != 1 or type(value["schema_version"]) is not int
        or value["task_id"] != row["task_id"] or value["run_id"] != row["run_id"]
        or type(value["round"]) is not int or not 1 <= value["round"] <= 3
    ):
        raise ValueError("checkpoint_identity_invalid")
    file_records(value["files"])
    return value


def read_checkpoint_source(db, task_id, reference):
    row = db.execute(
        "SELECT a.id,a.run_id,a.title,a.kind,a.created_at,r.task_id,r.context,"
        f"CASE WHEN length(CAST(a.content AS BLOB)) BETWEEN 1 AND {MAX_CHECKPOINT_BYTES}"
        " THEN a.content ELSE NULL END AS content"
        " FROM artifacts a JOIN runs r ON r.id=a.run_id"
        f" WHERE a.id=? AND a.kind='code_checkpoint' AND r.task_id=? AND r.status IN {TERMINAL_SQL}",
        (reference.id, task_id),
    ).fetchone()
    if row is None:
        raise CodingError("coding_checkpoint_unavailable", 404)
    if row["content"] is None:
        raise CodingError("coding_checkpoint_invalid", 422)
    record = artifact_record(row)
    if record["sha256"] != reference.sha256:
        raise CodingError("coding_checkpoint_changed")
    try:
        value = checkpoint_value(row)
        context = json.loads(row["context"])
        candidate = context["coding"]
        if (
            context["mode"] != "coding-v1"
            or candidate["snapshot"]["task_id"] != task_id
            or value["candidate_hash"] != candidate["candidate_hash"]
            or fingerprint({k: v for k, v in candidate.items() if k != "candidate_hash"})
               != candidate["candidate_hash"]
        ):
            raise ValueError("checkpoint_source_invalid")
        origin = candidate["snapshot"].get("origin_files", candidate["snapshot"]["files"])
        base = file_records(origin)
        files = file_records(value["files"])
        if (
            value["origin_hash"] != fingerprint(origin)
            or list(files) != list(base)
            or any(files[path] != base[path] and path not in candidate["config"]["writable"] for path in base)
            or files == base
        ):
            raise ValueError("checkpoint_scope_invalid")
    except (KeyError, ValueError, TypeError, UnicodeError) as error:
        raise CodingError("coding_checkpoint_invalid", 422) from error
    return value, record, origin


def read_checkpoint(db, task_id, reference):
    value, record, _ = read_checkpoint_source(db, task_id, reference)
    return value, record


def checkpoint_page(db, task_id, page):
    predicate = f"r.task_id=? AND a.kind='code_checkpoint' AND r.status IN {TERMINAL_SQL}"
    total = db.execute(
        f"SELECT COUNT(*) FROM artifacts a JOIN runs r ON r.id=a.run_id WHERE {predicate}",
        (task_id,),
    ).fetchone()[0]
    pages = max(1, (total + 19) // 20)
    current = min(page, pages)
    rows = db.execute(
        "SELECT a.id,a.run_id,a.title,a.kind,a.created_at,r.task_id,r.status AS source_status,"
        "length(CAST(a.content AS BLOB)) AS bytes,"
        f"CASE WHEN length(CAST(a.content AS BLOB)) BETWEEN 1 AND {MAX_CHECKPOINT_BYTES}"
        " THEN a.content ELSE NULL END AS content"
        f" FROM artifacts a JOIN runs r ON r.id=a.run_id WHERE {predicate}"
        " ORDER BY a.created_at DESC,a.id ASC LIMIT 20 OFFSET ?",
        (task_id, (current - 1) * 20),
    ).fetchall()
    items = []
    for row in rows:
        sha = round_number = None
        if row["content"] is not None:
            try:
                value = checkpoint_value(row)
                sha, round_number = artifact_record(row)["sha256"], value["round"]
            except (ValueError, TypeError, UnicodeError):
                pass
        items.append({key: row[key] for key in (
            "id", "run_id", "task_id", "title", "created_at", "source_status", "bytes",
        )} | {"sha256": sha, "round": round_number})
    return {
        "schema_version": 1, "task_id": task_id, "unit": "coding_checkpoints", "items": items,
        "total": total, "requested_page": page, "page": current, "page_size": 20,
        "total_pages": pages, "has_more": current < pages, "order": "checkpoints-created-v1",
    }
