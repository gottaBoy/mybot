"""Disposable nested-plan fixture; never imported by the production app."""

from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import sys
import threading

import uvicorn

from test_workbench import FakeProvider
from workbench.app import create_app
from workbench.config import Settings
from workbench.provider import ProviderError


TOKEN = "astryx-browser-fixture"
MODEL = "nested-plan-fixture"
SOURCE_FILE = "README.md"
SOURCE_CONTENT = (
    "# Nested task plan acceptance\n"
    "This disposable source supports explicit research, integration, and review.\n"
    "Its contents are not modified by planning or research execution.\n"
)
TABLES = {
    "tasks": "tasks",
    "runs": "runs",
    "calls": "calls",
    "artifacts": "artifacts",
    "plans": "task_plans",
    "plan_versions": "task_plan_versions",
    "nested_roots": "task_plan_nested_roots",
}


def digest(value):
    return hashlib.sha256(value).hexdigest()


class NestedPlanBrowserProvider(FakeProvider):
    """Deterministic research text; no transport, source write or plan mutation."""

    def __init__(self):
        super().__init__(delay=0.03)
        self.calls = []
        self.lock = threading.Lock()

    async def complete(self, model, messages, max_tokens):
        if (
            model.get("model") != MODEL
            or model.get("kind", "chat_completions") != "chat_completions"
            or model.get("endpoint") != "http://127.0.0.1:9999/v1"
            or model.get("key_env", "")
        ):
            raise ProviderError("nested_plan_browser_fixture_model_denied")
        if (
            not isinstance(messages, list) or not messages
            or any(not isinstance(item, dict) or not isinstance(item.get("content"), str)
                   for item in messages)
            or type(max_tokens) is not int or max_tokens < 1
        ):
            raise ProviderError("nested_plan_browser_fixture_request_invalid")
        result = await super().complete(model, messages, max_tokens)
        with self.lock:
            self.calls.append({
                "model": model["model"], "max_output_tokens": max_tokens,
                "message_count": len(messages),
                "input_sha256": digest(json.dumps(
                    messages, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
                ).encode("utf-8")),
            })
        return result


def make_fixture(root, port, token):
    if (
        root.parent != Path("/tmp")
        or not re.fullmatch(r"mybot-astryx-workbench\.[A-Za-z0-9_-]+", root.name)
        or root.is_symlink() or root.resolve() != root
        or not secrets.compare_digest(token, TOKEN)
        or not 1024 <= port <= 65535 or port in {4180, 5173}
    ):
        raise ValueError("Only a fresh disposable loopback fixture and fixed token are admitted")
    if root.exists():
        if not root.is_dir() or root.stat().st_uid != os.getuid() or any(root.iterdir()):
            raise ValueError("The nested-plan browser fixture root must be newly empty")
    else:
        root.mkdir(mode=0o700)
    root.chmod(0o700)
    workspace = root / "workspace"
    workspace.mkdir(mode=0o700)
    source = workspace / SOURCE_FILE
    source.write_text(SOURCE_CONTENT, encoding="utf-8")
    source.chmod(0o400)
    initial = {SOURCE_FILE: digest(source.read_bytes())}
    provider = NestedPlanBrowserProvider()
    app = create_app(Settings(root / "data", workspace, poll_interval=0.01, access_token=TOKEN), provider)
    app.state.nested_plan_fixture_provider = provider

    @app.get("/fixture/status")
    def fixture_status():
        with provider.lock:
            calls = list(provider.calls)
        with closing(sqlite3.connect(
            app.state.store.path.resolve().as_uri() + "?mode=ro", uri=True, timeout=10,
        )) as db:
            db.execute("PRAGMA query_only=ON")
            db.execute("BEGIN")
            counts = {
                key: db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                for key, table in TABLES.items()
            }
        return {
            "fixture": True, "model_generation": "Deterministic FakeProvider; no paid provider",
            "actual_execution": "Application HTTP, SQLite, explicit Runs and human report decisions",
            "model_calls": len(calls), "calls": calls, "counts": counts,
            "initial_hashes": initial, "current_hashes": {SOURCE_FILE: digest(source.read_bytes())},
            "fixture_writes": [],
        }

    return app


def main(arguments):
    if len(arguments) != 3:
        raise ValueError("Usage: nested_plan_browser_server.py FRESH_TMP_ROOT PORT astryx-browser-fixture")
    root, port, token = Path(arguments[0]), int(arguments[1]), arguments[2]
    uvicorn.run(make_fixture(root, port, token), host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main(sys.argv[1:])
