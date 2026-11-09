from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .recovery import fingerprint, retry_preview


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
CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
 title TEXT NOT NULL, goal TEXT NOT NULL, acceptance TEXT NOT NULL,
 files TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id),
 request_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL, config TEXT NOT NULL,
 context TEXT NOT NULL, plan TEXT NOT NULL DEFAULT '[]',
 source_run_id TEXT REFERENCES runs(id),
 error TEXT, started_at TEXT, ended_at TEXT, created_at TEXT NOT NULL
);
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
                         "backend_connections", "conversation_refs"}:
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

    def set_setting(self, key: str, value: str, actor="user"):
        with self.transaction() as db:
            db.execute(
                "INSERT INTO workspace_settings(key,value) VALUES(?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, value),
            )
            self.event(db, "workspace.setting.updated", {"key": key}, actor=actor)

    def list(self, table: str, run_id=None) -> list[dict]:
        if table not in {"projects", "models", "tasks", "runs", "agents", "artifacts", "calls",
                         "backend_connections", "conversation_refs"}:
            raise ValueError("Invalid entity")
        if table == "conversation_refs" and run_id:
            where = " WHERE connection_id=?"
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
            }, entity_id=values["id"])
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

    def create_retry(self, identifier, request_id, config, models, snapshot_hash, acknowledge):
        request_hash = fingerprint([identifier, snapshot_hash, config])
        with self.transaction() as db:
            existing = decode(db.execute("SELECT * FROM runs WHERE request_id=?", (request_id,)).fetchone())
            if existing:
                if existing.get("source_run_id") != identifier or existing["context"].get("retry_request_hash") != request_hash:
                    raise ValueError("retry_request_id_conflict")
                return existing
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
        return self.get("runs", new_id)

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
            row = db.execute("SELECT * FROM runs WHERE id=?", (identifier,)).fetchone()
            if not row:
                raise KeyError(identifier)
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
        return self.get("runs", identifier)

    def recover(self):
        with self.transaction() as db:
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
