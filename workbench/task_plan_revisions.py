"""Immutable Task plan revisions with stable history and fresh replacement Tasks."""

from __future__ import annotations

import json

from pydantic import Field

from .recovery import fingerprint
from .task_plans import (
    CRITERION, PlanDefinition, TaskPlanError, TaskPlanService, reviewed_run, task_record,
)


MAX_VERSIONS = 100


class PlanRevisionPreview(PlanDefinition):
    expected_version: int = Field(ge=1, le=MAX_VERSIONS)
    expected_plan_hash: str = Field(pattern=r"^[0-9a-f]{64}$")


class PlanRevisionCreate(PlanRevisionPreview):
    request_id: str = Field(pattern=r"^[A-Za-z0-9_-]{8,100}$")
    preview_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    consent: bool = False


def membership(db, task_id):
    old = db.execute(
        "SELECT parent_task_id,item_key FROM task_plan_items WHERE task_id=?", (task_id,),
    ).fetchone()
    new = db.execute(
        "SELECT parent_task_id,item_key FROM task_plan_memberships WHERE task_id=?", (task_id,),
    ).fetchone()
    if old is not None and new is not None:
        raise TaskPlanError("task_plan_membership_inconsistent")
    return dict(old or new) if old is not None or new is not None else None


def latest_revision(db, parent_task_id):
    return db.execute(
        "SELECT * FROM task_plan_versions WHERE parent_task_id=? ORDER BY version DESC LIMIT 1",
        (parent_task_id,),
    ).fetchone()


def version_row(row):
    return {
        "version": row["version"], "parent_task_id": row["parent_task_id"],
        "plan_hash": row["plan_hash"], "created_at": row["created_at"],
        "definition": json.loads(row["definition"]),
        "parent_snapshot": json.loads(row["parent_snapshot"]),
        "bindings": json.loads(row["bindings"]),
    }


def legacy_version(db, parent_task_id):
    row = db.execute(
        "SELECT * FROM task_plans WHERE parent_task_id=?", (parent_task_id,),
    ).fetchone()
    if row is None:
        raise TaskPlanError("task_plan_version_unavailable", 404)
    definition, parent = json.loads(row["definition"]), json.loads(row["parent_snapshot"])
    rows = db.execute(
        "SELECT item_key,task_id FROM task_plan_items WHERE parent_task_id=? ORDER BY position",
        (parent_task_id,),
    ).fetchall()
    if len(rows) != len(definition["items"]):
        raise TaskPlanError("task_plan_membership_inconsistent")
    bindings = []
    for item, binding in zip(definition["items"], rows):
        if item["key"] != binding["item_key"]:
            raise TaskPlanError("task_plan_membership_inconsistent")
        bindings.append({
            "key": item["key"],
            "task": {
                "id": binding["task_id"], "project_id": parent["project_id"],
                **{key: item[key] for key in ("title", "goal", "acceptance", "files")},
                "created_at": row["created_at"],
            },
        })
    return {
        "version": 1, "parent_task_id": parent_task_id, "plan_hash": row["plan_hash"],
        "created_at": row["created_at"], "definition": definition,
        "parent_snapshot": parent, "bindings": bindings,
    }


def current_version(db, parent_task_id):
    row = latest_revision(db, parent_task_id)
    return version_row(row) if row is not None else legacy_version(db, parent_task_id)


def gate_for_version(db, task_id, version):
    bindings = {item["key"]: item["task"] for item in version["bindings"]}
    item = next(
        (item for item in version["definition"]["items"] if bindings[item["key"]]["id"] == task_id),
        None,
    )
    current = item is not None
    prerequisites = []
    if current:
        prerequisites = [
            reviewed_run(db, binding["task"]["id"]) for binding in version["bindings"]
            if binding["key"] in item["depends_on"]
        ]
    return {
        "task_id": task_id, "parent_task_id": version["parent_task_id"],
        "plan_hash": version["plan_hash"], "plan_version": version["version"],
        "membership": "current" if current else "retired", "criterion": CRITERION,
        "ready": current and all(item["state"] == "accepted" for item in prerequisites),
        "prerequisites": prerequisites,
    }


def revised_dependency_state(db, task_id):
    member = membership(db, task_id)
    if member is None:
        return False, None
    row = latest_revision(db, member["parent_task_id"])
    if row is None:
        if db.execute("SELECT 1 FROM task_plan_memberships WHERE task_id=?", (task_id,)).fetchone():
            raise TaskPlanError("task_plan_membership_inconsistent")
        return False, None
    return True, gate_for_version(db, task_id, version_row(row))


def revised_read(db, task_id):
    member = membership(db, task_id)
    root_id = member["parent_task_id"] if member else task_id
    row = latest_revision(db, root_id)
    if row is None:
        return None
    task_record(db, task_id)
    version = version_row(row)
    parent = gate = plan = None
    if member:
        root = task_record(db, root_id)
        parent = {"task_id": root_id, "title": root["title"]}
        gate = gate_for_version(db, task_id, version)
    else:
        items = []
        for binding in version["bindings"]:
            task = task_record(db, binding["task"]["id"])
            if task != binding["task"]:
                raise TaskPlanError("task_plan_snapshot_inconsistent")
            items.append({
                "key": binding["key"], "task": task, "review": reviewed_run(db, task["id"]),
                "gate": gate_for_version(db, task["id"], version),
            })
        plan = {
            key: version[key] for key in (
                "version", "parent_task_id", "plan_hash", "created_at", "definition", "parent_snapshot",
            )
        } | {"items": items}
    return {
        "schema_version": 2, "unit": "task_plan", "task_id": task_id,
        "parent": parent, "gate": gate, "plan": plan,
    }


def task_blockers(db, task_id):
    from .store import now
    reasons = []
    queries = (
        ("unfinished_run",
         "SELECT 1 FROM runs WHERE task_id=? AND status NOT IN ('succeeded','failed','canceled')"
         " AND (status!='interrupted' OR NOT EXISTS(SELECT 1 FROM runs child"
         " WHERE child.source_run_id=runs.id AND child.task_id=runs.task_id"
         " AND child.status IN ('succeeded','failed','canceled'))) LIMIT 1"),
        ("prepared_turn", "SELECT 1 FROM task_turns WHERE task_id=? AND state='prepared' LIMIT 1"),
        ("prepared_coding", "SELECT 1 FROM coding_jobs WHERE task_id=? AND state='prepared' LIMIT 1"),
        ("unresolved_recovery",
         "SELECT 1 FROM recovery_intents i JOIN runs r ON r.id=i.source_run_id"
         " WHERE r.task_id=? AND i.state IN ('prepared','applying','unknown') LIMIT 1"),
    )
    for reason, query in queries:
        if db.execute(query, (task_id,)).fetchone():
            reasons.append(reason)
    if db.execute(
        "SELECT 1 FROM device_execution_grants g JOIN task_turns t ON t.id=g.turn_id"
        " WHERE g.task_id=? AND g.revoked_at IS NULL AND g.run_id IS NULL"
        " AND g.expires_at>? AND t.state='prepared' LIMIT 1", (task_id, now()),
    ).fetchone():
        reasons.append("unconsumed_grant")
    return reasons


def revision_impact(db, baseline, definition):
    previous = {item["key"]: item for item in baseline["definition"]["items"]}
    bindings = {binding["key"]: binding["task"] for binding in baseline["bindings"]}
    items = definition.model_dump()["items"]
    added = {item["key"] for item in items if item["key"] not in previous}
    replaced = {
        item["key"] for item in items if item["key"] in previous and (
            any(item[field] != previous[item["key"]][field]
                for field in ("title", "goal", "acceptance", "files"))
            or set(item["depends_on"]) != set(previous[item["key"]]["depends_on"])
        )
    }
    # A changed prerequisite binds a fresh Task, so its dependents need fresh evidence too.
    while True:
        expanded = replaced | {
            item["key"] for item in items if item["key"] in previous
            and any(key in added | replaced for key in item["depends_on"])
        }
        if expanded == replaced:
            break
        replaced = expanded
    reused = {item["key"] for item in items} - added - replaced
    removed = set(previous) - {item["key"] for item in items}
    retired = [binding["task"]["id"] for binding in baseline["bindings"] if binding["key"] not in reused]
    blockers = []
    for task_id in retired:
        reasons = task_blockers(db, task_id)
        if reasons:
            blockers.append({"task_id": task_id, "reasons": reasons})
    for key in reused:
        if task_record(db, bindings[key]["id"]) != bindings[key]:
            raise TaskPlanError("task_plan_snapshot_inconsistent")
    return {
        "added_keys": [item["key"] for item in items if item["key"] in added],
        "replaced_keys": [item["key"] for item in items if item["key"] in replaced],
        "reused_keys": [item["key"] for item in items if item["key"] in reused],
        "removed_keys": [item["key"] for item in baseline["definition"]["items"] if item["key"] in removed],
        "retired_task_ids": retired, "blockers": blockers,
    }


class TaskPlanRevisionService(TaskPlanService):
    def candidate(self, db, task_id, body):
        parent = task_record(db, task_id)
        if membership(db, task_id) is not None:
            raise TaskPlanError("task_plan_nested_unsupported", 422)
        baseline = current_version(db, task_id)
        if baseline["version"] != body.expected_version or baseline["plan_hash"] != body.expected_plan_hash:
            raise TaskPlanError("task_plan_revision_conflict")
        if baseline["version"] >= MAX_VERSIONS:
            raise TaskPlanError("task_plan_version_limit")
        definition = PlanDefinition.model_validate({"items": [item.model_dump() for item in body.items]})
        if any(not set(item.files) <= set(parent["files"]) for item in definition.items):
            raise TaskPlanError("task_plan_files_outside_parent", 422)
        if definition.model_dump() == baseline["definition"] and parent == baseline["parent_snapshot"]:
            raise TaskPlanError("task_plan_revision_unchanged")
        value = {
            "schema_version": 2, "unit": "task_plan_revision_preview", "parent_task_id": task_id,
            "expected_version": body.expected_version, "expected_plan_hash": body.expected_plan_hash,
            "baseline": baseline, "parent_snapshot": parent, "definition": definition.model_dump(),
            "impact": revision_impact(db, baseline, definition),
        }
        return {**value, "preview_hash": fingerprint(value)}

    def preview(self, task_id, body):
        with self.reader() as db:
            return self.candidate(db, task_id, body)

    def revise(self, task_id, body):
        from .store import now, uid, dump
        if not body.consent:
            raise TaskPlanError("task_plan_consent_required", 422)
        command_hash = fingerprint(["revise", task_id, body.model_dump()])
        with self.store.transaction() as db:
            old = db.execute(
                "SELECT * FROM task_plan_revision_operations WHERE request_id=?", (body.request_id,),
            ).fetchone()
            if old is not None:
                if old["task_id"] != task_id or old["command_hash"] != command_hash:
                    raise TaskPlanError("task_plan_request_conflict")
                return json.loads(old["receipt"])
            if db.execute(
                "SELECT 1 FROM task_plan_operations WHERE request_id=?", (body.request_id,),
            ).fetchone():
                raise TaskPlanError("task_plan_request_conflict")
            candidate = self.candidate(db, task_id, body)
            if candidate["impact"]["blockers"]:
                raise TaskPlanError("task_plan_revision_blocked")
            if candidate["preview_hash"] != body.preview_hash:
                raise TaskPlanError("task_plan_preview_changed")
            baseline = candidate["baseline"]
            version, at = baseline["version"] + 1, now()
            old_bindings = {item["key"]: item["task"] for item in baseline["bindings"]}
            reused = set(candidate["impact"]["reused_keys"])
            bindings = []
            for item in body.items:
                if item.key in reused:
                    task = old_bindings[item.key]
                else:
                    task = {
                        "id": uid(), "project_id": candidate["parent_snapshot"]["project_id"],
                        **item.model_dump(exclude={"key", "depends_on"}), "created_at": at,
                    }
                    db.execute(
                        "INSERT INTO tasks(id,project_id,title,goal,acceptance,files,created_at)"
                        " VALUES(?,?,?,?,?,?,?)",
                        (task["id"], task["project_id"], task["title"], task["goal"],
                         task["acceptance"], dump(task["files"]), at),
                    )
                    db.execute(
                        "INSERT INTO task_plan_memberships VALUES(?,?,?,?)",
                        (task["id"], task_id, item.key, version),
                    )
                    self.store.event(db, "task.created", {
                        "name": task["title"], "parent_task_id": task_id,
                        "plan_hash": body.preview_hash, "plan_version": version,
                    }, entity_id=task["id"], actor="user")
                bindings.append({"key": item.key, "task": task})
            db.execute(
                "INSERT INTO task_plan_versions VALUES(?,?,?,?,?,?,?)",
                (task_id, version, body.preview_hash, dump(candidate["definition"]),
                 dump(candidate["parent_snapshot"]), dump(bindings), at),
            )
            receipt = {
                "schema_version": 2, "operation": "revise", "request_id": body.request_id,
                "task_id": task_id, "preview_hash": body.preview_hash, "state": "applied",
                "result": self.read_in(db, task_id),
            }
            db.execute(
                "INSERT INTO task_plan_revision_operations VALUES(?,?,?,?,?)",
                (body.request_id, task_id, command_hash, dump(receipt), at),
            )
            self.store.event(db, "task.plan.revised", {
                "parent_task_id": task_id, "from_version": baseline["version"], "version": version,
                "from_plan_hash": baseline["plan_hash"], "plan_hash": body.preview_hash,
                **candidate["impact"], "execution_started": False,
            }, entity_id=task_id, actor="user")
            return receipt

    def versions(self, task_id, page=1):
        from .task_query import MAX_PAGE
        if type(page) is not int or not 1 <= page <= MAX_PAGE:
            raise TaskPlanError("task_plan_page_invalid", 422)
        with self.reader() as db:
            task_record(db, task_id)
            first = legacy_version(db, task_id)
            items = [version_row(row) for row in db.execute(
                "SELECT * FROM task_plan_versions WHERE parent_task_id=? ORDER BY version DESC",
                (task_id,),
            )] + [first]
            total = len(items)
            total_pages = max(1, (total + 19) // 20)
            current = min(page, total_pages)
            return {
                "schema_version": 2, "parent_task_id": task_id,
                "items": items[(current - 1) * 20:current * 20], "total": total,
                "requested_page": page, "page": current, "page_size": 20,
                "total_pages": total_pages, "has_more": current < total_pages,
            }

    def version(self, task_id, version):
        if type(version) is not int or not 1 <= version <= MAX_VERSIONS:
            raise TaskPlanError("task_plan_version_invalid", 422)
        with self.reader() as db:
            task_record(db, task_id)
            if version == 1:
                return legacy_version(db, task_id)
            row = db.execute(
                "SELECT * FROM task_plan_versions WHERE parent_task_id=? AND version=?",
                (task_id, version),
            ).fetchone()
            if row is None:
                raise TaskPlanError("task_plan_version_unavailable", 404)
            return version_row(row)
