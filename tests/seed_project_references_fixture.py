"""Seed only an empty, explicitly marked disposable project-directory fixture."""

from __future__ import annotations

import argparse
from contextlib import closing
import json
from pathlib import Path
import re
import sqlite3

from seed_task_detail_fixture import MARKER


def seed(directory: str):
    root = Path(directory)
    if (
        not root.is_absolute() or root.parent != Path("/tmp") or
        not re.fullmatch(r"mybot-astryx-workbench\.[A-Za-z0-9_-]+", root.name) or
        root.is_symlink() or root.resolve(strict=True) != root
    ):
        raise ValueError("An explicit, nonsymlink /tmp/mybot-astryx-workbench.* fixture is required")
    paths = (root / "workspace", root / "workspace/README.md", root / "data",
             root / "data/workbench.sqlite3")
    if any(path.is_symlink() or path.resolve(strict=True) != path for path in paths):
        raise ValueError("Fixture paths must exist without symlinks")
    if paths[1].read_text(encoding="utf-8") != MARKER:
        raise ValueError("The disposable browser fixture marker is missing")
    database = paths[-1]
    if any(Path(f"{database}{suffix}").is_symlink() for suffix in ("-wal", "-shm", "-journal")):
        raise ValueError("SQLite fixture sidecars must not be symlinks")
    with closing(sqlite3.connect(database.as_uri() + "?mode=rw", uri=True, timeout=10)) as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("BEGIN IMMEDIATE")
        try:
            tables = {
                row[0] for row in db.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                )
            }
            required = {
                "projects", "tasks", "runs", "models", "model_tests", "agents",
                "calls", "artifacts", "events", "workspace_settings", "saved_views",
                "recovery_intents", "backend_connections", "conversation_refs",
                "conversation_messages",
                "task_turns",
                "workflow_drafts", "workflow_versions", "workflow_operations",
                "device_pairings", "devices", "device_operations", "device_messages",
                "device_execution_grants", "device_execution_operations",
                "coding_jobs",
                "task_plans", "task_plan_items", "task_plan_dependencies", "task_plan_operations",
                "task_plan_versions", "task_plan_memberships", "task_plan_revision_operations",
                "task_plan_nested_roots", "plan_suggestion_jobs",
            }
            if tables != required:
                raise ValueError("The fixture schema does not match the expected workbench")
            if any(
                db.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
                for table in sorted(required - {"workflow_drafts"})
            ):
                raise ValueError("The disposable fixture must contain no business records")
            from workbench.workflows import builtin_definition, fingerprint
            draft_rows = db.execute(
                "SELECT revision,definition,definition_hash FROM workflow_drafts"
            ).fetchall()
            if (
                len(draft_rows) != 1 or draft_rows[0][0] != 1
                or json.loads(draft_rows[0][1]) != builtin_definition()
                or draft_rows[0][2] != fingerprint(builtin_definition())
            ):
                raise ValueError("The fixture must retain only the initial unconfigured workflow draft")
            for index in range(45):
                project = f"reference-project-{index:03}"
                db.execute("INSERT INTO projects VALUES(?,?,?,?,?,?)", (
                    project, f"Reference project {index:03}", "", ".", "",
                    f"2026-11-18T00:{index:02}:00Z",
                ))
                tasks = 2 if index == 0 else 0 if index == 1 else 1
                for task_index in range(tasks):
                    task = f"reference-task-{index:03}-{task_index}"
                    db.execute("INSERT INTO tasks VALUES(?,?,?,?,?,?,?)", (
                        task, project, f"Reference task {index:03}-{task_index}",
                        "Synthetic project-directory fixture", "No real model execution",
                        "[]", f"2026-11-18T00:{index:02}:00Z",
                    ))
                    runs = 45 if index == task_index == 0 else 0 if index == 0 else 1
                    for run_index in range(runs):
                        identifier = f"reference-run-{index:03}-{task_index}-{run_index:03}"
                        db.execute(
                            "INSERT INTO runs(id,task_id,request_id,status,config,context,created_at)"
                            " VALUES(?,?,?,?,?,?,?)",
                            (identifier, task, identifier,
                             ("failed", "canceled", "succeeded")[run_index % 3], "{}", "{}",
                             f"2026-11-18T01:{run_index:02}:00Z"),
                        )
            db.commit()
        except BaseException:
            db.rollback()
            raise
    return {
        "fixture": str(root), "database": str(database),
        "projects": 45, "tasks": 45, "runs": 88,
        "selected_project_id": "reference-project-000",
        "empty_project_id": "reference-project-001", "all_runs_terminal": True,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("fixture_directory")
    args = parser.parse_args()
    print(json.dumps(seed(args.fixture_directory), sort_keys=True))
