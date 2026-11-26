"""Real Pi SDK through model/Run/coding APIs against an owned local mock."""

import json
import os
import time

from fastapi.testclient import TestClient
import pytest

from test_pi_provider import pi_mock_server
from test_workbench import post, run_body
from workbench.app import create_app
from workbench.config import Settings
from workbench.provider import ProviderRouter
import workbench.pi_provider as pi_module


@pytest.fixture
def real_sdk():
    if not pi_module.pi_sdk_available():
        if os.environ.get("MYBOT_REQUIRE_PI_RUNTIME") == "1":
            pytest.fail("The required Pi SDK runtime is missing")
        pytest.skip("Optional Pi runtime is absent; see runtime/pi/README.md")


def settled(client, run_id):
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        value = client.get(f"/api/runs/{run_id}").json()
        if value["run"]["status"] in {"succeeded", "failed", "canceled"}:
            return value
        time.sleep(0.02)
    raise AssertionError("Pi fixture run did not settle")


def configure(client, endpoint, files=None, model_name="mybot-pi-integration"):
    project = post(client, "/api/projects", {"name": "Pi SDK integration", "directory": "."}).json()
    model = post(client, "/api/models", {
        "kind": "pi_sdk", "name": "Pi fixture", "endpoint": endpoint,
        "model": model_name, "key_env": "",
    })
    assert model.status_code == 201, model.text
    task = post(client, "/api/tasks", {
        "project_id": project["id"], "title": "Pi isolated work",
        "goal": "Use only the explicit selected source and deliver verifiable work.",
        "acceptance": "Preserve original files and provide evidence.",
        "files": files or ["README.md"],
    }).json()
    return model.json(), task


def test_save_presence_and_explicit_test_have_separate_actual_request_counts(tmp_path, real_sdk):
    (tmp_path / "README.md").write_text("Explicit Pi fixture source")
    with pi_mock_server(lambda *_: {"text": "OK"}) as server:
        with TestClient(create_app(Settings(tmp_path / "data", tmp_path, poll_interval=0.01))) as client:
            model, task = configure(client, server.endpoint)
            bootstrap = client.get("/api/bootstrap").json()
            assert bootstrap["capabilities"]["pi_sdk"] is True
            assert bootstrap["models"][0]["kind"] == "pi_sdk"
            assert server.calls == []
            route = f"/api/models/{model['id']}/test"
            body = {"request_id": "pi-connection-original", "consent": True}
            assert post(client, route, {**body, "consent": False}).status_code == 422
            assert server.calls == []
            response = post(client, route, body)
            assert response.status_code == 200, response.text
            receipt = response.json()
            assert receipt["state"] == "succeeded" and receipt["status"] == "reachable"
            assert receipt["input_tokens"] == 11 and receipt["output_tokens"] == 7
            assert len(server.calls) == 1 and server.calls[0]["body"]["max_tokens"] == 16
            assert post(client, route, body).json() == receipt
            assert client.get(f"/api/models/{model['id']}/tests/{body['request_id']}").json() == receipt
            assert len(server.calls) == 1
            assert client.get("/api/bootstrap").json()["runs"] == []


def test_real_sdk_research_uses_one_call_authority_and_no_implicit_context(tmp_path, real_sdk):
    (tmp_path / "README.md").write_text("EXPLICIT_SELECTED_RESEARCH")
    (tmp_path / "AGENTS.md").write_text("PRIVATE_UNSELECTED_CONTEXT")

    def respond(body, _):
        prompt = body["messages"][-1]["content"]
        text = json.dumps({"tasks": [
            {"title": "Analyze explicit source", "objective": "Identify only supplied implementation facts"},
            {"title": "Review evidence gaps", "objective": "List unverified limits in the supplied source"},
        ]}) if "仅返回 JSON" in prompt else "Local Pi SDK research fixture; model quality is unverified."
        return {"text": text}

    with pi_mock_server(respond) as server:
        with TestClient(create_app(Settings(tmp_path / "data", tmp_path, poll_interval=0.01))) as client:
            model, task = configure(client, server.endpoint)
            snapshot = post(client, f"/api/tasks/{task['id']}/preview", {}).json()
            created = post(client, f"/api/tasks/{task['id']}/runs", run_body(
                {**model, "context_hash": snapshot["context_hash"]}, request_id="pi-research-original",
            ))
            assert created.status_code == 201, created.text
            result = settled(client, created.json()["id"])
            assert result["run"]["status"] == "succeeded", result["run"].get("error")
            assert len(result["calls"]) == len(server.calls) == 4
            assert result["run"]["context"]["models"][model["id"]]["kind"] == "pi_sdk"
            assert all(call["status"] == "succeeded" for call in result["calls"])
            assert all(call["error_detail"]["requests"] == 1 for call in result["calls"])
            assert all(call["error_detail"]["cache_read_tokens"] == 3 for call in result["calls"])
            assert sum(call["input_tokens"] + call["output_tokens"] for call in result["calls"]) == 72
            assert any(item["kind"] == "report" for item in result["artifacts"])
            sent = json.dumps(server.calls)
            assert "EXPLICIT_SELECTED_RESEARCH" in sent
            assert "PRIVATE_UNSELECTED_CONTEXT" not in sent
            assert all(not call["body"].get("tools") for call in server.calls)


def test_real_sdk_coding_json_actual_pytest_and_original_files_unchanged(tmp_path, real_sdk):
    (tmp_path / "README.md").write_text("Real isolated Pi SDK coding fixture")
    (tmp_path / "calculator.py").write_text("def add(a, b):\n    return a - b\n")
    (tmp_path / "test_calculator.py").write_text(
        "import pytest\nfrom calculator import add\n"
        "@pytest.mark.parametrize('a,b,expected', [(2,3,5), (-2,3,1)])\n"
        "def test_add(a,b,expected): assert add(a,b) == expected\n"
    )
    original = {name: (tmp_path / name).read_bytes() for name in (
        "README.md", "calculator.py", "test_calculator.py",
    )}

    def respond(body, _):
        request = json.loads(body["messages"][-1]["content"])
        return {"text": json.dumps({
            "summary": "Repair addition in the selected isolated source",
            "changes": [{
                "path": "calculator.py",
                "content": "def add(a, b):\n    return a * b\n" if request["round"] == 1
                else "def add(a, b):\n    return a + b\n",
            }],
        })}

    with pi_mock_server(respond) as server:
        with TestClient(create_app(Settings(tmp_path / "data", tmp_path, poll_interval=0.01))) as client:
            model, task = configure(client, server.endpoint, ["calculator.py", "test_calculator.py"])
            config = {
                "model_id": model["id"], "writable": ["calculator.py"],
                "tests": ["test_calculator.py"], "profile": "python-pytest",
                "max_rounds": 2, "test_timeout": 5, "max_output_tokens": 8192,
            }
            candidate = post(client, f"/api/tasks/{task['id']}/coding/preview", config)
            assert candidate.status_code == 200, candidate.text
            assert candidate.json()["snapshot"]["model"]["kind"] == "pi_sdk"
            prepared = post(client, f"/api/tasks/{task['id']}/coding/prepare", {
                **config, "request_id": "pi-coding-original",
                "preview_hash": candidate.json()["candidate_hash"],
            })
            assert prepared.status_code == 200, prepared.text
            job = prepared.json()
            assert server.calls == []
            path = f"/api/tasks/{task['id']}/coding/{job['request_id']}/execute"
            applied = post(client, path, {"candidate_hash": job["candidate_hash"], "consent": True})
            assert applied.status_code == 200, applied.text
            result = settled(client, applied.json()["run_id"])
            assert result["run"]["status"] == "succeeded", result["run"].get("error")
            tests = sorted(
                (json.loads(item["content"]) for item in result["artifacts"] if item["kind"] == "test_result"),
                key=lambda item: item["round"],
            )
            assert [item["passed"] for item in tests] == [False, False, True]
            assert [item["receipt"]["failures"] for item in tests] == [2, 2, 0]
            assert len(result["calls"]) == len(server.calls) == 2
            assert sum(call["input_tokens"] + call["output_tokens"] for call in result["calls"]) == 36
            assert all(call["body"]["max_tokens"] == 8192 for call in server.calls)
            assert all(item["profile"] == "python-pytest" for item in tests)
            assert any(item["kind"] == "diff" and "+    return a + b" in item["content"]
                       for item in result["artifacts"])
            for name, content in original.items():
                assert (tmp_path / name).read_bytes() == content
            assert client.get(f"/api/tasks/{task['id']}/coding/{job['request_id']}").json() == applied.json()
            assert len(server.calls) == 2


def test_unknown_pi_connection_test_reconciles_without_a_second_request(tmp_path, real_sdk):
    provider = ProviderRouter()
    complete = provider.pi.complete

    async def bounded(model, messages, max_tokens):
        return await complete({**model, "_timeout_seconds": 1}, messages, max_tokens)

    provider.pi.complete = bounded
    with pi_mock_server(lambda *_: {"text": "Late result", "delay": 2}) as server:
        with TestClient(create_app(Settings(tmp_path / "data", tmp_path), provider)) as client:
            model, _ = configure(client, server.endpoint)
            path = f"/api/models/{model['id']}/test"
            body = {"request_id": "pi-unknown-original", "consent": True}
            receipt = post(client, path, body).json()
            assert receipt["state"] == "unknown"
            assert receipt["status"] == "pi_sdk_timeout_outcome_unknown"
            assert len(server.calls) == 1
            assert client.get(f"/api/models/{model['id']}/tests/{body['request_id']}").json() == receipt
            assert post(client, path, body).json() == receipt
            assert len(server.calls) == 1


def test_missing_pi_runtime_is_not_chat_fallback_and_does_not_send(tmp_path, monkeypatch):
    monkeypatch.setattr(pi_module, "pi_sdk_available", lambda: False)
    with pi_mock_server() as server:
        with TestClient(create_app(Settings(tmp_path / "data", tmp_path))) as client:
            model, _ = configure(client, server.endpoint)
            assert client.get("/api/bootstrap").json()["capabilities"]["pi_sdk"] is False
            response = post(client, f"/api/models/{model['id']}/test", {
                "request_id": "pi-missing-runtime", "consent": True,
            })
            assert response.json()["state"] == "failed"
            assert response.json()["status"] == "pi_sdk_not_available"
            assert server.calls == []


@pytest.mark.parametrize("patch", [
    {"kind": "pi_cli"}, {"endpoint": "codex://local"},
    {"endpoint": "http://model.example/v1"}, {"key_env": "OPENAI_API_KEY"},
])
def test_pi_model_configuration_rejects_implicit_or_unscoped_sources(tmp_path, patch):
    with TestClient(create_app(Settings(tmp_path / "data", tmp_path))) as client:
        response = post(client, "/api/models", {
            "kind": "pi_sdk", "name": "Pi explicit", "endpoint": "https://model.example/v1",
            "model": "configured-model", "key_env": "", **patch,
        })
        assert response.status_code == 422
