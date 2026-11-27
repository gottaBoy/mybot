"""Disposable code-baseline browser fixture; no original-project writes."""

import asyncio
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import sys
import threading

from fastapi import HTTPException, Request
import uvicorn

from workbench.app import create_app
from workbench.config import Settings
from workbench.provider import ProviderError


TOKEN = "astryx-browser-fixture"
MARKER = "mybot-explicit-code-reconciliation-browser-fixture-v1"
MAINTENANCE = "# Current project maintenance marker\n"
BASELINE_V1 = 'BASELINE_NOTE = "source-baseline-v1"\n'
BASELINE_V2 = 'BASELINE_NOTE = "current-baseline-v2"\n'
ADDED_TEST = (
    "\n\nfrom baseline_info import BASELINE_NOTE\n\n\n"
    "def test_retains_current_readonly_dependency():\n"
    '    assert BASELINE_NOTE == "current-baseline-v2"\n'
)
FILES = (
    "workbench/__init__.py", "workbench/schemas.py", "workbench/saved_views.py",
    "baseline_info.py", "test_relative_path.py",
)
MODELS = {
    "reconciliation-partial-fixture",
    "reconciliation-repair-fixture",
    "reconciliation-annotate-fixture",
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class ReconciliationProvider:
    """Injected text only; trusted application code performs actual tests."""

    def __init__(self):
        self.calls = []
        self.lock = threading.Lock()

    async def complete(self, model, messages, max_tokens):
        if (
            model.get("model") not in MODELS
            or model.get("kind", "chat_completions") != "chat_completions"
            or model.get("endpoint") != "http://127.0.0.1:9999/v1"
            or model.get("key_env", "")
        ):
            raise ProviderError("reconciliation_fixture_model_denied")
        try:
            request = json.loads(messages[-1]["content"])
            source = next(
                item["content"] for item in request["files"]
                if item["path"] == "workbench/schemas.py"
            )
            number = request["round"]
            if type(number) is not int or not 1 <= number <= 3:
                raise ValueError
            if model["model"] == "reconciliation-partial-fixture":
                if number != 1:
                    raise ValueError
                changed = source.replace(
                    'if ' + r'"\\" in value or ',
                    'if ' + r'"\n" in value or ' + r'"\\" in value or ', 1,
                )
            elif model["model"] == "reconciliation-repair-fixture":
                partial = 'if ' + r'"\n" in value or ' + r'"\\" in value or '
                original = 'if ' + r'"\\" in value or '
                fixed = 'if any(ord(char) < 32 for char in value) or ' + r'"\\" in value or '
                changed = source.replace(partial if partial in source else original, fixed, 1)
            else:
                changed = "# Continued from the current project anchor.\n" + source
            if changed == source:
                raise ValueError
            with self.lock:
                self.calls.append({
                    "model": model["model"], "round": number, "max_output_tokens": max_tokens,
                    "input_hash": hashlib.sha256(messages[-1]["content"].encode()).hexdigest(),
                    "file_hashes": {
                        item["path"]: hashlib.sha256(item["content"].encode()).hexdigest()
                        for item in request["files"]
                    },
                    "source_checkpoint_fields": sorted(request.get("source_checkpoint", {})),
                })
            return {
                "text": json.dumps({
                    "summary": "Preserve the reviewed baseline and reject path control characters.",
                    "changes": [{"path": "workbench/schemas.py", "content": changed}],
                }),
                "model": model["model"], "input_tokens": 100, "output_tokens": 100,
                "truncated": False,
            }
        except (KeyError, ValueError, TypeError, StopIteration) as error:
            raise ProviderError("reconciliation_fixture_request_invalid") from error


def make_fixture(root, port, token):
    if (
        root.parent != Path("/tmp")
        or not re.fullmatch(r"mybot-astryx-workbench\.[A-Za-z0-9_-]+", root.name)
        or root.is_symlink() or root.resolve() != root or token != TOKEN
        or not 1024 <= port <= 65535 or port in {4180, 5173}
    ):
        raise ValueError("Only a fresh disposable loopback fixture and fixed token are admitted")
    if root.exists():
        if not root.is_dir() or root.stat().st_uid != os.getuid() or any(root.iterdir()):
            raise ValueError("The reconciliation browser fixture root must be newly empty")
    else:
        root.mkdir(mode=0o700)
    root.chmod(0o700)
    marker = root / ".reconciliation-browser-fixture"
    marker.write_text(MARKER, encoding="ascii")
    marker.chmod(0o600)
    workspace = root / "workspace"
    workspace.mkdir(mode=0o700)
    (workspace / "workbench").mkdir()
    repository = Path(__file__).resolve().parents[1]
    for name in ("__init__.py", "schemas.py", "saved_views.py"):
        shutil.copyfile(repository / "workbench" / name, workspace / "workbench" / name)
    shutil.copyfile(repository / "tests/fixtures/coding_pytest_case.py", workspace / "test_relative_path.py")
    (workspace / "baseline_info.py").write_text(BASELINE_V1, encoding="utf-8")
    initial = {name: digest(workspace / name) for name in FILES}
    provider = ReconciliationProvider()
    settings = Settings(root / "data", workspace, poll_interval=0.01, access_token=TOKEN)
    app = create_app(settings, provider)
    advanced = False
    fixture_writes = []
    advance_lock = asyncio.Lock()

    def fixture_valid():
        try:
            return (
                not root.is_symlink() and root.resolve() == root
                and marker.is_file() and not marker.is_symlink()
                and marker.read_text(encoding="ascii") == MARKER
                and not workspace.is_symlink()
                and all((workspace / name).is_file() and not (workspace / name).is_symlink() for name in FILES)
            )
        except OSError:
            return False

    @app.get("/fixture/status")
    def fixture_status():
        if not fixture_valid():
            raise HTTPException(409, "Fixture source unavailable")
        with provider.lock:
            calls = list(provider.calls)
        return {
            "fixture": True, "advanced": advanced, "model_calls": len(calls), "calls": calls,
            "initial_hashes": initial,
            "current_hashes": {name: digest(workspace / name) for name in FILES},
            "fixture_writes": list(fixture_writes),
        }

    @app.post("/fixture/advance-current")
    async def advance_current(request: Request):
        nonlocal advanced
        try:
            loopback = ipaddress.ip_address(request.client.host).is_loopback
        except ValueError:
            loopback = request.client.host == "testclient"
        if (
            not loopback or request.query_params
            or not secrets.compare_digest(request.headers.get("x-mybot-fixture-token", ""), TOKEN)
            or request.headers.get("x-workbench-request") != "1"
            or request.headers.get("origin") not in {None, f"http://127.0.0.1:{port}"}
            or await request.body()
        ):
            raise HTTPException(403, "Fixed fixture mutation rejected")
        async with advance_lock:
            if advanced or not fixture_valid():
                raise HTTPException(409, "Fixture baseline already advanced or unavailable")
            if {name: digest(workspace / name) for name in FILES} != initial:
                raise HTTPException(409, "Fixture source changed outside its fixed operation")
            runs = app.state.store.list("runs")
            if len(runs) != 1 or runs[0]["status"] != "failed" or len(provider.calls) != 1:
                raise HTTPException(409, "Finish the one-call partial source Run before advancing")
            with app.state.store.transaction() as db:
                if db.execute("SELECT 1 FROM coding_jobs WHERE state='prepared'").fetchone():
                    raise HTTPException(409, "A prepared coding candidate blocks fixture advance")
            before = {name: digest(workspace / name) for name in FILES}
            source_path = workspace / "workbench/schemas.py"
            source = source_path.read_text(encoding="utf-8")
            source_path.write_text(MAINTENANCE + source, encoding="utf-8")
            (workspace / "baseline_info.py").write_text(BASELINE_V2, encoding="utf-8")
            tests = workspace / "test_relative_path.py"
            tests.write_text(tests.read_text(encoding="utf-8") + ADDED_TEST, encoding="utf-8")
            advanced = True
            fixture_writes.append({
                "kind": "advance-current", "paths": [
                    "workbench/schemas.py", "baseline_info.py", "test_relative_path.py",
                ],
                "before": before, "after": {name: digest(workspace / name) for name in FILES},
            })
            return fixture_status()

    return app


def main(arguments):
    if len(arguments) != 3:
        raise ValueError("Usage: reconciliation_browser_server.py FRESH_TMP_ROOT PORT astryx-browser-fixture")
    root, port, token = Path(arguments[0]), int(arguments[1]), arguments[2]
    uvicorn.run(make_fixture(root, port, token), host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main(sys.argv[1:])
