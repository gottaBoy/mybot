"""Bounded current Task trees, children-first completion and inherited gates."""

from __future__ import annotations

import json
import sqlite3

from .recovery import fingerprint
from .task_plans import PlanDefinition, TaskPlanError, task_record, reviewed_run


NESTED_CRITERION = "nested-children-and-reviewed-integration-v1"
MAX_DEPTH = 2
MAX_TASKS = 73


class NestedSnapshot:
    def __init__(self, db):
        self.db = db
        self.tasks = {}
        self.versions = {}
        self.outcomes = {}
        self.computing = set()
        self.trees = {}
        self.unowned_checked = set()

    def task(self, task_id):
        if task_id not in self.tasks:
            self.tasks[task_id] = task_record(self.db, task_id)
        return self.tasks[task_id]

    def version(self, task_id):
        from .task_plan_revisions import current_version, membership
        if task_id not in self.versions:
            version = (
                current_version(self.db, task_id) if self.db.execute(
                    "SELECT 1 FROM task_plans WHERE parent_task_id=?", (task_id,),
                ).fetchone() else None
            )
            if version is not None:
                try:
                    definition = PlanDefinition.model_validate(version["definition"]).model_dump()
                    bindings = version["bindings"]
                    parent = self.task(task_id)
                    if (
                        version["parent_task_id"] != task_id
                        or version["parent_snapshot"]["id"] != task_id
                        or version["parent_snapshot"]["project_id"] != parent["project_id"]
                        or not isinstance(bindings, list) or len(bindings) != len(definition["items"])
                    ):
                        raise ValueError("task_plan_bindings_invalid")
                    ids = []
                    for item, binding in zip(definition["items"], bindings):
                        if not isinstance(binding, dict) or set(binding) != {"key", "task"}:
                            raise ValueError("task_plan_binding_invalid")
                        task = binding["task"]
                        if (
                            not isinstance(task, dict) or set(task) != {
                                "id", "project_id", "title", "goal", "acceptance", "files", "created_at",
                            }
                            or binding["key"] != item["key"]
                            or task["id"] == task_id
                            or task["project_id"] != parent["project_id"]
                            or any(task[key] != item[key] for key in ("title", "goal", "acceptance", "files"))
                            or not set(item["files"]) <= set(version["parent_snapshot"]["files"])
                            or self.task(task["id"]) != task
                            or membership(self.db, task["id"]) != {
                                "parent_task_id": task_id, "item_key": binding["key"],
                            }
                        ):
                            raise ValueError("task_plan_binding_invalid")
                        ids.append(task["id"])
                    if len(set(ids)) != len(ids):
                        raise ValueError("task_plan_binding_duplicate")
                except (KeyError, TypeError, ValueError, UnicodeError) as error:
                    raise TaskPlanError("task_plan_tree_invalid") from error
            self.versions[task_id] = version
        return self.versions[task_id]

    def lineage(self, task_id):
        from .task_plan_revisions import membership
        self.task(task_id)
        current, seen, levels = task_id, set(), []
        while True:
            if current in seen or len(levels) > MAX_DEPTH:
                raise TaskPlanError("task_plan_tree_invalid")
            seen.add(current)
            member = membership(self.db, current)
            if member is None:
                if current not in self.unowned_checked:
                    try:
                        orphaned = self.db.execute(
                            "SELECT 1 FROM task_plan_versions v,json_each(v.bindings) b"
                            " WHERE json_extract(b.value,'$.task.id')=?"
                            " UNION ALL SELECT 1 FROM task_plan_operations o,"
                            " json_each(o.receipt,'$.result.plan.items') i"
                            " WHERE json_extract(i.value,'$.task.id')=? LIMIT 1",
                            (current, current),
                        ).fetchone()
                    except sqlite3.DatabaseError as error:
                        raise TaskPlanError("task_plan_tree_invalid") from error
                    if orphaned is not None:
                        raise TaskPlanError("task_plan_tree_invalid")
                    self.unowned_checked.add(current)
                return {
                    "root_task_id": current, "depth": len(levels), "lineage": levels,
                    "membership": "current" if all(
                        level["membership"] == "current" for level in levels
                    ) else "retired",
                }
            parent = member["parent_task_id"]
            version = self.version(parent)
            if version is None:
                raise TaskPlanError("task_plan_membership_inconsistent")
            included = any(binding["task"]["id"] == current for binding in version["bindings"])
            if self.task(current)["project_id"] != self.task(parent)["project_id"]:
                raise TaskPlanError("task_plan_tree_invalid")
            levels.append({
                "task_id": current, "parent_task_id": parent, "plan_version": version["version"],
                "plan_hash": version["plan_hash"], "membership": "current" if included else "retired",
            })
            current = parent

    def nested(self, task_id):
        info = self.lineage(task_id)
        marker = self.db.execute(
            "SELECT 1 FROM task_plan_nested_roots WHERE root_task_id=?", (info["root_task_id"],),
        ).fetchone()
        if any(self.db.execute(
            "SELECT 1 FROM task_plan_nested_roots WHERE root_task_id=?", (level["task_id"],),
        ).fetchone() for level in info["lineage"]):
            raise TaskPlanError("task_plan_tree_invalid")
        historical_nested = self.db.execute(
            "SELECT 1 FROM task_plans p JOIN ("
            " SELECT task_id,parent_task_id FROM task_plan_items"
            " UNION ALL SELECT task_id,parent_task_id FROM task_plan_memberships"
            ") i ON p.parent_task_id=i.task_id WHERE i.parent_task_id=? LIMIT 1",
            (info["root_task_id"],),
        ).fetchone()
        if marker is None:
            if historical_nested is not None or info["depth"] >= MAX_DEPTH:
                raise TaskPlanError("task_plan_tree_invalid")
            return None
        if self.version(info["root_task_id"]) is None:
            raise TaskPlanError("task_plan_tree_invalid")
        self.tree(info["root_task_id"])
        return info

    def tree(self, root_id):
        if root_id in self.trees:
            return self.trees[root_id]
        ids, heads, seen = [], [], set()

        def walk(task_id, depth):
            if depth > MAX_DEPTH or task_id in seen or len(ids) >= MAX_TASKS:
                raise TaskPlanError("task_plan_tree_limit", 422)
            seen.add(task_id)
            ids.append(task_id)
            version = self.version(task_id)
            if version is None:
                return
            heads.append({"task_id": task_id, "version": version["version"], "plan_hash": version["plan_hash"]})
            for binding in version["bindings"]:
                if self.task(binding["task"]["id"]) != binding["task"]:
                    raise TaskPlanError("task_plan_snapshot_inconsistent")
                walk(binding["task"]["id"], depth + 1)

        walk(root_id, 0)
        self.trees[root_id] = ids, heads
        return self.trees[root_id]

    def own_plan(self, task_id):
        version = self.version(task_id)
        if version is None:
            return None
        children = [self.outcome(binding["task"]["id"]) for binding in version["bindings"]]
        scope = {
            "task_id": task_id, "version": version["version"], "plan_hash": version["plan_hash"],
            "children": [{"task_id": child["task_id"], "completion_hash": child["completion_hash"]}
                         for child in children],
        }
        return {
            "version": version["version"], "plan_hash": version["plan_hash"],
            "completion_scope_hash": fingerprint(scope),
            "ready": all(child["state"] == "accepted" for child in children), "children": children,
        }

    def outcome(self, task_id):
        if task_id in self.outcomes:
            return self.outcomes[task_id]
        if task_id in self.computing or len(self.computing) > MAX_TASKS:
            raise TaskPlanError("task_plan_tree_invalid")
        self.computing.add(task_id)
        try:
            reviewed = reviewed_run(self.db, task_id)
            info = self.lineage(task_id)
            own = self.own_plan(task_id)
            state = reviewed["state"]
            if info["membership"] != "current":
                state = "retired"
            elif own is not None:
                if not own["ready"]:
                    state = "children_pending"
                elif state == "accepted":
                    row = self.db.execute(
                        "SELECT context FROM runs WHERE id=?", (reviewed["latest_run"]["id"],),
                    ).fetchone()
                    context = json.loads(row["context"])
                    dependencies = context.get("task_dependencies")
                    recorded = dependencies.get("own_plan") if isinstance(dependencies, dict) else None
                    if (
                        not isinstance(recorded, dict)
                        or recorded.get("completion_scope_hash") != own["completion_scope_hash"]
                    ):
                        state = "integration_stale"
            own_summary = None if own is None else {
                key: own[key] for key in ("version", "plan_hash", "completion_scope_hash", "ready")
            } | {"children": [{
                key: child[key] for key in ("task_id", "title", "state", "completion_hash")
            } for child in own["children"]]}
            value = {
                **reviewed, "kind": "plan" if own is not None else "run", "state": state,
                "own_plan": own_summary,
            }
            value["completion_hash"] = fingerprint(value)
            self.outcomes[task_id] = value
            return value
        finally:
            self.computing.remove(task_id)

    def gate(self, task_id):
        info = self.lineage(task_id)
        scopes = []
        for level in info["lineage"]:
            version = self.version(level["parent_task_id"])
            binding = next(
                (binding for binding in version["bindings"] if binding["task"]["id"] == level["task_id"]),
                None,
            )
            prerequisites = []
            if binding is not None:
                item = next(item for item in version["definition"]["items"] if item["key"] == binding["key"])
                prerequisites = [
                    self.outcome(other["task"]["id"]) for other in version["bindings"]
                    if other["key"] in item["depends_on"]
                ]
            scopes.append({**level, "prerequisites": prerequisites})
        own = self.own_plan(task_id)
        value = {
            "schema_version": 3, "task_id": task_id,
            "parent_task_id": info["lineage"][0]["parent_task_id"] if info["lineage"] else None,
            "root_task_id": info["root_task_id"], "depth": info["depth"],
            "membership": info["membership"],
            "ready": (
                info["membership"] == "current"
                and all(item["state"] == "accepted" for scope in scopes for item in scope["prerequisites"])
                and (own is None or own["ready"])
            ),
            "external_scopes": scopes, "own_plan": own,
        }
        return {**value, "scope_hash": fingerprint(value)}

    def read(self, task_id):
        info = self.lineage(task_id)
        parent = None
        if info["lineage"]:
            parent_id = info["lineage"][0]["parent_task_id"]
            parent = {"task_id": parent_id, "title": self.task(parent_id)["title"]}
        version = self.version(task_id)
        plan = None
        if version is not None:
            plan = {key: version[key] for key in (
                "version", "parent_task_id", "plan_hash", "created_at", "definition", "parent_snapshot",
            )} | {"items": [{
                "key": binding["key"], "task": self.task(binding["task"]["id"]),
                "review": self.outcome(binding["task"]["id"]), "gate": self.gate(binding["task"]["id"]),
            } for binding in version["bindings"]]}
        return {
            "schema_version": 3, "unit": "task_plan", "task_id": task_id,
            "root_task_id": info["root_task_id"], "depth": info["depth"],
            "parent": parent, "gate": self.gate(task_id), "plan": plan,
        }


def nested_gate(db, task_id):
    snapshot = NestedSnapshot(db)
    return snapshot.gate(task_id) if snapshot.nested(task_id) else None


def nested_read(db, task_id):
    snapshot = NestedSnapshot(db)
    return snapshot.read(task_id) if snapshot.nested(task_id) else None


def nested_structure(db, task_id, *, added_tasks=0, retired_task_ids=()):
    from .task_plan_revisions import task_blockers
    snapshot = NestedSnapshot(db)
    info = snapshot.lineage(task_id)
    if info["membership"] != "current":
        raise TaskPlanError("task_plan_task_retired")
    if info["depth"] >= MAX_DEPTH:
        raise TaskPlanError("task_plan_depth_limit", 422)
    ids, heads = snapshot.tree(info["root_task_id"])
    retired, seen = [], set()

    def retire(task):
        if task in seen:
            return
        seen.add(task)
        retired.append(task)
        version = snapshot.version(task)
        if version is not None:
            for child in version["bindings"]:
                retire(child["task"]["id"])

    for task in retired_task_ids:
        retire(task)
    if len(ids) - len(retired) + added_tasks > MAX_TASKS:
        raise TaskPlanError("task_plan_tree_limit", 422)
    blockers = []
    for task in ids:
        reasons = task_blockers(db, task)
        if reasons:
            blockers.append({"task_id": task, "reasons": reasons})
    return {
        "lineage": info["lineage"], "tree_heads": heads,
        "impact": {
            "root_task_id": info["root_task_id"], "depth": info["depth"],
            "current_task_count": len(ids), "added_tasks": added_tasks,
            "retired_task_ids": retired, "blockers": blockers,
        },
    }


def nested_creation_candidate(db, task_id, definition):
    if db.execute("SELECT 1 FROM task_plans WHERE parent_task_id=?", (task_id,)).fetchone():
        raise TaskPlanError("task_plan_already_created")
    task = task_record(db, task_id)
    if any(not set(item.files) <= set(task["files"]) for item in definition.items):
        raise TaskPlanError("task_plan_files_outside_parent", 422)
    structure = nested_structure(db, task_id, added_tasks=len(definition.items))
    value = {
        "schema_version": 3, "unit": "task_plan_preview", "parent_task_id": task_id,
        "parent_snapshot": task, "definition": definition.model_dump(), "criterion": NESTED_CRITERION,
        **structure,
    }
    return {**value, "preview_hash": fingerprint(value)}
