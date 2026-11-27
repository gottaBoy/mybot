"""Exact nested admission identities without changing legacy candidate hashes."""

from .task_plans import TaskPlanError, dependency_state


def gate_scope(gate):
    if gate is None or gate.get("schema_version") != 3:
        return None
    return {"schema_version": 1, "task_id": gate["task_id"], "scope_hash": gate["scope_hash"]}


def current_scope(db, task_id):
    return gate_scope(dependency_state(db, task_id))


def require_scope(expected, gate):
    if expected != gate_scope(gate):
        raise TaskPlanError("task_plan_scope_changed", dependencies=gate)


def require_run_scope(context, gate):
    expected = context.get("task_plan_scope")
    if expected != gate_scope(context.get("task_dependencies")):
        raise TaskPlanError("task_plan_scope_changed", dependencies=gate)
    require_scope(expected, gate)
