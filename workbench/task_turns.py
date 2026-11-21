"""Persistent Task messages and exact, explicitly executed Run candidates."""

from __future__ import annotations

from contextlib import closing, contextmanager
import hashlib
import json
from pathlib import Path
import re
import sqlite3

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .context import snapshot
from .provider import key_available
from .store import Store, decode, dump, now, uid
from .task_query import MAX_PAGE


TURN_ORDER = "turns-created-v1"
MODEL_FIELDS = ("coordinator_model", "researcher_model", "reviewer_model")
EXECUTION_MODEL_FIELDS = ("id", "kind", "endpoint", "model", "key_env", "workspace")


class TaskTurnError(Exception):
    def __init__(self, code: str, status: int = 409):
        self.code, self.status = code, status
        super().__init__(code)


def identifier(value: str) -> str:
    if not isinstance(value, str) or not 1 <= len(value) <= 100 or value.strip() != value:
        raise TaskTurnError("task_turn_identifier_invalid", 422)
    try:
        value.encode("utf-8")
    except UnicodeError as error:
        raise TaskTurnError("task_turn_identifier_invalid", 422) from error
    return value


class TurnInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class TaskTurnCreate(TurnInput):
    request_id: str = Field(min_length=8, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    content: str = Field(min_length=1, max_length=8000)

    @field_validator("content")
    @classmethod
    def message_content(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("task_turn_content_empty")
        value.encode("utf-8")
        return value


class TaskTurnPrepare(TurnInput):
    coordinator_model: str = Field(min_length=1, max_length=100)
    researcher_model: str = Field(min_length=1, max_length=100)
    reviewer_model: str = Field(min_length=1, max_length=100)
    max_calls: int = Field(default=4, ge=3, le=8)
    parallel: int = Field(default=2, ge=1, le=2)
    minutes: int = Field(default=10, ge=1, le=30)
    max_output_tokens: int = Field(default=1800, ge=256, le=4096)
    context_hash: str = Field(pattern=r"^[0-9a-f]{64}$")

    @field_validator(*MODEL_FIELDS)
    @classmethod
    def exact_model(cls, value):
        return identifier(value)


class TaskTurnExecute(TurnInput):
    candidate_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    consent: bool = False


def public_turn(row) -> dict:
    value = dict(row)
    candidate = json.loads(value["candidate"]) if value["candidate"] is not None else None
    return {
        key: value[key]
        for key in ("id", "task_id", "request_id", "content", "created_at", "state", "run_id")
    } | {
        "candidate": (
            {key: candidate[key] for key in ("candidate_hash", "config", "snapshot")}
            if candidate is not None else None
        ),
    }


class TaskTurnService:
    def __init__(self, store: Store, workspace: Path):
        self.store, self.workspace = store, workspace

    @contextmanager
    def reader(self):
        with closing(sqlite3.connect(
            self.store.path.resolve().as_uri() + "?mode=ro", uri=True, timeout=10,
        )) as db:
            db.row_factory = sqlite3.Row
            db.execute("PRAGMA query_only=ON")
            db.execute("BEGIN")
            yield db

    @staticmethod
    def task(db, task_id):
        identifier(task_id)
        task = decode(db.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone())
        if task is None:
            raise TaskTurnError("task_turn_task_unavailable", 404)
        return task

    @classmethod
    def turn(cls, db, task_id, turn_id):
        cls.task(db, task_id)
        identifier(turn_id)
        row = db.execute(
            "SELECT * FROM task_turns WHERE id=? AND task_id=?", (turn_id, task_id),
        ).fetchone()
        if row is None:
            raise TaskTurnError("task_turn_unavailable", 404)
        return row

    def list(self, task_id, page=1):
        if type(page) is not int or not 1 <= page <= MAX_PAGE:
            raise TaskTurnError("task_turn_page_invalid", 422)
        with self.reader() as db:
            self.task(db, task_id)
            total = db.execute(
                "SELECT COUNT(*) FROM task_turns WHERE task_id=?", (task_id,),
            ).fetchone()[0]
            total_pages = max(1, (total + 19) // 20)
            current = min(page, total_pages)
            items = [public_turn(row) for row in db.execute(
                "SELECT * FROM task_turns WHERE task_id=?"
                " ORDER BY created_at DESC,rowid ASC LIMIT 20 OFFSET ?",
                (task_id, (current - 1) * 20),
            )]
            prepared = db.execute(
                "SELECT * FROM task_turns WHERE task_id=? AND state='prepared'", (task_id,),
            ).fetchone()
        return {
            "schema_version": 1, "unit": "task_turns", "task_id": task_id,
            "items": items, "prepared": public_turn(prepared) if prepared is not None else None,
            "total": total, "requested_page": page, "page": current, "page_size": 20,
            "total_pages": total_pages, "has_more": current < total_pages, "order": TURN_ORDER,
        }

    def read(self, task_id, turn_id):
        with self.reader() as db:
            return public_turn(self.turn(db, task_id, turn_id))

    def by_request(self, task_id, request_id):
        if not re.fullmatch(r"[A-Za-z0-9_-]{8,100}", request_id):
            raise TaskTurnError("task_turn_request_invalid", 422)
        with self.reader() as db:
            self.task(db, task_id)
            row = db.execute(
                "SELECT * FROM task_turns WHERE task_id=? AND request_id=?", (task_id, request_id),
            ).fetchone()
            if row is None:
                raise TaskTurnError("task_turn_request_unavailable", 404)
            return public_turn(row)

    def save(self, task_id, body: TaskTurnCreate):
        body = TaskTurnCreate.model_validate(body.model_dump())
        with self.store.transaction() as db:
            self.task(db, task_id)
            existing = db.execute(
                "SELECT * FROM task_turns WHERE request_id=?", (body.request_id,),
            ).fetchone()
            if existing is not None:
                if existing["task_id"] != task_id or existing["content"] != body.content:
                    raise TaskTurnError("task_turn_request_conflict")
                return public_turn(existing)
            if db.execute("SELECT 1 FROM runs WHERE request_id=?", (body.request_id,)).fetchone() or db.execute(
                "SELECT 1 FROM recovery_intents WHERE request_id=?", (body.request_id,),
            ).fetchone():
                raise TaskTurnError("task_turn_request_conflict")
            turn_id = uid()
            db.execute(
                "INSERT INTO task_turns(id,task_id,request_id,content,created_at,state)"
                " VALUES(?,?,?,?,?,'saved')",
                (turn_id, task_id, body.request_id, body.content, now()),
            )
            self.store.event(db, "task.turn.saved", {
                "task_id": task_id, "turn_id": turn_id, "request_id": body.request_id,
                "execution_authorized": False,
            }, entity_id=turn_id, actor="user")
            return public_turn(self.turn(db, task_id, turn_id))

    def snapshot(self, db, row):
        task = self.task(db, row["task_id"])
        project = decode(db.execute(
            "SELECT * FROM projects WHERE id=?", (task["project_id"],),
        ).fetchone())
        if project is None:
            raise TaskTurnError("task_turn_project_unavailable", 404)
        text, evidence = snapshot(self.workspace, project, task["files"])
        supplement = {"id": row["id"], "content": row["content"]}
        content = [
            task["id"], task["project_id"], task["goal"], task["acceptance"], task["files"],
            project["notes"], text, evidence, supplement,
        ]
        context_hash = hashlib.sha256(
            json.dumps(content, ensure_ascii=False, separators=(",", ":")).encode(),
        ).hexdigest()
        return {
            "goal": f"{task['goal']}\n\n补充要求（仅本条消息）：\n{row['content']}",
            "acceptance": task["acceptance"], "notes": project["notes"],
            "text": text, "evidence": evidence, "bytes": len(text.encode()),
            "context_hash": context_hash, "access": "read_only", "tools": [],
            "supplement": supplement,
        }

    def preview(self, task_id, turn_id):
        with self.reader() as db:
            row = self.turn(db, task_id, turn_id)
            if row["candidate"] is not None:
                return json.loads(row["candidate"])["snapshot"]
            return self.snapshot(db, row)

    @staticmethod
    def require_ready(db, task_id, own_turn_id=None):
        prepared = db.execute(
            "SELECT id FROM task_turns WHERE task_id=? AND state='prepared'", (task_id,),
        ).fetchone()
        if prepared is not None and prepared["id"] != own_turn_id:
            raise TaskTurnError("task_turn_prepared_pending")
        if db.execute(
            "SELECT 1 FROM recovery_intents i JOIN runs r ON r.id=i.source_run_id"
            " WHERE r.task_id=? AND i.state IN ('prepared','applying','unknown') LIMIT 1",
            (task_id,),
        ).fetchone():
            raise TaskTurnError("task_turn_recovery_pending")
        if db.execute(
            "SELECT 1 FROM runs WHERE task_id=? AND status NOT IN ('succeeded','failed','canceled')"
            " AND NOT EXISTS(SELECT 1 FROM runs child WHERE child.source_run_id=runs.id) LIMIT 1",
            (task_id,),
        ).fetchone():
            raise TaskTurnError("task_turn_run_unfinished")

    def models(self, db, config):
        models = {}
        for field in MODEL_FIELDS:
            model = decode(db.execute(
                "SELECT * FROM models WHERE id=?", (config[field],),
            ).fetchone())
            if model is None:
                raise TaskTurnError("task_turn_model_unavailable", 422)
            if not key_available(model) and model.get("kind") != "codex_cli":
                raise TaskTurnError("task_turn_model_key_unavailable", 422)
            if model.get("kind") == "codex_cli":
                model = {**model, "workspace": str(self.workspace)}
            models[model["id"]] = model
        return models

    def prepare(self, task_id, turn_id, body: TaskTurnPrepare):
        body = TaskTurnPrepare.model_validate(body.model_dump())
        config = body.model_dump(exclude={"context_hash"})
        with self.store.transaction() as db:
            row = self.turn(db, task_id, turn_id)
            if row["candidate"] is not None:
                candidate = json.loads(row["candidate"])
                if candidate["config"] != config or candidate["snapshot"]["context_hash"] != body.context_hash:
                    raise TaskTurnError("task_turn_candidate_conflict")
                return public_turn(row)
            self.require_ready(db, task_id, turn_id)
            selected = self.snapshot(db, row)
            if selected["context_hash"] != body.context_hash:
                raise TaskTurnError("task_turn_context_changed")
            models = self.models(db, config)
            candidate_hash = hashlib.sha256(json.dumps(
                [task_id, turn_id, config, selected], sort_keys=True,
                ensure_ascii=False, separators=(",", ":"),
            ).encode()).hexdigest()
            candidate = {
                "candidate_hash": candidate_hash, "config": config, "snapshot": selected,
                "context": {
                    "goal": selected["goal"], "acceptance": selected["acceptance"],
                    "notes": selected["notes"], "text": selected["text"],
                    "evidence": selected["evidence"], "models": models,
                    "hash": selected["context_hash"], "supplement": selected["supplement"],
                },
            }
            db.execute(
                "UPDATE task_turns SET state='prepared',candidate=? WHERE id=? AND state='saved'",
                (dump(candidate), turn_id),
            )
            self.store.event(db, "task.turn.prepared", {
                "task_id": task_id, "turn_id": turn_id, "candidate_hash": candidate_hash,
                "execution_authorized": False,
            }, entity_id=turn_id, actor="user")
            return public_turn(self.turn(db, task_id, turn_id))

    def execute(self, task_id, turn_id, body: TaskTurnExecute):
        body = TaskTurnExecute.model_validate(body.model_dump())
        if not body.consent:
            raise TaskTurnError("task_turn_consent_required", 422)
        with self.store.transaction() as db:
            row = self.turn(db, task_id, turn_id)
            candidate = json.loads(row["candidate"]) if row["candidate"] is not None else None
            if candidate is None:
                raise TaskTurnError("task_turn_not_prepared")
            if candidate["candidate_hash"] != body.candidate_hash:
                raise TaskTurnError("task_turn_candidate_conflict")
            if row["state"] == "applied":
                linked = db.execute(
                    "SELECT id,task_id,request_id FROM runs WHERE id=?", (row["run_id"],),
                ).fetchone()
                if linked is None or linked["task_id"] != task_id or linked["request_id"] != row["request_id"]:
                    raise TaskTurnError("task_turn_receipt_inconsistent")
                return public_turn(row)
            if row["state"] != "prepared":
                raise TaskTurnError("task_turn_not_prepared")
            self.require_ready(db, task_id, turn_id)
            current_models = self.models(db, candidate["config"])
            if any(
                {key: model.get(key) for key in EXECUTION_MODEL_FIELDS}
                != {
                    key: candidate["context"]["models"][model_id].get(key)
                    for key in EXECUTION_MODEL_FIELDS
                }
                for model_id, model in current_models.items()
            ):
                raise TaskTurnError("task_turn_model_changed")
            if db.execute("SELECT 1 FROM runs WHERE request_id=?", (row["request_id"],)).fetchone():
                raise TaskTurnError("task_turn_request_conflict")
            run_id = uid()
            db.execute(
                "INSERT INTO runs(id,task_id,request_id,status,config,context,created_at)"
                " VALUES(?,?,?,'queued',?,?,?)",
                (run_id, task_id, row["request_id"], dump(candidate["config"]),
                 dump(candidate["context"]), now()),
            )
            db.execute(
                "UPDATE task_turns SET state='applied',run_id=? WHERE id=? AND state='prepared'",
                (run_id, turn_id),
            )
            self.store.event(db, "run.queued", {
                "context_files": candidate["context"]["evidence"], "access": "read_only",
                "model_ids": candidate["config"], "consent": True, "turn_id": turn_id,
            }, run_id, actor="user")
            self.store.event(db, "task.turn.applied", {
                "task_id": task_id, "turn_id": turn_id, "run_id": run_id,
                "candidate_hash": body.candidate_hash, "execution_success": False,
            }, run_id, entity_id=turn_id, actor="user")
            return public_turn(self.turn(db, task_id, turn_id))
