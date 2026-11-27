"""Bounded Task decomposition and observable execution prerequisites."""

from __future__ import annotations

from contextlib import closing, contextmanager
import json
import re
import sqlite3

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .recovery import fingerprint
from .task_artifacts import artifact_record

CRITERION = "latest-successful-run-reviewed-reports-v1"


class TaskPlanError(ValueError):
    def __init__(self, code, status=409, *, dependencies=None):
        self.code, self.status = code, status
        self.dependencies = dependencies
        super().__init__(code)


class PlanInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class PlanItem(PlanInput):
    key: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_-]{0,31}$")
    title: str = Field(min_length=1, max_length=160)
    goal: str = Field(min_length=8, max_length=8000)
    acceptance: str = Field(min_length=1, max_length=4000)
    files: list[str] = Field(default_factory=list, max_length=10)
    depends_on: list[str] = Field(default_factory=list, max_length=7)

    @field_validator("title", "goal", "acceptance")
    @classmethod
    def exact_text(cls, value):
        if not value.strip() or value.strip() != value or "\0" in value:
            raise ValueError("task_plan_text_invalid")
        value.encode("utf-8")
        return value

    @field_validator("files", "depends_on")
    @classmethod
    def unique_list(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("task_plan_values_duplicate")
        for item in value:
            if not item or item.strip() != item or "\0" in item:
                raise ValueError("task_plan_reference_invalid")
            item.encode("utf-8")
        return value


class PlanDefinition(PlanInput):
    items: list[PlanItem] = Field(min_length=2, max_length=8)

    @model_validator(mode="after")
    def acyclic(self):
        items = {item.key: item for item in self.items}
        if len(items) != len(self.items):
            raise ValueError("task_plan_key_duplicate")
        done, visiting = set(), set()

        def visit(key):
            if key not in items or key in visiting:
                raise ValueError("task_plan_dependencies_invalid")
            if key in done:
                return
            visiting.add(key)
            for dependency in items[key].depends_on:
                visit(dependency)
            visiting.remove(key)
            done.add(key)

        for key in items:
            visit(key)
        if len(json.dumps({"items": [item.model_dump() for item in self.items]}, ensure_ascii=False).encode()) > 65536:
            raise ValueError("task_plan_too_large")
        return self


class PlanCreate(PlanDefinition):
    request_id: str = Field(pattern=r"^[A-Za-z0-9_-]{8,100}$")
    preview_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    consent: bool = False


def identifier(value):
    if not isinstance(value, str) or not 1 <= len(value) <= 100 or value.strip() != value:
        raise TaskPlanError("task_plan_identifier_invalid", 422)
    value.encode("utf-8")
    return value


def task_record(db, task_id):
    identifier(task_id)
    row = db.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if row is None:
        raise TaskPlanError("task_plan_task_unavailable", 404)
    return {key: json.loads(row[key]) if key == "files" else row[key] for key in row.keys()}


def latest_run(db, task_id):
    row = db.execute(
        "SELECT id,task_id,status,created_at FROM runs WHERE task_id=?"
        " ORDER BY created_at DESC,rowid ASC LIMIT 1", (task_id,),
    ).fetchone()
    return dict(row) if row else None


def reviewed_run(db, task_id):
    task = db.execute("SELECT id,title FROM tasks WHERE id=?", (task_id,)).fetchone()
    if task is None:
        raise TaskPlanError("task_plan_dependency_unavailable")
    run = latest_run(db, task_id)
    state, reports = "no_run", []
    if run:
        state = "run_unfinished" if run["status"] not in {"succeeded", "failed", "canceled"} else "run_failed"
        if run["status"] == "succeeded":
            rows = db.execute(
                "SELECT a.id,a.run_id,a.title,a.kind,a.created_at,a.decision,? AS task_id,"
                "CASE WHEN length(CAST(content AS BLOB)) BETWEEN 1 AND 32768"
                " THEN content ELSE NULL END AS content FROM artifacts a"
                " WHERE a.run_id=? AND a.kind='report' ORDER BY a.created_at DESC,a.id ASC LIMIT 9",
                (task_id, run["id"]),
            ).fetchall()
            state = "report_missing"
            if rows:
                state = "accepted"
                if len(rows) > 8 or any(row["content"] is None for row in rows):
                    state = "report_unavailable"
                elif db.execute(
                    "SELECT 1 FROM artifacts WHERE run_id=? AND decision='changes_requested' LIMIT 1",
                    (run["id"],),
                ).fetchone():
                    state = "changes_requested"
                elif any(row["decision"] != "accepted" for row in rows):
                    state = "review_pending"
                for row in rows[:8]:
                    reports.append({
                        "id": row["id"], "decision": row["decision"],
                        "sha256": artifact_record(row)["sha256"] if row["content"] is not None else None,
                    })
    return {
        "task_id": task_id, "title": task["title"], "latest_run": run,
        "state": state, "reports": reports,
    }


def dependency_state(db, task_id):
    from .task_plan_nesting import nested_gate
    nested = nested_gate(db, task_id)
    if nested is not None:
        return nested
    from .task_plan_revisions import revised_dependency_state
    revised, state = revised_dependency_state(db, task_id)
    if revised:
        return state
    membership = db.execute(
        "SELECT i.parent_task_id,p.plan_hash FROM task_plan_items i"
        " JOIN task_plans p ON p.parent_task_id=i.parent_task_id WHERE i.task_id=?", (task_id,),
    ).fetchone()
    if membership is None:
        return None
    prerequisites = [reviewed_run(db, row["prerequisite_id"]) for row in db.execute(
        "SELECT d.prerequisite_id FROM task_plan_dependencies d"
        " JOIN task_plan_items i ON i.task_id=d.prerequisite_id"
        " WHERE d.task_id=? ORDER BY i.position", (task_id,),
    )]
    return {
        "task_id": task_id, "parent_task_id": membership["parent_task_id"],
        "plan_hash": membership["plan_hash"], "criterion": CRITERION,
        "ready": all(item["state"] == "accepted" for item in prerequisites),
        "prerequisites": prerequisites,
    }


def require_dependencies(db, task_id):
    state = dependency_state(db, task_id)
    if state is not None and not state["ready"]:
        raise TaskPlanError("task_dependencies_blocked", dependencies=state)
    return state


class TaskPlanService:
    def __init__(self, store):
        self.store = store

    @contextmanager
    def reader(self):
        with closing(sqlite3.connect(
            self.store.path.resolve().as_uri() + "?mode=ro", uri=True, timeout=10,
        )) as db:
            db.row_factory = sqlite3.Row
            db.execute("PRAGMA query_only=ON")
            db.execute("BEGIN")
            yield db

    def read_in(self, db, task_id):
        from .task_plan_nesting import nested_read
        nested = nested_read(db, task_id)
        if nested is not None:
            return nested
        from .task_plan_revisions import revised_read
        revised = revised_read(db, task_id)
        if revised is not None:
            return revised
        task_record(db, task_id)
        gate = dependency_state(db, task_id)
        parent = None
        if gate:
            parent_task = task_record(db, gate["parent_task_id"])
            parent = {"task_id": parent_task["id"], "title": parent_task["title"]}
        row = db.execute("SELECT * FROM task_plans WHERE parent_task_id=?", (task_id,)).fetchone()
        plan = None
        if row:
            plan = {
                "version": 1, "parent_task_id": task_id, "plan_hash": row["plan_hash"],
                "created_at": row["created_at"], "definition": json.loads(row["definition"]),
                "parent_snapshot": json.loads(row["parent_snapshot"]),
                "items": [{
                    "key": item["item_key"], "task": task_record(db, item["task_id"]),
                    "review": reviewed_run(db, item["task_id"]),
                    "gate": dependency_state(db, item["task_id"]),
                } for item in db.execute(
                    "SELECT * FROM task_plan_items WHERE parent_task_id=? ORDER BY position", (task_id,),
                )],
            }
        return {"schema_version": 1, "unit": "task_plan", "task_id": task_id,
                "parent": parent, "gate": gate, "plan": plan}

    def read(self, task_id):
        with self.reader() as db:
            return self.read_in(db, task_id)

    def candidate(self, db, task_id, definition):
        from .task_plan_revisions import membership
        from .task_plan_nesting import NestedSnapshot
        task = task_record(db, task_id)
        NestedSnapshot(db).lineage(task_id)
        if membership(db, task_id) is not None:
            from .task_plan_nesting import nested_creation_candidate
            return nested_creation_candidate(db, task_id, definition)
        if db.execute("SELECT 1 FROM task_plans WHERE parent_task_id=?", (task_id,)).fetchone():
            raise TaskPlanError("task_plan_already_created")
        if any(not set(item.files) <= set(task["files"]) for item in definition.items):
            raise TaskPlanError("task_plan_files_outside_parent", 422)
        value = {"parent_snapshot": task, "definition": definition.model_dump(),
                 "criterion": CRITERION}
        return {**value, "preview_hash": fingerprint(value)}

    def preview(self, task_id, definition):
        with self.reader() as db:
            return self.candidate(db, task_id, definition)

    def operation(self, task_id, request_id):
        if not re.fullmatch(r"[A-Za-z0-9_-]{8,100}", request_id):
            raise TaskPlanError("task_plan_request_invalid", 422)
        with self.reader() as db:
            task_record(db, task_id)
            row = db.execute(
                "SELECT receipt FROM task_plan_operations WHERE task_id=? AND request_id=?",
                (task_id, request_id),
            ).fetchone()
            if row is None:
                row = db.execute(
                    "SELECT receipt FROM task_plan_revision_operations WHERE task_id=? AND request_id=?",
                    (task_id, request_id),
                ).fetchone()
            if row is None:
                raise TaskPlanError("task_plan_operation_unavailable", 404)
            return json.loads(row["receipt"])

    def create(self, task_id, body):
        from .store import now, uid, dump
        if not body.consent:
            raise TaskPlanError("task_plan_consent_required", 422)
        command_hash = fingerprint([task_id, body.model_dump()])
        definition = PlanDefinition.model_validate({"items": [item.model_dump() for item in body.items]})
        with self.store.transaction() as db:
            old = db.execute(
                "SELECT * FROM task_plan_operations WHERE request_id=?", (body.request_id,),
            ).fetchone()
            if old:
                if old["task_id"] != task_id or old["command_hash"] != command_hash:
                    raise TaskPlanError("task_plan_request_conflict")
                return json.loads(old["receipt"])
            if db.execute(
                "SELECT 1 FROM task_plan_revision_operations WHERE request_id=?", (body.request_id,),
            ).fetchone():
                raise TaskPlanError("task_plan_request_conflict")
            candidate = self.candidate(db, task_id, definition)
            nested = candidate.get("schema_version") == 3
            if nested and candidate["impact"]["blockers"]:
                raise TaskPlanError("task_plan_nested_busy")
            if candidate["preview_hash"] != body.preview_hash:
                raise TaskPlanError("task_plan_preview_changed")
            at, ids = now(), {item.key: uid() for item in body.items}
            db.execute(
                "INSERT INTO task_plans(parent_task_id,plan_hash,definition,parent_snapshot,created_at)"
                " VALUES(?,?,?,?,?)",
                (task_id, body.preview_hash, dump(definition.model_dump()), dump(candidate["parent_snapshot"]), at),
            )
            for position, item in enumerate(body.items):
                db.execute(
                    "INSERT INTO tasks(id,project_id,title,goal,acceptance,files,created_at) VALUES(?,?,?,?,?,?,?)",
                    (ids[item.key], candidate["parent_snapshot"]["project_id"], item.title,
                     item.goal, item.acceptance, dump(item.files), at),
                )
                db.execute("INSERT INTO task_plan_items VALUES(?,?,?,?)",
                           (ids[item.key], task_id, item.key, position))
                self.store.event(db, "task.created", {
                    "name": item.title, "parent_task_id": task_id, "plan_hash": body.preview_hash,
                }, entity_id=ids[item.key], actor="user")
            for item in body.items:
                for dependency in item.depends_on:
                    db.execute("INSERT INTO task_plan_dependencies VALUES(?,?)",
                               (ids[item.key], ids[dependency]))
            if nested:
                db.execute("INSERT OR IGNORE INTO task_plan_nested_roots VALUES(?,?)",
                           (candidate["impact"]["root_task_id"], at))
            receipt = {**({"schema_version": 3, "operation": "create"} if nested else {}),
                       "request_id": body.request_id, "task_id": task_id,
                       "preview_hash": body.preview_hash, "state": "applied", "result": self.read_in(db, task_id)}
            db.execute("INSERT INTO task_plan_operations VALUES(?,?,?,?,?)",
                       (body.request_id, task_id, command_hash, dump(receipt), at))
            self.store.event(db, "task.plan.created", {
                "parent_task_id": task_id, "plan_hash": body.preview_hash, "task_ids": list(ids.values()),
                "execution_started": False,
            }, entity_id=task_id, actor="user")
            return receipt
