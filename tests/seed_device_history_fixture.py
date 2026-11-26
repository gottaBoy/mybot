"""Only seed an explicitly empty, marked browser fixture through the existing guard."""
import argparse
import json
import sqlite3
from pathlib import Path

from seed_project_references_fixture import seed


def seed_history(directory):
    result = seed(directory)
    path = Path(result["database"])
    with sqlite3.connect(path) as db:
        for number in (0, 44):
            db.execute(
                "INSERT INTO artifacts(id,run_id,agent_id,title,kind,content,created_at)"
                " VALUES(?,?,NULL,?,'report',?,?)",
                (f"history-report-{number}", f"reference-run-000-0-{number:03}",
                 f"Historical report {number}",
                 f"Original report for run {number}. No real provider was called.",
                 "2026-11-24T00:00:00Z"),
            )
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("fixture_directory")
    print(json.dumps(seed_history(parser.parse_args().fixture_directory), sort_keys=True))
