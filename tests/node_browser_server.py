"""Disposable fixed node:test fixture; never imported by the production app."""

import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import sys
import threading

import uvicorn

from workbench.app import create_app
from workbench.config import Settings
from workbench.provider import ProviderError


TOKEN = "astryx-browser-fixture"
MODEL = "node-origin-fixture"
SOURCE_PATH = "frontend/scripts/api-proxy.ts"
SOURCE_FILE = "forwarded-origin.mjs"
TEST_FILE = "test_forwarded_origin.mjs"
SOURCE_SIGNATURE = (
    "export function forwardedOrigin(origin: string | undefined, "
    "host: string | undefined, target: string) {"
)
JS_SIGNATURE = "export function forwardedOrigin(origin, host, target) {"
ORIGINAL_RETURN = "    return new URL(target).origin"
PARTIAL_RETURN = (
    "    const destination = new URL(target)\n"
    "    if (destination.username || destination.password) return origin\n"
    "    return destination.origin"
)
FIXED_RETURN = (
    "    const destination = new URL(target)\n"
    "    if (destination.username || destination.password ||\n"
    "        !['http:', 'https:'].includes(destination.protocol) ||\n"
    "        destination.pathname !== '/' || destination.search || destination.hash) return origin\n"
    "    return destination.origin"
)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def extracted_source(repository):
    original = (repository / SOURCE_PATH).read_bytes()
    text = original.decode("utf-8")
    start = text.index(SOURCE_SIGNATURE)
    end = text.index("\n}\n\nexport function apiProxy", start) + 2
    function = text[start:end]
    if function.count(SOURCE_SIGNATURE) != 1 or function.count(ORIGINAL_RETURN) != 1:
        raise ValueError("The inspected forwardedOrigin source shape changed")
    extracted = function.replace(SOURCE_SIGNATURE, JS_SIGNATURE, 1) + "\n"
    header = (
        "// Test fixture: one function extracted from frontend/scripts/api-proxy.ts.\n"
        "// Only its TypeScript parameter annotations were removed; its body is unchanged.\n"
    )
    content = (header + extracted).encode("utf-8")
    return content, {
        "source_path": SOURCE_PATH, "source_sha256": digest(original),
        "source_function_sha256": digest(function.encode("utf-8")),
        "copy_sha256": digest(content),
        "method": "Extract forwardedOrigin; remove only its three parameter type annotations",
        "whole_module_executed": False,
    }


class NodeBrowserProvider:
    """Inject two bounded JSON responses; application execution remains real."""

    def __init__(self):
        self.calls = []
        self.lock = threading.Lock()

    async def complete(self, model, messages, max_tokens):
        if (
            model.get("model") != MODEL
            or model.get("kind", "chat_completions") != "chat_completions"
            or model.get("endpoint") != "http://127.0.0.1:9999/v1"
            or model.get("key_env", "")
        ):
            raise ProviderError("node_browser_fixture_model_denied")
        try:
            prompt = messages[-1]["content"]
            value = json.loads(prompt)
            source = next(item["content"] for item in value["files"] if item["path"] == SOURCE_FILE)
            number = value["round"]
            if number == 1 and type(number) is int:
                changed = source.replace(ORIGINAL_RETURN, PARTIAL_RETURN, 1)
            elif number == 2 and type(number) is int:
                changed = source.replace(PARTIAL_RETURN, FIXED_RETURN, 1)
            else:
                raise ValueError
            if changed == source:
                raise ValueError
            with self.lock:
                self.calls.append({
                    "model": model["model"], "round": number,
                    "max_output_tokens": max_tokens, "input_sha256": digest(prompt.encode()),
                    "source_sha256": digest(source.encode()),
                })
            return {
                "text": json.dumps({
                    "summary": "Validate the configured proxy target without weakening foreign-origin rejection.",
                    "changes": [{"path": SOURCE_FILE, "content": changed}],
                }),
                "model": model["model"], "input_tokens": 100, "output_tokens": 100,
                "truncated": False,
            }
        except (KeyError, ValueError, TypeError, StopIteration) as error:
            raise ProviderError("node_browser_fixture_request_invalid") from error


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
            raise ValueError("The Node browser fixture root must be newly empty")
    else:
        root.mkdir(mode=0o700)
    root.chmod(0o700)
    workspace = root / "workspace"
    workspace.mkdir(mode=0o700)
    repository = Path(__file__).resolve().parents[1]
    source, extraction = extracted_source(repository)
    (workspace / SOURCE_FILE).write_bytes(source)
    shutil.copyfile(repository / "tests/fixtures/node_forwarded_origin_case.mjs", workspace / TEST_FILE)
    marker = root / ".node-browser-fixture.json"
    marker.write_text(json.dumps(extraction), encoding="utf-8")
    marker.chmod(0o600)
    initial = {
        name: digest((workspace / name).read_bytes()) for name in (SOURCE_FILE, TEST_FILE)
    }
    provider = NodeBrowserProvider()
    app = create_app(Settings(root / "data", workspace, poll_interval=0.01, access_token=TOKEN), provider)
    app.state.node_fixture_provider = provider

    @app.get("/fixture/status")
    def fixture_status():
        with provider.lock:
            calls = list(provider.calls)
        return {
            "fixture": True, "profile": "node-test", "model_calls": len(calls), "calls": calls,
            "source_extraction": extraction, "initial_hashes": initial,
            "current_hashes": {
                name: digest((workspace / name).read_bytes()) for name in (SOURCE_FILE, TEST_FILE)
            },
            "fixture_writes": [],
        }

    return app


def main(arguments):
    if len(arguments) != 3:
        raise ValueError("Usage: node_browser_server.py FRESH_TMP_ROOT PORT astryx-browser-fixture")
    root, port, token = Path(arguments[0]), int(arguments[1]), arguments[2]
    uvicorn.run(make_fixture(root, port, token), host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main(sys.argv[1:])
