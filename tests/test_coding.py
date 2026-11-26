import asyncio
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from test_workbench import FakeProvider, post, seed, wait_status, run_body
from workbench.app import create_app
from workbench.coding_runner import CodingError, PythonTestRunner
from workbench.config import Settings


class CodingProvider(FakeProvider):
    def __init__(self, invalid=False, outside=False):
        super().__init__()
        self.invalid, self.outside = invalid, outside

    async def complete(self, model, messages, max_tokens):
        self.requests.append((model, messages, max_tokens))
        request = json.loads(messages[-1]["content"])
        text = "not json" if self.invalid else json.dumps({
            "summary": "Fix addition and verify the immutable tests",
            "changes": [{
                "path": "test_calculator.py" if self.outside else "calculator.py",
                "content": "def add(a, b):\n    return a * b\n" if request["round"] == 1 else "def add(a, b):\n    return a + b\n",
            }],
        })
        return {"text": text, "model": model["model"], "input_tokens": 20, "output_tokens": 30, "truncated": False}


@pytest.fixture
def coding_case(tmp_path):
    workspace = tmp_path / "source"
    workspace.mkdir()
    (workspace / "README.md").write_text("Explicit coding fixture")
    (workspace / "calculator.py").write_text("def add(a, b):\n    return a - b\n")
    (workspace / "test_calculator.py").write_text(
        "import unittest\nfrom calculator import add\n"
        "class AdditionTests(unittest.TestCase):\n"
        "    def test_positive(self): self.assertEqual(add(2, 3), 5)\n"
        "    def test_negative(self): self.assertEqual(add(-2, 3), 1)\n"
    )
    provider = CodingProvider()
    app = create_app(Settings(tmp_path / "data", workspace, poll_interval=0.01), provider)
    with TestClient(app) as client:
        project, model, _ = seed(client)
        task = post(client, "/api/tasks", {
            "project_id": project["id"], "title": "Implement addition", "goal": "Correct the implementation of add",
            "files": ["calculator.py", "test_calculator.py"],
        }).json()
        config = {
            "model_id": model["id"], "writable": ["calculator.py"], "tests": ["test_calculator.py"],
            "max_rounds": 2, "test_timeout": 5, "max_output_tokens": 8192,
        }
        yield client, app, provider, workspace, model, task, config


def prepared(case, request_id="coding-request-original"):
    client, _, _, _, _, task, config = case
    preview = post(client, f"/api/tasks/{task['id']}/coding/preview", config)
    assert preview.status_code == 200, preview.text
    response = post(client, f"/api/tasks/{task['id']}/coding/prepare", {
        **config, "request_id": request_id, "preview_hash": preview.json()["candidate_hash"],
    })
    assert response.status_code == 200, response.text
    return response.json()


def execute(case, job, consent=True):
    return post(case[0], f"/api/tasks/{case[5]['id']}/coding/{job['request_id']}/execute", {
        "candidate_hash": job["candidate_hash"], "consent": consent,
    })


def test_real_fail_modify_fail_repair_pass_diff_and_original_unchanged(coding_case):
    client, app, provider, workspace, model, task, config = coding_case
    before = {p.name: p.read_bytes() for p in workspace.iterdir()}
    job = prepared(coding_case)
    assert provider.requests == [] and client.get("/api/bootstrap").json()["runs"] == []
    assert execute(coding_case, job, consent=False).status_code == 422
    applied = execute(coding_case, job)
    assert applied.status_code == 200, applied.text
    run_id = applied.json()["run_id"]
    value = wait_status(client, run_id, {"failed", "succeeded"})
    assert value["run"]["status"] == "succeeded", value
    assert value["harness"]["id"] == "isolated-coding"
    assert value["harness"]["supports_resume"] is False
    assert [stage["key"] for stage in value["harness"]["stages"]] == [
        "test-0", "implement-1", "test-1", "implement-2", "test-2",
    ]
    assert len(provider.requests) == len(value["calls"]) == 2
    tests = sorted([json.loads(a["content"]) for a in value["artifacts"] if a["kind"] == "test_result"], key=lambda test: test["round"])
    assert [t["passed"] for t in tests] == [False, False, True]
    assert [t["tests_run"] for t in tests] == [2, 2, 2]
    assert tests[-1]["exit_code"] == 0
    assert tests[-1]["command"][1:3] == ["-I", "-B"]
    diffs = [a["content"] for a in value["artifacts"] if a["kind"] == "diff"]
    assert "-    return a - b" in diffs[0] and "+    return a + b" in diffs[0]
    assert {p.name: p.read_bytes() for p in workspace.iterdir()} == before
    assert execute(coding_case, job).json()["run_id"] == run_id
    assert len(client.get("/api/bootstrap").json()["runs"]) == 1
    second_input = json.loads(provider.requests[1][1][-1]["content"])
    assert second_input["previous_test"]["passed"] is False
    assert "AssertionError" in second_input["previous_test"]["output"]
    assert post(client, f"/api/runs/{run_id}/resume", {"acknowledge_replay": True}).status_code == 409


@pytest.mark.parametrize("patch", [
    {"writable": ["test_calculator.py"]}, {"tests": ["calculator.py"]},
    {"writable": ["../outside.py"]}, {"writable": ["missing.py"]},
    {"tests": []}, {"max_rounds": 4}, {"test_timeout": 16}, {"max_rounds": True},
    {"writable": ["calculator.py", "calculator.py"]}, {"extra": "forbidden"},
])
def test_strict_scope_and_limits_reject_before_provider(coding_case, patch):
    client, _, provider, _, _, task, config = coding_case
    response = post(client, f"/api/tasks/{task['id']}/coding/preview", {**config, **patch})
    assert response.status_code == 422, response.text
    assert provider.requests == []


def test_prepared_locks_research_and_can_be_explicitly_discarded(coding_case):
    client, _, provider, _, model, task, config = coding_case
    job = prepared(coding_case)
    preview = post(client, f"/api/tasks/{task['id']}/preview", {}).json()
    assert post(client, f"/api/tasks/{task['id']}/runs", run_body(model, context_hash=preview["context_hash"])).status_code == 409
    endpoint = f"/api/tasks/{task['id']}/coding/{job['request_id']}/discard"
    assert post(client, endpoint, {"candidate_hash": job["candidate_hash"], "consent": True}).json()["state"] == "discarded"
    assert execute(coding_case, job).status_code == 409
    assert provider.requests == []


def test_changed_source_or_model_invalidates_preview(coding_case):
    client, app, provider, workspace, model, task, config = coding_case
    preview = post(client, f"/api/tasks/{task['id']}/coding/preview", config).json()
    (workspace / "calculator.py").write_text("def add(a,b): return 0\n")
    response = post(client, f"/api/tasks/{task['id']}/coding/prepare", {
        **config, "request_id": "stale-source-coding", "preview_hash": preview["candidate_hash"],
    })
    assert response.status_code == 409
    job = prepared(coding_case)
    with app.state.store.transaction() as db:
        db.execute("UPDATE models SET model='changed' WHERE id=?", (model["id"],))
    assert execute(coding_case, job).status_code == 409
    assert provider.requests == []


@pytest.mark.parametrize("mode", ["invalid", "outside"])
def test_invalid_or_test_rewriting_output_cannot_be_applied(coding_case, mode):
    client, app, provider, workspace, *_ = coding_case
    setattr(provider, mode, True)
    job = prepared(coding_case)
    run_id = execute(coding_case, job).json()["run_id"]
    value = wait_status(client, run_id, {"failed"})
    assert value["run"]["error"] == "coding_output_invalid"
    assert not any(item["kind"] == "diff" for item in value["artifacts"])
    assert len(provider.requests) == 1
    assert "return a - b" in (workspace / "calculator.py").read_text()


def test_no_tests_or_missing_runner_receipt_never_counts_as_pass(coding_case):
    client, app, provider, workspace, *_ = coding_case
    (workspace / "test_calculator.py").write_text("import unittest\n")
    job = prepared(coding_case)
    run_id = execute(coding_case, job).json()["run_id"]
    value = wait_status(client, run_id, {"failed"})
    assert value["run"]["error"] == "coding_test_runner_unverified"
    assert provider.requests == []


def test_real_sandbox_negative_probes_and_readonly_source(tmp_path):
    runner = PythonTestRunner()
    assert asyncio.run(runner.probe())["available"] is True
    (tmp_path / "test_confined.py").write_text(
        "import unittest, socket, os, ctypes, errno\nfrom pathlib import Path\n"
        "class Boundaries(unittest.TestCase):\n"
        "    def test_socket(self):\n"
        "        with self.assertRaises(PermissionError): socket.socket()\n"
        "    def test_write(self):\n"
        "        with self.assertRaises(PermissionError): Path('test_confined.py').write_text('changed')\n"
        "    def test_fork(self):\n"
        "        with self.assertRaises(PermissionError): os.fork()\n"
        "    def test_shared_memory(self):\n"
        "        libc=ctypes.CDLL(None,use_errno=True)\n"
        "        self.assertEqual(libc.shmget(0,4096,0o1600),-1)\n"
        "        self.assertEqual(ctypes.get_errno(),errno.EPERM)\n"
    )
    result = asyncio.run(runner.run(tmp_path, ["test_confined.py"]))
    assert result["passed"] and result["tests_run"] == 4, result


@pytest.mark.parametrize("content", [
    "while True: pass\n",
    "print('x' * 100000)\nwhile True: pass\n",
])
def test_real_timeout_and_output_limit_reap_process_without_passing(tmp_path, content):
    (tmp_path / "test_limit.py").write_text(content)
    result = asyncio.run(PythonTestRunner().run(tmp_path, ["test_limit.py"], 1))
    assert not result["passed"] and result["exit_code"] != 0
    assert result["timed_out"] or result["truncated"]
    assert len(result["output"].encode()) <= 32768


def test_unavailable_sandbox_blocks_before_provider(coding_case, monkeypatch):
    client, app, provider, _, _, task, config = coding_case
    async def unavailable():
        raise CodingError("coding_sandbox_unavailable", 422)
    monkeypatch.setattr(app.state.engine.coding.runner, "probe", unavailable)
    response = post(client, f"/api/tasks/{task['id']}/coding/preview", config)
    assert response.status_code == 422 and provider.requests == []


def test_all_skipped_is_not_a_verified_run(coding_case):
    client, app, provider, workspace, *_ = coding_case
    (workspace / "check_calculator.py").write_text(
        "import unittest\nclass Skipped(unittest.TestCase):\n"
        "    @unittest.skip('no validation')\n    def test_nothing(self): pass\n"
    )
    task, config = coding_case[5], coding_case[6]
    config["tests"] = ["check_calculator.py"]
    with app.state.store.transaction() as db:
        db.execute("UPDATE tasks SET files=? WHERE id=?", (json.dumps(["calculator.py", "check_calculator.py"]), task["id"]))
    job = prepared(coding_case)
    value = wait_status(client, execute(coding_case, job).json()["run_id"], {"failed"})
    assert value["run"]["error"] == "coding_test_runner_unverified"
    assert provider.requests == []
