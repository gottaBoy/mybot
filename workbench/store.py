from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .backend import BackendError
from .recovery import fingerprint, retry_preview
from .recovery_intent import (
    public_recovery_intent, recovery_candidate, safe_recovery_rejection,
)
from .saved_views import (
    SavedViewCreate, SavedViewError, SavedViewUpdate, public_saved_view,
    require_identifier, require_scope, saved_view_delete_receipt,
)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def uid() -> str:
    return uuid.uuid4().hex


def dump(value) -> str:
    return json.dumps(value, ensure_ascii=False)


JSON_FIELDS = {"files", "config", "context", "plan", "payload", "error_detail", "settings"}
TERMINAL = {"succeeded", "failed", "canceled"}
ACTIVE = {"queued", "running", "pause_requested", "cancel_requested", "paused", "interrupted"}


def decode(row) -> dict | None:
    if row is None:
        return None
    value = dict(row)
    for key in JSON_FIELDS & value.keys():
        value[key] = json.loads(value[key])
    return value


SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, goal TEXT NOT NULL,
 directory TEXT NOT NULL, notes TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS models (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, endpoint TEXT NOT NULL,
 model TEXT NOT NULL, key_env TEXT NOT NULL, tested_at TEXT, test_status TEXT,
 kind TEXT NOT NULL DEFAULT 'chat_completions',
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS model_tests (
 request_id TEXT PRIMARY KEY, model_id TEXT NOT NULL REFERENCES models(id),
 candidate_hash TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('running','succeeded','failed','unknown')),
 status TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER,
 started_at TEXT NOT NULL, ended_at TEXT
);
CREATE INDEX IF NOT EXISTS model_tests_model ON model_tests(model_id);
CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
 title TEXT NOT NULL, goal TEXT NOT NULL, acceptance TEXT NOT NULL,
 files TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_project_created ON tasks(project_id,created_at DESC);
CREATE TABLE IF NOT EXISTS runs (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id),
 request_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL, config TEXT NOT NULL,
 context TEXT NOT NULL, plan TEXT NOT NULL DEFAULT '[]',
 source_run_id TEXT REFERENCES runs(id),
 error TEXT, started_at TEXT, ended_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_task_created ON runs(task_id,created_at DESC);
CREATE TABLE IF NOT EXISTS recovery_intents (
 request_id TEXT PRIMARY KEY, source_run_id TEXT NOT NULL REFERENCES runs(id),
 mode TEXT NOT NULL CHECK(mode IN ('retry','resume')),
 input_hash TEXT NOT NULL, snapshot_hash TEXT NOT NULL, candidate_hash TEXT NOT NULL,
 config TEXT NOT NULL, requires_acknowledgement INTEGER NOT NULL,
 replay_acknowledged INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL CHECK(state IN ('prepared','applying','applied','rejected','unknown','abandoned')),
 target_run_id TEXT REFERENCES runs(id), error_code TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, settled_at TEXT
);
CREATE INDEX IF NOT EXISTS recovery_intents_source ON recovery_intents(source_run_id);
CREATE UNIQUE INDEX IF NOT EXISTS recovery_intents_unresolved ON recovery_intents(source_run_id)
 WHERE state IN ('prepared','applying','unknown');
CREATE TABLE IF NOT EXISTS agents (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), parent_id TEXT,
 step_key TEXT NOT NULL, role TEXT NOT NULL, title TEXT NOT NULL,
 objective TEXT NOT NULL, model_id TEXT NOT NULL, status TEXT NOT NULL,
 output TEXT, started_at TEXT, ended_at TEXT,
 source_agent_id TEXT REFERENCES agents(id),
 UNIQUE(run_id,step_key)
);
CREATE TABLE IF NOT EXISTS calls (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
 agent_id TEXT REFERENCES agents(id), model_id TEXT NOT NULL,
 attempt INTEGER NOT NULL, status TEXT NOT NULL, requested_model TEXT NOT NULL,
 returned_model TEXT, input_tokens INTEGER, output_tokens INTEGER,
 duration_ms INTEGER, error TEXT, error_detail TEXT NOT NULL DEFAULT '{}',
 started_at TEXT NOT NULL, ended_at TEXT
);
CREATE TABLE IF NOT EXISTS artifacts (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
 agent_id TEXT REFERENCES agents(id), title TEXT NOT NULL, kind TEXT NOT NULL,
 content TEXT NOT NULL, decision TEXT NOT NULL DEFAULT 'pending',
 source_artifact_id TEXT REFERENCES artifacts(id),
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
 run_id TEXT REFERENCES runs(id), entity_id TEXT, kind TEXT NOT NULL,
 actor TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_run_seq ON events(run_id,seq);
CREATE INDEX IF NOT EXISTS calls_run ON calls(run_id);
CREATE INDEX IF NOT EXISTS agents_run ON agents(run_id);
CREATE TABLE IF NOT EXISTS workspace_settings (
 key TEXT PRIMARY KEY, value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS saved_views (
 id TEXT PRIMARY KEY, name TEXT,
 scope_type TEXT NOT NULL CHECK(scope_type IN ('workspace','project')),
 project_id TEXT REFERENCES projects(id), definition TEXT,
 revision INTEGER NOT NULL CHECK(revision >= 1), create_hash TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 deleted_at TEXT, delete_expected_revision INTEGER,
 CHECK((scope_type='workspace' AND project_id IS NULL) OR
       (scope_type='project' AND project_id IS NOT NULL)),
 CHECK((deleted_at IS NULL AND name IS NOT NULL AND definition IS NOT NULL
        AND delete_expected_revision IS NULL) OR
       (deleted_at IS NOT NULL AND name IS NULL AND definition IS NULL
        AND delete_expected_revision IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS saved_views_scope ON saved_views(scope_type,project_id,updated_at);
CREATE TABLE IF NOT EXISTS backend_connections (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
 endpoint TEXT NOT NULL, status TEXT NOT NULL, settings TEXT NOT NULL DEFAULT '{}',
 revoked_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversation_refs (
 id TEXT PRIMARY KEY, connection_id TEXT NOT NULL REFERENCES backend_connections(id),
 external_id TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL,
 cursor TEXT, created_at TEXT NOT NULL,
 UNIQUE(connection_id, external_id)
);
CREATE TABLE IF NOT EXISTS conversation_messages (
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversation_refs(id),
 external_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
 created_at TEXT, synced_at TEXT NOT NULL,
 UNIQUE(conversation_id, external_id)
);
"""


class Store:
    def __init__(self, directory: Path):
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(directory, 0o700)
        self.path = directory / "workbench.sqlite3"
        self.lock = threading.RLock()
        with self.transaction() as db:
            db.executescript(SCHEMA)
            columns = {row["name"] for row in db.execute("PRAGMA table_info(models)").fetchall()}
            if "kind" not in columns:
                db.execute("ALTER TABLE models ADD COLUMN kind TEXT NOT NULL DEFAULT 'chat_completions'")
            call_columns = {row["name"] for row in db.execute("PRAGMA table_info(calls)").fetchall()}
            if "error_detail" not in call_columns:
                db.execute("ALTER TABLE calls ADD COLUMN error_detail TEXT NOT NULL DEFAULT '{}'")
            for table, column, reference in (
                ("runs", "source_run_id", "runs"),
                ("agents", "source_agent_id", "agents"),
                ("artifacts", "source_artifact_id", "artifacts"),
            ):
                names = {row["name"] for row in db.execute(f"PRAGMA table_info({table})")}
                if column not in names:
                    db.execute(f"ALTER TABLE {table} ADD COLUMN {column} TEXT REFERENCES {reference}(id)")
            backend_columns = {row["name"] for row in db.execute("PRAGMA table_info(backend_connections)")}
            for column in ("tested_at", "test_status"):
                if column not in backend_columns:
                    db.execute(f"ALTER TABLE backend_connections ADD COLUMN {column} TEXT")
            ref_columns = {row["name"] for row in db.execute("PRAGMA table_info(conversation_refs)")}
            for column, kind in (("messages_checked_at", "TEXT"), ("messages_has_more", "INTEGER")):
                if column not in ref_columns:
                    db.execute(f"ALTER TABLE conversation_refs ADD COLUMN {column} {kind}")
        os.chmod(self.path, 0o600)

    @contextmanager
    def transaction(self):
        with self.lock:
            db = sqlite3.connect(self.path, timeout=10)
            db.row_factory = sqlite3.Row
            db.execute("PRAGMA foreign_keys=ON")
            db.execute("PRAGMA journal_mode=WAL")
            try:
                db.execute("BEGIN IMMEDIATE")
                yield db
                db.commit()
            except BaseException:
                db.rollback()
                raise
            finally:
                db.close()

    @staticmethod
    def event(db, kind: str, payload: dict, run_id=None, entity_id=None, actor="system"):
        db.execute(
            "INSERT INTO events(id,run_id,entity_id,kind,actor,payload,created_at) VALUES(?,?,?,?,?,?,?)",
            (uid(), run_id, entity_id, kind, actor, dump(payload), now()),
        )

    def add(self, table: str, values: dict, kind: str, actor="user") -> dict:
        allowed = {"projects", "models", "tasks"}
        if table not in allowed:
            raise ValueError("Invalid entity")
        values = {"id": uid(), **values, "created_at": now()}
        fields = ",".join(values)
        with self.transaction() as db:
            db.execute(f"INSERT INTO {table}({fields}) VALUES({','.join('?' for _ in values)})",
                       tuple(dump(v) if isinstance(v, (dict, list)) else v for v in values.values()))
            self.event(db, kind, {"name": values.get("name", values.get("title", ""))},
                       entity_id=values["id"], actor=actor)
        return values

    def get(self, table: str, entity_id: str) -> dict:
        if table not in {"projects", "models", "tasks", "runs", "agents", "artifacts", "calls",
                         "backend_connections", "conversation_refs", "conversation_messages"}:
            raise ValueError("Invalid entity")
        with self.transaction() as db:
            row = decode(db.execute(f"SELECT * FROM {table} WHERE id=?", (entity_id,)).fetchone())
        if row is None:
            raise KeyError(entity_id)
        return row

    def get_setting(self, key: str, default=None):
        with self.transaction() as db:
            row = db.execute("SELECT value FROM workspace_settings WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default

    @staticmethod
    def _saved_view_row(db, identifier):
        row = db.execute("SELECT * FROM saved_views WHERE id=?", (identifier,)).fetchone()
        if row is None:
            raise SavedViewError("saved_view_not_found", 404)
        return dict(row)

    @staticmethod
    def _saved_view_projects(db, scope_type, project_id, definition):
        require_scope(scope_type, project_id, definition)
        identifiers = set(definition["query"]["projects"])
        if project_id is not None:
            identifiers.add(project_id)
        for identifier in identifiers:
            if db.execute("SELECT 1 FROM projects WHERE id=?", (identifier,)).fetchone() is None:
                raise SavedViewError("saved_view_project_unavailable", 422)

    @staticmethod
    def _saved_view_event(db, kind, record):
        Store.event(db, kind, {
            "view_id": record["id"], "scope_type": record["scope_type"],
            "project_id": record["project_id"], "revision": record["revision"],
        }, entity_id=record["id"], actor="user")

    def create_saved_view(self, values):
        values = SavedViewCreate.model_validate(values).model_dump()
        submitted_hash = fingerprint(values)
        with self.transaction() as db:
            existing = db.execute("SELECT * FROM saved_views WHERE id=?", (values["id"],)).fetchone()
            if existing:
                record = dict(existing)
                if record["deleted_at"] is not None:
                    raise SavedViewError("saved_view_deleted", 409, record["revision"])
                if record["create_hash"] != submitted_hash:
                    raise SavedViewError("saved_view_id_conflict", 409, record["revision"])
                if record["revision"] != 1:
                    raise SavedViewError("saved_view_create_superseded", 409, record["revision"])
                return public_saved_view(record)
            self._saved_view_projects(
                db, values["scope_type"], values["project_id"], values["definition"],
            )
            at = now()
            db.execute(
                "INSERT INTO saved_views(id,name,scope_type,project_id,definition,revision,"
                "create_hash,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?)",
                (values["id"], values["name"], values["scope_type"], values["project_id"],
                 dump(values["definition"]), submitted_hash, at, at),
            )
            record = self._saved_view_row(db, values["id"])
            self._saved_view_event(db, "saved_view.created", record)
            return public_saved_view(record)

    def saved_view(self, identifier):
        require_identifier(identifier)
        with self.transaction() as db:
            record = self._saved_view_row(db, identifier)
            if record["deleted_at"] is not None:
                raise SavedViewError("saved_view_not_found", 404)
            return public_saved_view(record)

    def list_saved_views(self, scope_type=None, project_id=None, offset=0, limit=100):
        if (
            scope_type not in {None, "workspace", "project"} or
            (scope_type == "project" and not project_id) or
            (scope_type != "project" and project_id is not None) or
            type(offset) is not int or not 0 <= offset <= 9007199254740991 or
            type(limit) is not int or not 1 <= limit <= 100
        ):
            raise SavedViewError("saved_view_scope_invalid", 422)
        with self.transaction() as db:
            if project_id is not None and db.execute(
                "SELECT 1 FROM projects WHERE id=?", (project_id,),
            ).fetchone() is None:
                raise SavedViewError("saved_view_project_unavailable", 422)
            where = "deleted_at IS NULL"
            arguments = []
            if scope_type is not None:
                where += " AND scope_type=?"
                arguments.append(scope_type)
            if project_id is not None:
                where += " AND project_id=?"
                arguments.append(project_id)
            total = db.execute(
                f"SELECT COUNT(*) FROM saved_views WHERE {where}", arguments,
            ).fetchone()[0]
            rows = db.execute(
                f"SELECT * FROM saved_views WHERE {where} ORDER BY updated_at DESC,id ASC LIMIT ? OFFSET ?",
                [*arguments, limit, offset],
            ).fetchall()
            items = [public_saved_view(dict(row)) for row in rows]
            return {
                "items": items, "total": total, "limit": limit, "offset": offset,
                "has_more": offset + len(items) < total,
            }

    def update_saved_view(self, identifier, values):
        require_identifier(identifier)
        values = SavedViewUpdate.model_validate(values).model_dump()
        with self.transaction() as db:
            record = self._saved_view_row(db, identifier)
            if record["deleted_at"] is not None:
                raise SavedViewError("saved_view_deleted", 409, record["revision"])
            if record["revision"] != values["expected_revision"]:
                raise SavedViewError("saved_view_revision_conflict", 409, record["revision"])
            self._saved_view_projects(
                db, record["scope_type"], record["project_id"], values["definition"],
            )
            db.execute(
                "UPDATE saved_views SET name=?,definition=?,revision=revision+1,updated_at=? WHERE id=?",
                (values["name"], dump(values["definition"]), now(), identifier),
            )
            updated = self._saved_view_row(db, identifier)
            self._saved_view_event(db, "saved_view.updated", updated)
            return public_saved_view(updated)

    def delete_saved_view(self, identifier, expected_revision):
        require_identifier(identifier)
        if type(expected_revision) is not int or expected_revision < 1:
            raise SavedViewError("saved_view_revision_invalid", 422)
        with self.transaction() as db:
            record = self._saved_view_row(db, identifier)
            if record["deleted_at"] is not None:
                if record["delete_expected_revision"] != expected_revision:
                    raise SavedViewError("saved_view_revision_conflict", 409, record["revision"])
                return saved_view_delete_receipt(record)
            if record["revision"] != expected_revision:
                raise SavedViewError("saved_view_revision_conflict", 409, record["revision"])
            at = now()
            db.execute(
                "UPDATE saved_views SET name=NULL,definition=NULL,revision=revision+1,"
                "updated_at=?,deleted_at=?,delete_expected_revision=? WHERE id=?",
                (at, at, expected_revision, identifier),
            )
            deleted = self._saved_view_row(db, identifier)
            self._saved_view_event(db, "saved_view.deleted", deleted)
            return saved_view_delete_receipt(deleted)

    def set_setting(self, key: str, value: str, actor="user"):
        with self.transaction() as db:
            db.execute(
                "INSERT INTO workspace_settings(key,value) VALUES(?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, value),
            )
            self.event(db, "workspace.setting.updated", {"key": key}, actor=actor)

    @staticmethod
    def _model_test_summary(db, record):
        db.execute(
            "UPDATE models SET tested_at=?,test_status=? WHERE id=? AND ?=("
            "SELECT request_id FROM model_tests WHERE model_id=? ORDER BY rowid DESC LIMIT 1)",
            (record["ended_at"] or record["started_at"], record["status"], record["model_id"],
             record["request_id"], record["model_id"]),
        )

    def claim_model_test(self, model_id: str, request_id: str) -> tuple[dict, bool, dict]:
        with self.transaction() as db:
            model = decode(db.execute("SELECT * FROM models WHERE id=?", (model_id,)).fetchone())
            if model is None:
                raise KeyError(model_id)
            candidate_hash = fingerprint({
                key: model[key] for key in ("kind", "endpoint", "model", "key_env")
            })
            existing = decode(db.execute(
                "SELECT * FROM model_tests WHERE request_id=?", (request_id,),
            ).fetchone())
            if existing:
                if existing["model_id"] != model_id or existing["candidate_hash"] != candidate_hash:
                    raise ValueError("model_test_request_id_conflict")
                return existing, False, model
            db.execute(
                "INSERT INTO model_tests(request_id,model_id,candidate_hash,state,status,started_at) "
                "VALUES(?,?,?,'running','running',?)",
                (request_id, model_id, candidate_hash, now()),
            )
            record = decode(db.execute(
                "SELECT * FROM model_tests WHERE request_id=?", (request_id,),
            ).fetchone())
            self._model_test_summary(db, record)
            self.event(db, "model.test.started", {
                "request_id": request_id, "consent": True,
            }, entity_id=model_id, actor="user")
            return record, True, model

    def model_test(self, model_id: str, request_id: str) -> dict:
        with self.transaction() as db:
            record = decode(db.execute(
                "SELECT * FROM model_tests WHERE request_id=?", (request_id,),
            ).fetchone())
        if record is None:
            raise KeyError(request_id)
        if record["model_id"] != model_id:
            raise ValueError("model_test_request_id_conflict")
        return record

    def latest_model_test(self, model_id: str) -> dict | None:
        with self.transaction() as db:
            return decode(db.execute(
                "SELECT * FROM model_tests WHERE model_id=? ORDER BY rowid DESC LIMIT 1",
                (model_id,),
            ).fetchone())

    def finish_model_test(
        self, model_id: str, request_id: str, state: str, status: str,
        input_tokens=None, output_tokens=None,
    ) -> dict:
        with self.transaction() as db:
            record = decode(db.execute(
                "SELECT * FROM model_tests WHERE request_id=?", (request_id,),
            ).fetchone())
            if record is None:
                raise KeyError(request_id)
            if record["model_id"] != model_id:
                raise ValueError("model_test_request_id_conflict")
            if record["state"] != "running":
                return record
            db.execute(
                "UPDATE model_tests SET state=?,status=?,input_tokens=?,output_tokens=?,ended_at=? "
                "WHERE request_id=? AND state='running'",
                (state, status, input_tokens, output_tokens, now(), request_id),
            )
            record = decode(db.execute(
                "SELECT * FROM model_tests WHERE request_id=?", (request_id,),
            ).fetchone())
            self._model_test_summary(db, record)
            self.event(db, "model.tested", {
                "request_id": request_id, "state": state, "status": status,
                "usage_unknown": input_tokens is None or output_tokens is None,
            }, entity_id=model_id, actor="user")
            return record

    def list(self, table: str, run_id=None) -> list[dict]:
        if table not in {"projects", "models", "tasks", "runs", "agents", "artifacts", "calls",
                         "backend_connections", "conversation_refs", "conversation_messages"}:
            raise ValueError("Invalid entity")
        if table == "conversation_refs" and run_id:
            where = " WHERE connection_id=?"
        elif table == "conversation_messages" and run_id:
            where = " WHERE conversation_id=?"
        else:
            where = " WHERE run_id=?" if run_id else ""
        sort = "started_at" if table == "calls" else "created_at" if table != "agents" else "rowid"
        with self.transaction() as db:
            return [decode(row) for row in db.execute(
                f"SELECT * FROM {table}{where} ORDER BY {sort} DESC",
                (run_id,) if run_id else (),
            ).fetchall()]

    def add_backend(self, values: dict) -> dict:
        values = {
            "id": uid(), "name": values["name"], "kind": values["kind"],
            "endpoint": values.get("endpoint", ""),
            "status": values.get("status", "unconfigured"),
            "settings": values.get("settings", {}),
            "revoked_at": None, "created_at": now(),
        }
        with self.transaction() as db:
            db.execute(
                "INSERT INTO backend_connections(id,name,kind,endpoint,status,settings,revoked_at,created_at) "
                "VALUES(?,?,?,?,?,?,?,?)",
                (values["id"], values["name"], values["kind"], values["endpoint"], values["status"],
                 dump(values["settings"]), values["revoked_at"], values["created_at"]),
            )
            self.event(db, "backend.configured", {
                "kind": values["kind"], "status": values["status"], "read_only": True,
            }, entity_id=values["id"], actor="user")
        return self.get("backend_connections", values["id"])

    def add_conversation_ref(self, values: dict) -> dict:
        values = {"id": uid(), "cursor": None, "created_at": now(), **values}
        with self.transaction() as db:
            db.execute(
                "INSERT INTO conversation_refs(id,connection_id,external_id,title,status,cursor,created_at) "
                "VALUES(?,?,?,?,?,?,?)",
                (values["id"], values["connection_id"], values["external_id"], values["title"],
                 values["status"], values["cursor"], values["created_at"]),
            )
            self.event(db, "conversation.ref.created", {
                "connection_id": values["connection_id"], "external_id": values["external_id"],
                "read_only": True,
            }, entity_id=values["id"])
        return self.get("conversation_refs", values["id"])

    def upsert_conversations(self, connection_id: str, refs: list[dict]) -> list[dict]:
        saved = []
        with self.transaction() as db:
            self._require_readable_backend(db, connection_id)
            for ref in refs:
                existing = db.execute(
                    "SELECT id FROM conversation_refs WHERE connection_id=? AND external_id=?",
                    (connection_id, ref["external_id"]),
                ).fetchone()
                if existing:
                    identifier = existing["id"]
                    db.execute(
                        "UPDATE conversation_refs SET title=?,status=?,cursor=? WHERE id=?",
                        (ref["title"], ref["status"], ref.get("cursor"), identifier),
                    )
                else:
                    identifier = uid()
                    db.execute(
                        "INSERT INTO conversation_refs(id,connection_id,external_id,title,status,cursor,created_at) "
                        "VALUES(?,?,?,?,?,?,?)",
                        (identifier, connection_id, ref["external_id"], ref["title"], ref["status"],
                         ref.get("cursor"), now()),
                    )
                self.event(db, "conversation.ref.synced", {
                    "connection_id": connection_id, "external_id": ref["external_id"],
                    "read_only": True,
                }, entity_id=identifier, actor="user")
                saved.append(identifier)
        return [self.get("conversation_refs", identifier) for identifier in saved]

    def save_recent_messages(self, conversation_id: str, messages: list[dict], has_more: bool) -> int:
        saved = []
        with self.transaction() as db:
            ref = self._conversation_row(db, conversation_id)
            self._require_readable_backend(db, ref["connection_id"])
            synced = now()
            for message in messages:
                existing = db.execute(
                    "SELECT id FROM conversation_messages WHERE conversation_id=? AND external_id=?",
                    (conversation_id, message["external_id"]),
                ).fetchone()
                identifier = existing["id"] if existing else uid()
                if existing:
                    db.execute(
                        "UPDATE conversation_messages SET role=?,content=?,created_at=?,synced_at=? WHERE id=?",
                        (message["role"], message["content"], message.get("created_at"), synced, identifier),
                    )
                else:
                    db.execute(
                        "INSERT INTO conversation_messages(id,conversation_id,external_id,role,content,created_at,synced_at) "
                        "VALUES(?,?,?,?,?,?,?)",
                        (identifier, conversation_id, message["external_id"], message["role"],
                         message["content"], message.get("created_at"), synced),
                    )
                self.event(db, "conversation.message.synced", {
                    "conversation_id": conversation_id, "external_id": message["external_id"],
                    "read_only": True,
                }, entity_id=identifier, actor="user")
                saved.append(identifier)
            exclusion = f" AND id NOT IN ({','.join('?' for _ in saved)})" if saved else ""
            db.execute(f"DELETE FROM conversation_messages WHERE conversation_id=?{exclusion}",
                       (conversation_id, *saved))
            db.execute("UPDATE conversation_refs SET messages_checked_at=?,messages_has_more=? WHERE id=?",
                       (synced, has_more, conversation_id))
        return len(saved)

    @staticmethod
    def _require_readable_backend(db, identifier: str):
        row = db.execute("SELECT status,revoked_at FROM backend_connections WHERE id=?", (identifier,)).fetchone()
        if row is None:
            raise KeyError(identifier)
        if row["status"] == "revoked" or row["revoked_at"]:
            raise BackendError("backend_revoked")

    @staticmethod
    def _conversation_row(db, identifier: str):
        row = db.execute("SELECT * FROM conversation_refs WHERE id=?", (identifier,)).fetchone()
        if row is None:
            raise KeyError(identifier)
        return row

    def cached_conversations(self, identifier: str) -> list[dict]:
        with self.transaction() as db:
            self._require_readable_backend(db, identifier)
            return [decode(row) for row in db.execute(
                "SELECT * FROM conversation_refs WHERE connection_id=? ORDER BY created_at DESC", (identifier,),
            )]

    def cached_recent_messages(self, identifier: str) -> dict:
        with self.transaction() as db:
            ref = self._conversation_row(db, identifier)
            self._require_readable_backend(db, ref["connection_id"])
            messages = [decode(row) for row in db.execute(
                "SELECT * FROM conversation_messages WHERE conversation_id=? "
                "ORDER BY created_at DESC, rowid DESC LIMIT 30", (identifier,),
            )]
            return {
                "messages": list(reversed(messages)), "checked_at": ref["messages_checked_at"],
                "has_more": None if ref["messages_has_more"] is None else bool(ref["messages_has_more"]),
                "read_only": True,
            }

    def record_backend_check(self, identifier: str, status: str) -> dict:
        with self.transaction() as db:
            row = db.execute("SELECT * FROM backend_connections WHERE id=?", (identifier,)).fetchone()
            if row is None:
                raise KeyError(identifier)
            if row["status"] == "revoked" or row["revoked_at"]:
                return decode(row)
            db.execute("UPDATE backend_connections SET tested_at=?,test_status=? WHERE id=?",
                       (now(), status, identifier))
            self.event(db, "backend.health.checked", {
                "status": status, "authentication": "unverified", "read_access_verified": False,
            }, entity_id=identifier, actor="user")
            return decode(db.execute("SELECT * FROM backend_connections WHERE id=?", (identifier,)).fetchone())

    def revoke_backend(self, identifier: str) -> dict:
        with self.transaction() as db:
            row = db.execute("SELECT * FROM backend_connections WHERE id=?", (identifier,)).fetchone()
            if row is None:
                raise KeyError(identifier)
            if row["status"] != "revoked":
                db.execute("UPDATE backend_connections SET status='revoked',revoked_at=? WHERE id=?",
                           (now(), identifier))
                self.event(db, "backend.revoked", {"read_only": True}, entity_id=identifier, actor="user")
            return decode(db.execute("SELECT * FROM backend_connections WHERE id=?", (identifier,)).fetchone())

    def create_run(self, task_id: str, request_id: str, config: dict, context: dict) -> dict:
        with self.transaction() as db:
            existing = decode(db.execute("SELECT * FROM runs WHERE request_id=?", (request_id,)).fetchone())
            if existing:
                if (existing.get("source_run_id") or existing["task_id"] != task_id or existing["config"] != config
                        or existing["context"].get("hash") != context.get("hash")):
                    raise ValueError("Request ID was already used with different input")
                return existing
            active = db.execute(
                "SELECT id FROM runs WHERE task_id=? AND status NOT IN ('succeeded','failed','canceled') "
                "AND NOT EXISTS(SELECT 1 FROM runs child WHERE child.source_run_id=runs.id)",
                (task_id,),
            ).fetchone()
            if active:
                raise ValueError("This task already has an unfinished run")
            identifier = uid()
            db.execute("INSERT INTO runs(id,task_id,request_id,status,config,context,created_at) VALUES(?,?,?,'queued',?,?,?)",
                       (identifier, task_id, request_id, dump(config), dump(context), now()))
            self.event(db, "run.queued", {"context_files": context["evidence"], "access": "read_only",
                                       "model_ids": config, "consent": True}, identifier, actor="user")
        return self.get("runs", identifier)

    @staticmethod
    def _retry_state(db, identifier):
        run = decode(db.execute("SELECT * FROM runs WHERE id=?", (identifier,)).fetchone())
        if run is None:
            raise KeyError(identifier)
        facts = [
            [decode(row) for row in db.execute(f"SELECT * FROM {table} WHERE run_id=?", (identifier,))]
            for table in ("agents", "calls", "artifacts")
        ]
        return run, facts, retry_preview(run, *facts)

    def retry_preview(self, identifier):
        with self.transaction() as db:
            run, _, preview = self._retry_state(db, identifier)
            preview["defaults"] = {
                **run["config"],
                "max_calls": max(1, preview["minimum_calls"]),
                "call_timeout_seconds": run["config"].get("call_timeout_seconds", 120),
            }
            preview["retry_runs"] = [
                dict(row) for row in db.execute(
                    "SELECT id,status,created_at FROM runs WHERE source_run_id=? ORDER BY created_at",
                    (identifier,),
                )
            ]
        return preview

    def retry_children(self, identifier):
        with self.transaction() as db:
            return [dict(row) for row in db.execute(
                "SELECT id,status,created_at FROM runs WHERE source_run_id=? ORDER BY created_at DESC",
                (identifier,),
            )]

    @staticmethod
    def _recovery_intent_row(db, source_id, request_id):
        record = decode(db.execute(
            "SELECT * FROM recovery_intents WHERE request_id=?", (request_id,),
        ).fetchone())
        if record is None:
            raise KeyError(request_id)
        if record["source_run_id"] != source_id:
            raise ValueError("recovery_intent_request_id_conflict")
        return record

    @staticmethod
    def _require_no_recovery_intent(db, source_id, own_request_id=None):
        row = db.execute(
            "SELECT request_id FROM recovery_intents WHERE source_run_id=? "
            "AND state IN ('prepared','applying','unknown')",
            (source_id,),
        ).fetchone()
        if row and row["request_id"] != own_request_id:
            raise ValueError("recovery_intent_pending")

    @staticmethod
    def _recovery_candidate(db, source, facts, preview, mode, config):
        return recovery_candidate(
            source, facts, preview, mode, config,
            lambda identifier: decode(db.execute(
                "SELECT * FROM models WHERE id=?", (identifier,),
            ).fetchone()),
            db.execute(
                "SELECT 1 FROM runs WHERE source_run_id=? LIMIT 1", (source["id"],),
            ).fetchone() is not None,
        )

    def prepare_recovery_intent(self, source_id, request_id, mode, snapshot_hash, config):
        input_hash = fingerprint([source_id, mode, snapshot_hash, config])
        with self.transaction() as db:
            existing = decode(db.execute(
                "SELECT * FROM recovery_intents WHERE request_id=?", (request_id,),
            ).fetchone())
            if existing:
                if existing["source_run_id"] != source_id or existing["input_hash"] != input_hash:
                    raise ValueError("recovery_intent_request_id_conflict")
                return public_recovery_intent(existing)
            self._require_no_recovery_intent(db, source_id)
            if db.execute("SELECT 1 FROM runs WHERE request_id=?", (request_id,)).fetchone():
                raise ValueError("recovery_intent_request_id_conflict")
            source, facts, preview = self._retry_state(db, source_id)
            if snapshot_hash != preview["snapshot_hash"]:
                raise ValueError("recovery_intent_snapshot_changed")
            resources, candidate_hash, _ = self._recovery_candidate(
                db, source, facts, preview, mode, config,
            )
            at = now()
            db.execute(
                "INSERT INTO recovery_intents(request_id,source_run_id,mode,input_hash,"
                "snapshot_hash,candidate_hash,config,requires_acknowledgement,state,created_at,updated_at) "
                "VALUES(?,?,?,?,?,?,?,?,'prepared',?,?)",
                (request_id, source_id, mode, input_hash, snapshot_hash, candidate_hash,
                 dump(resources), int(mode == "retry" and preview["requires_acknowledgement"]), at, at),
            )
            self.event(db, "recovery.intent.prepared", {
                "request_id": request_id, "mode": mode, "candidate_hash": candidate_hash,
                "execution_authorized": False,
            }, source_id, actor="user")
            return public_recovery_intent(self._recovery_intent_row(db, source_id, request_id))

    def recovery_intent(self, source_id, request_id):
        with self.transaction() as db:
            return public_recovery_intent(self._recovery_intent_row(db, source_id, request_id))

    def recovery_intents(self, source_id):
        with self.transaction() as db:
            if db.execute("SELECT 1 FROM runs WHERE id=?", (source_id,)).fetchone() is None:
                raise KeyError(source_id)
            rows = [decode(row) for row in db.execute(
                "SELECT * FROM recovery_intents WHERE source_run_id=? ORDER BY rowid DESC LIMIT 50",
                (source_id,),
            )]
            unresolved = decode(db.execute(
                "SELECT * FROM recovery_intents WHERE source_run_id=? "
                "AND state IN ('prepared','applying','unknown') LIMIT 1", (source_id,),
            ).fetchone())
            total = db.execute(
                "SELECT COUNT(*) FROM recovery_intents WHERE source_run_id=?", (source_id,),
            ).fetchone()[0]
            return {
                "latest": public_recovery_intent(rows[0]) if rows else None,
                "unresolved": public_recovery_intent(unresolved) if unresolved else None,
                "history": [public_recovery_intent(row) for row in rows],
                "total": total, "history_truncated": total > len(rows),
            }

    def abandon_recovery_intent(self, source_id, request_id):
        with self.transaction() as db:
            record = self._recovery_intent_row(db, source_id, request_id)
            if record["state"] == "abandoned":
                return public_recovery_intent(record)
            if record["state"] != "prepared":
                raise ValueError("recovery_intent_not_prepared")
            at = now()
            db.execute(
                "UPDATE recovery_intents SET state='abandoned',updated_at=?,settled_at=? "
                "WHERE request_id=? AND state='prepared'", (at, at, request_id),
            )
            self.event(db, "recovery.intent.abandoned", {
                "request_id": request_id, "execution_authorized": False,
            }, source_id, actor="user")
            return public_recovery_intent(self._recovery_intent_row(db, source_id, request_id))

    def _claim_recovery_execution(self, source_id, request_id, acknowledge):
        with self.transaction() as db:
            record = self._recovery_intent_row(db, source_id, request_id)
            if record["state"] != "prepared":
                return record, False
            if record["requires_acknowledgement"] and not acknowledge:
                raise ValueError("retry_replay_confirmation_required")
            db.execute(
                "UPDATE recovery_intents SET state='applying',replay_acknowledged=?,updated_at=? "
                "WHERE request_id=? AND state='prepared'", (int(acknowledge), now(), request_id),
            )
            self.event(db, "recovery.intent.authorized", {
                "request_id": request_id, "mode": record["mode"], "consent": True,
                "replay_acknowledged": acknowledge,
            }, source_id, actor="user")
            return self._recovery_intent_row(db, source_id, request_id), True

    def _settle_recovery_intent(self, db, record, state, target_run_id=None, error_code=None):
        at = now()
        changed = db.execute(
            "UPDATE recovery_intents SET state=?,target_run_id=?,error_code=?,updated_at=?,settled_at=? "
            "WHERE request_id=? AND state='applying'",
            (state, target_run_id, error_code, at, at, record["request_id"]),
        )
        settled = self._recovery_intent_row(db, record["source_run_id"], record["request_id"])
        if changed.rowcount != 1:
            return public_recovery_intent(settled)
        self.event(db, f"recovery.intent.{state}", {
            "request_id": record["request_id"], "mode": record["mode"],
            "candidate_hash": record["candidate_hash"], "target_run_id": target_run_id,
            "error_code": error_code, "model_execution_success": False,
        }, record["source_run_id"], actor="user")
        return public_recovery_intent(settled)

    def _apply_recovery_intent(self, source_id, request_id, workspace):
        with self.transaction() as db:
            record = self._recovery_intent_row(db, source_id, request_id)
            if record["state"] != "applying":
                return public_recovery_intent(record)
            db.execute("SAVEPOINT recovery_application")
            try:
                source, facts, preview = self._retry_state(db, source_id)
                if record["snapshot_hash"] != preview["snapshot_hash"]:
                    raise ValueError("recovery_intent_snapshot_changed")
                config, candidate_hash, models = self._recovery_candidate(
                    db, source, facts, preview, record["mode"], record["config"],
                )
                if candidate_hash != record["candidate_hash"]:
                    raise ValueError("recovery_intent_candidate_changed")
                if record["mode"] == "retry":
                    models = {
                        identifier: {**model, "workspace": str(workspace)}
                        if model.get("kind") == "codex_cli" else model
                        for identifier, model in models.items()
                    }
                    target = self._create_retry(
                        db, source_id, request_id, config, models, record["snapshot_hash"],
                        bool(record["replay_acknowledged"]), own_intent_id=request_id,
                    )
                else:
                    target = self._control(
                        db, source_id, "resume", False, own_intent_id=request_id,
                    )
            except ValueError as error:
                db.execute("ROLLBACK TO recovery_application")
                db.execute("RELEASE recovery_application")
                return self._settle_recovery_intent(
                    db, record, "rejected", error_code=safe_recovery_rejection(error),
                )
            db.execute("RELEASE recovery_application")
            return self._settle_recovery_intent(db, record, "applied", target["id"])

    def execute_recovery_intent(self, source_id, request_id, acknowledge, workspace):
        record, claimed = self._claim_recovery_execution(source_id, request_id, acknowledge)
        if not claimed:
            return public_recovery_intent(record)
        try:
            return self._apply_recovery_intent(source_id, request_id, workspace)
        except Exception:
            with self.transaction() as db:
                current = self._recovery_intent_row(db, source_id, request_id)
                if current["state"] != "applying":
                    return public_recovery_intent(current)
                return self._settle_recovery_intent(
                    db, current, "unknown", error_code="recovery_intent_execution_outcome_unknown",
                )

    def create_retry(self, identifier, request_id, config, models, snapshot_hash, acknowledge):
        with self.transaction() as db:
            return self._create_retry(
                db, identifier, request_id, config, models, snapshot_hash, acknowledge,
            )

    def _create_retry(
        self, db, identifier, request_id, config, models, snapshot_hash, acknowledge,
        own_intent_id=None,
    ):
        request_hash = fingerprint([identifier, snapshot_hash, config])
        existing = decode(db.execute("SELECT * FROM runs WHERE request_id=?", (request_id,)).fetchone())
        if existing:
            if existing.get("source_run_id") != identifier or existing["context"].get("retry_request_hash") != request_hash:
                raise ValueError("retry_request_id_conflict")
            return existing
        self._require_no_recovery_intent(db, identifier, own_intent_id)
        source, facts, preview = self._retry_state(db, identifier)
        if not preview["allowed"]:
            raise ValueError("retry_source_not_ready")
        if preview["snapshot_hash"] != snapshot_hash:
            raise ValueError("retry_snapshot_changed")
        if preview["requires_acknowledgement"] and not acknowledge:
            raise ValueError("retry_replay_confirmation_required")
        if config["max_calls"] < preview["minimum_calls"]:
            raise ValueError("retry_budget_insufficient")
        active = db.execute(
            "SELECT id FROM runs WHERE task_id=? AND id!=? "
            "AND status NOT IN ('succeeded','failed','canceled') "
            "AND NOT EXISTS(SELECT 1 FROM runs child WHERE child.source_run_id=runs.id)",
            (source["task_id"], identifier),
        ).fetchone()
        if active:
            raise ValueError("retry_other_run_active")
        new_id = uid()
        keep = set(preview["reuse_step_keys"])
        plan = source["plan"] if "plan" in keep else []
        context = {
            **source["context"],
            "models": {**source["context"]["models"], **models},
            "retry_request_hash": request_hash,
        }
        db.execute(
            "INSERT INTO runs(id,task_id,request_id,status,config,context,plan,source_run_id,created_at) "
            "VALUES(?,?,?,'queued',?,?,?,?,?)",
            (new_id, source["task_id"], request_id, dump(config), dump(context), dump(plan), identifier, now()),
        )
        agents, _, artifacts = facts
        reusable = [agent for agent in agents if agent["step_key"] in keep]
        agent_ids = {agent["id"]: uid() for agent in reusable}
        for agent in reusable:
            copied_id = agent_ids[agent["id"]]
            db.execute(
                "INSERT INTO agents(id,run_id,parent_id,step_key,role,title,objective,model_id,status,output,source_agent_id) "
                "VALUES(?,?,?,?,?,?,?,?,'succeeded',?,?)",
                (copied_id, new_id, agent_ids.get(agent["parent_id"]), agent["step_key"], agent["role"],
                 agent["title"], agent["objective"], agent["model_id"], agent["output"], agent["id"]),
            )
            self.event(db, "agent.reused", {
                "source_run_id": identifier, "source_agent_id": agent["id"],
                "step_key": agent["step_key"], "new_model_call": False,
            }, new_id, copied_id)
        for artifact in artifacts:
            if artifact["agent_id"] not in agent_ids:
                continue
            artifact_id = uid()
            db.execute(
                "INSERT INTO artifacts(id,run_id,agent_id,title,kind,content,decision,source_artifact_id,created_at) "
                "VALUES(?,?,?,?,?,?,?,?,?)",
                (artifact_id, new_id, agent_ids[artifact["agent_id"]], artifact["title"], artifact["kind"],
                 artifact["content"], artifact["decision"], artifact["id"], now()),
            )
            self.event(db, "artifact.reused", {
                "source_run_id": identifier, "source_artifact_id": artifact["id"],
            }, new_id, artifact_id)
        self.event(db, "run.retry.created", {
            "source_run_id": identifier, "source_snapshot_hash": snapshot_hash,
            "reused_steps": sorted(keep), "resources": config,
            "new_call_budget": config["max_calls"],
            "source_call_count": preview["source_call_count"],
            "replay_acknowledged": acknowledge, "consent": True,
        }, new_id, actor="user")
        return decode(db.execute("SELECT * FROM runs WHERE id=?", (new_id,)).fetchone())

    def claim(self) -> dict | None:
        with self.transaction() as db:
            row = db.execute("SELECT id FROM runs WHERE status='queued' ORDER BY created_at LIMIT 1").fetchone()
            if not row:
                return None
            db.execute("UPDATE runs SET status='running',started_at=COALESCE(started_at,?),error=NULL WHERE id=?", (now(), row["id"]))
            self.event(db, "run.started", {}, row["id"])
        return self.get("runs", row["id"])

    def plan(self, run_id: str, items: list[dict]):
        with self.transaction() as db:
            db.execute("UPDATE runs SET plan=? WHERE id=?", (dump(items), run_id))
            self.event(db, "plan.created", {"version": 1, "tasks": items}, run_id)

    def adjust_plan(self, run_id: str, items: list[dict], reason: str):
        with self.transaction() as db:
            db.execute("UPDATE runs SET plan=? WHERE id=?", (dump(items), run_id))
            self.event(db, "plan.adjusted", {
                "version": 1, "tasks": items, "reason": reason,
            }, run_id)

    def agent(self, run_id: str, key: str, role: str, title: str, objective: str,
              model_id: str, parent=None) -> dict:
        with self.transaction() as db:
            row = db.execute("SELECT * FROM agents WHERE run_id=? AND step_key=?", (run_id, key)).fetchone()
            if row:
                return decode(row)
            identifier = uid()
            db.execute("INSERT INTO agents(id,run_id,parent_id,step_key,role,title,objective,model_id,status) VALUES(?,?,?,?,?,?,?,?,'pending')",
                       (identifier, run_id, parent, key, role, title, objective, model_id))
            self.event(db, "agent.assigned", {"role": role, "title": title, "model_id": model_id,
                                             "parent_id": parent, "step_key": key}, run_id, identifier)
        return self.get("agents", identifier)

    def agent_status(self, identifier: str, status: str, output=None):
        with self.transaction() as db:
            row = db.execute("SELECT * FROM agents WHERE id=?", (identifier,)).fetchone()
            if status == "running":
                db.execute("UPDATE agents SET status=?,started_at=?,ended_at=NULL WHERE id=?", (status, now(), identifier))
            else:
                db.execute("UPDATE agents SET status=?,output=COALESCE(?,output),ended_at=? WHERE id=?",
                           (status, output, now(), identifier))
            self.event(db, f"agent.{status}", {"role": row["role"]}, row["run_id"], identifier)

    def start_call(self, run_id: str, agent: dict, model: dict) -> str:
        with self.transaction() as db:
            run = decode(db.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone())
            if run["status"] == "cancel_requested":
                raise ValueError("Cancellation requested")
            used = db.execute("SELECT count(*) FROM calls WHERE run_id=?", (run_id,)).fetchone()[0]
            if used >= run["config"]["max_calls"]:
                raise ValueError("Model call budget exhausted")
            attempt = db.execute("SELECT count(*) FROM calls WHERE agent_id=?", (agent["id"],)).fetchone()[0] + 1
            identifier = uid()
            db.execute("INSERT INTO calls(id,run_id,agent_id,model_id,attempt,status,requested_model,started_at) VALUES(?,?,?,?,?,'running',?,?)",
                       (identifier, run_id, agent["id"], model["id"], attempt, model["model"], now()))
            self.event(db, "model.started", {"model": model["model"], "attempt": attempt,
                                           "agent_id": agent["id"]}, run_id, identifier)
        return identifier

    def finish_call(self, identifier: str, status: str, *, result=None, duration=0,
                    error=None, error_detail=None):
        with self.transaction() as db:
            row = db.execute("SELECT * FROM calls WHERE id=?", (identifier,)).fetchone()
            db.execute("UPDATE calls SET status=?,returned_model=?,input_tokens=?,output_tokens=?,duration_ms=?,error=?,ended_at=? WHERE id=?",
                       (status, result.get("model") if result else None,
                        result.get("input_tokens") if result else None,
                        result.get("output_tokens") if result else None,
                        duration, error, now(), identifier))
            db.execute("UPDATE calls SET error_detail=? WHERE id=?",
                       (dump(error_detail or {}), identifier))
            self.event(db, f"model.{status}", {
                "duration_ms": duration, "error": error,
                "error_detail": error_detail or {},
                "agent_id": row["agent_id"],
            }, row["run_id"], identifier)

    def artifact(self, run_id: str, agent_id: str, title: str, kind: str, content: str):
        with self.transaction() as db:
            identifier = uid()
            db.execute("INSERT INTO artifacts(id,run_id,agent_id,title,kind,content,created_at) VALUES(?,?,?,?,?,?,?)",
                       (identifier, run_id, agent_id, title, kind, content, now()))
            self.event(db, "artifact.created", {"title": title, "kind": kind}, run_id, identifier)
        return identifier

    def finish_run(self, identifier: str, status: str, error=None):
        with self.transaction() as db:
            current = db.execute("SELECT status FROM runs WHERE id=?", (identifier,)).fetchone()
            if current["status"] == "cancel_requested":
                status = "canceled"
            db.execute("UPDATE runs SET status=?,error=?,ended_at=? WHERE id=?",
                       (status, error, now() if status in TERMINAL else None, identifier))
            db.execute("UPDATE agents SET status=?,ended_at=? WHERE run_id=? AND status='running'",
                       ("interrupted" if status == "interrupted" else status, now(), identifier))
            self.event(db, f"run.{status}", {"error": error}, identifier)

    def control(self, identifier: str, action: str, acknowledge=False) -> dict:
        with self.transaction() as db:
            return self._control(db, identifier, action, acknowledge)

    def _control(self, db, identifier: str, action: str, acknowledge=False, own_intent_id=None) -> dict:
        row = db.execute("SELECT * FROM runs WHERE id=?", (identifier,)).fetchone()
        if not row:
            raise KeyError(identifier)
        if action == "resume":
            self._require_no_recovery_intent(db, identifier, own_intent_id)
        src = row["status"]
        if action == "pause" and src in {"queued", "running"}:
            dst = "paused" if src == "queued" else "pause_requested"
        elif action == "cancel" and src in ACTIVE | {"failed"}:
            dst = "cancel_requested" if src in {"running", "pause_requested", "cancel_requested"} else "canceled"
        elif action == "resume" and src in {"paused", "interrupted", "failed"}:
            if db.execute("SELECT 1 FROM runs WHERE source_run_id=? LIMIT 1", (identifier,)).fetchone():
                raise ValueError("retry_source_has_child")
            if db.execute(
                "SELECT 1 FROM runs WHERE task_id=? AND id!=? "
                "AND status NOT IN ('succeeded','failed','canceled') "
                "AND NOT EXISTS(SELECT 1 FROM runs child WHERE child.source_run_id=runs.id)",
                (row["task_id"], identifier),
            ).fetchone():
                raise ValueError("retry_other_run_active")
            if src in {"interrupted", "failed"} and not acknowledge:
                raise ValueError("Confirm that incomplete read-only model calls may run and incur costs again")
            if src == "failed":
                retries = db.execute(
                    "SELECT COALESCE(MAX(attempt), 0) FROM calls WHERE run_id=? AND status IN ('failed','canceled','interrupted')",
                    (identifier,),
                ).fetchone()[0]
                if retries >= 2:
                    raise ValueError("Retry limit reached for this run; create a new run or choose another adapter")
            dst = "queued"
        elif (action == "cancel" and src == "canceled") or (action == "pause" and src in {"paused", "pause_requested"}):
            return decode(db.execute("SELECT * FROM runs WHERE id=?", (identifier,)).fetchone())
        else:
            raise ValueError(f"Cannot {action} run in state {src}")
        db.execute("UPDATE runs SET status=?,error=NULL,ended_at=? WHERE id=?",
                   (dst, now() if dst == "canceled" else None, identifier))
        self.event(db, f"control.{action}", {"from": src, "to": dst, "replay_acknowledged": acknowledge},
                   identifier, actor="user")
        return decode(db.execute("SELECT * FROM runs WHERE id=?", (identifier,)).fetchone())

    def recover(self):
        with self.transaction() as db:
            intents = db.execute("SELECT * FROM recovery_intents WHERE state='applying'").fetchall()
            for row in intents:
                self._settle_recovery_intent(
                    db, decode(row), "unknown", error_code="recovery_intent_interrupted_outcome_unknown",
                )
            tests = db.execute("SELECT * FROM model_tests WHERE state='running'").fetchall()
            for row in tests:
                db.execute(
                    "UPDATE model_tests SET state='unknown',status=?,ended_at=? WHERE request_id=?",
                    ("model_test_interrupted_outcome_unknown", now(), row["request_id"]),
                )
                record = decode(db.execute(
                    "SELECT * FROM model_tests WHERE request_id=?", (row["request_id"],),
                ).fetchone())
                self._model_test_summary(db, record)
                self.event(db, "model.test.recovered", {
                    "request_id": row["request_id"], "state": "unknown",
                    "status": "model_test_interrupted_outcome_unknown",
                    "usage_unknown": True, "automatic_replay": False,
                }, entity_id=row["model_id"])
            rows = db.execute("SELECT id,status FROM runs WHERE status IN ('running','pause_requested','cancel_requested')").fetchall()
            for row in rows:
                dst = "canceled" if row["status"] == "cancel_requested" else "interrupted"
                db.execute("UPDATE runs SET status=?,error=? WHERE id=?",
                           (dst, "Server stopped; provider outcome and usage may be unknown", row["id"]))
                db.execute("UPDATE calls SET status='interrupted',error='server_interrupted',ended_at=? WHERE run_id=? AND status='running'",
                           (now(), row["id"]))
                db.execute("UPDATE agents SET status='interrupted',ended_at=? WHERE run_id=? AND status='running'",
                           (now(), row["id"]))
                self.event(db, "run.recovered", {"status": dst, "automatic_replay": False}, row["id"])

    def events(self, run_id: str, after: int = 0) -> list[dict]:
        with self.transaction() as db:
            return [decode(row) for row in db.execute(
                "SELECT * FROM events WHERE run_id=? AND seq>? ORDER BY seq LIMIT 500", (run_id, after)
            ).fetchall()]

    def decide(self, identifier: str, decision: str):
        with self.transaction() as db:
            row = db.execute("SELECT run_id FROM artifacts WHERE id=?", (identifier,)).fetchone()
            if not row:
                raise KeyError(identifier)
            db.execute("UPDATE artifacts SET decision=? WHERE id=?", (decision, identifier))
            self.event(db, "artifact.reviewed", {"decision": decision}, row["run_id"], identifier, actor="user")
