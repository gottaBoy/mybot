"""Isolated synthetic query measurement. Never opens the user's data directory."""

import argparse
from collections import defaultdict
import json
from pathlib import Path
import sqlite3
import statistics
import tempfile
import time

from workbench.store import Store
from workbench.task_query import EMPTY_QUERY, parse_task_query, read_task_page


def measure(task_count, samples):
    with tempfile.TemporaryDirectory(prefix="mybot-task-query-benchmark-") as directory:
        store = Store(Path(directory) / "data")
        with store.transaction() as db:
            for index in range(10):
                db.execute("INSERT INTO projects VALUES(?,?,?,?,?,?)", (
                    f"project-{index}", f"Project {index}", "", ".", "", "2026-11-16T00:00:00Z",
                ))
            for index in range(task_count):
                identifier = f"task-{index:08}"
                db.execute("INSERT INTO tasks VALUES(?,?,?,?,?,?,?)", (
                    identifier, f"project-{index % 10}", f"Research {index}",
                    "Synthetic measurement only", "", "[]", "2026-11-16T00:00:00Z",
                ))
                if index % 5 == 0:
                    continue
                for attempt in range(3):
                    run = f"run-{index:08}-{attempt}"
                    db.execute(
                        "INSERT INTO runs(id,task_id,request_id,status,config,context,created_at)"
                        " VALUES(?,?,?,?,?,?,?)",
                        (run, identifier, run, "failed" if attempt < 2 else "succeeded",
                         "{}", "{}", f"2026-11-16T0{attempt + 1}:00:00Z"),
                    )
        elapsed = defaultdict(list)
        rows = {}
        for name, query, sorts in [
            ("first_page", json.loads(EMPTY_QUERY), []),
            ("scoped_natural_sort", {
                **json.loads(EMPTY_QUERY), "projects": ["project-1", "project-2"],
                "states": ["completed"],
            }, [{"sortKey": "title", "direction": "descending"}]),
            ("literal_text_search", {
                **json.loads(EMPTY_QUERY), "text": "Research 12",
            }, []),
        ]:
            candidate = parse_task_query(json.dumps(query), json.dumps(sorts), None, 1, 20)
            for _ in range(samples):
                started = time.perf_counter()
                response = read_task_page(store.path, candidate)
                elapsed[name].append((time.perf_counter() - started) * 1000)
                assert len(response["items"]) <= 20
                assert response["total"] >= len(response["items"])
            rows[name] = {
                "total": response["total"], "page_items": len(response["items"]),
                "response_bytes": len(json.dumps(response).encode()),
            }
        return {
            "synthetic": True, "tasks": task_count,
            "runs": 3 * (task_count - (task_count + 4) // 5), "samples": samples,
            "sqlite_version": sqlite3.sqlite_version,
            "provider_requests": 0, "user_database_accessed": False,
            "scenarios": {
                key: {
                    **rows[key],
                    "median_ms": round(statistics.median(values), 2),
                    "min_ms": round(min(values), 2), "max_ms": round(max(values), 2),
                } for key, values in elapsed.items()
            },
            "limits": [
                "In-process, local SQLite measurement; not HTTP/browser or a production load test.",
                "Text search and matching-row sorting are not constant-time or fully indexed.",
                "No claim of Intl.Collator, frontend adoption, or cross-page snapshot equivalence.",
            ],
        }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tasks", type=int, default=2000)
    parser.add_argument("--samples", type=int, default=3)
    arguments = parser.parse_args()
    if not 100 <= arguments.tasks <= 100000 or not 1 <= arguments.samples <= 9:
        parser.error("Use 100-100000 synthetic tasks and 1-9 samples")
    print(json.dumps(measure(arguments.tasks, arguments.samples), indent=2))
