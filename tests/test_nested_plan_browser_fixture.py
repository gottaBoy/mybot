import asyncio
from pathlib import Path
import tempfile

from fastapi.testclient import TestClient
import pytest

from nested_plan_browser_server import (
    MODEL, SOURCE_CONTENT, SOURCE_FILE, TOKEN, NestedPlanBrowserProvider, make_fixture,
)
from test_workbench import post, run_body, wait_status
from workbench.provider import ProviderError


def model(**changes):
    return {
        "model": MODEL, "kind": "chat_completions",
        "endpoint": "http://127.0.0.1:9999/v1", "key_env": "", **changes,
    }


def test_fixture_creates_no_product_work_and_status_reads_are_read_only():
    with tempfile.TemporaryDirectory(prefix="mybot-astryx-workbench.", dir="/tmp") as directory:
        root = Path(directory)
        app = make_fixture(root, 4197, TOKEN)
        with TestClient(app, follow_redirects=False) as client:
            source = root / "workspace" / SOURCE_FILE
            before = source.read_bytes()
            first = client.get("/fixture/status").json()
            second = client.get("/fixture/status").json()
            assert first == second
            assert first["fixture"] is True and first["model_calls"] == 0
            assert set(first["counts"].values()) == {0}
            assert first["initial_hashes"] == first["current_hashes"]
            assert first["fixture_writes"] == []
            assert before.decode() == SOURCE_CONTENT
            assert source.read_bytes() == before
            assert source.stat().st_mode & 0o222 == 0
            assert client.get("/api/bootstrap").status_code == 401
            assert client.post("/fixture/status").status_code == 405
            assert client.post("/fixture/advance-current").status_code == 404
        with pytest.raises(ValueError, match="newly empty"):
            make_fixture(root, 4197, TOKEN)


@pytest.mark.parametrize("port,token", [
    (4180, TOKEN), (5173, TOKEN), (4197, "incorrect"), (80, TOKEN),
])
def test_fixture_rejects_primary_ports_and_unapproved_token_before_writing(port, token):
    with tempfile.TemporaryDirectory(prefix="mybot-astryx-workbench.", dir="/tmp") as directory:
        root = Path(directory)
        with pytest.raises(ValueError):
            make_fixture(root, port, token)
        assert list(root.iterdir()) == []


def test_fixture_rejects_a_symlink_without_touching_its_target(tmp_path):
    with tempfile.TemporaryDirectory(prefix="mybot-astryx-workbench.", dir="/tmp") as directory:
        root = Path(directory)
        target = tmp_path / "target"
        target.mkdir()
        root.rmdir()
        root.symlink_to(target, target_is_directory=True)
        try:
            with pytest.raises(ValueError):
                make_fixture(root, 4197, TOKEN)
            assert list(target.iterdir()) == []
        finally:
            root.unlink()


def test_fixture_model_is_deterministic_text_and_status_contains_only_input_digests():
    provider = NestedPlanBrowserProvider()
    messages = [{"role": "user", "content": "Analyze this explicit source without performing tests."}]
    first = asyncio.run(provider.complete(model(), messages, 1000))
    second = asyncio.run(provider.complete(model(), messages, 1000))
    assert first == second
    assert isinstance(first["text"], str) and first["truncated"] is False
    assert provider.requests == [(MODEL, messages), (MODEL, messages)]
    assert len(provider.calls) == 2 and provider.calls[0] == provider.calls[1]
    assert len(provider.calls[0]["input_sha256"]) == 64
    assert "content" not in provider.calls[0]


def test_fixture_runs_only_after_explicit_api_consent_and_keeps_its_source_unchanged():
    with tempfile.TemporaryDirectory(prefix="mybot-astryx-workbench.", dir="/tmp") as directory:
        app = make_fixture(Path(directory), 4197, TOKEN)
        with TestClient(app, follow_redirects=False) as client:
            assert post(client, "/api/auth", {"token": TOKEN}).status_code == 200
            project = post(client, "/api/projects", {"name": "Nested fixture", "directory": "."}).json()
            saved_model = post(client, "/api/models", {
                "name": "Nested fixture", "model": MODEL,
                "endpoint": "http://127.0.0.1:9999/v1", "key_env": "",
            }).json()
            task = post(client, "/api/tasks", {
                "project_id": project["id"], "title": "Read explicit fixture source",
                "goal": "Analyze this explicit source and record the remaining unknowns.",
                "acceptance": "A source report receives explicit human acceptance.",
                "files": [SOURCE_FILE],
            }).json()
            before = client.get("/fixture/status").json()
            assert before["model_calls"] == before["counts"]["runs"] == 0
            preview = post(client, f"/api/tasks/{task['id']}/preview", {}).json()
            assert client.get("/fixture/status").json()["model_calls"] == 0
            response = post(client, f"/api/tasks/{task['id']}/runs", run_body(
                {**saved_model, "context_hash": preview["context_hash"]},
                request_id="nested-fixture-explicit-run",
            ))
            assert response.status_code == 201, response.text
            detail = wait_status(client, response.json()["id"], {"succeeded", "failed"})
            assert detail["run"]["status"] == "succeeded", detail["run"]["error"]
            assert len(detail["calls"]) == 4
            assert all(item["decision"] != "accepted" for item in detail["artifacts"])
            after = client.get("/fixture/status").json()
            assert after["model_calls"] == after["counts"]["calls"] == 4
            assert after["counts"]["tasks"] == after["counts"]["runs"] == 1
            assert after["initial_hashes"] == after["current_hashes"] == before["initial_hashes"]
            assert after["fixture_writes"] == []


@pytest.mark.parametrize("changes", [
    {"model": "real-model"}, {"kind": "pi_sdk"},
    {"endpoint": "https://provider.example/v1"}, {"key_env": "REAL_API_KEY"},
])
def test_fixture_denies_unapproved_model_without_creating_a_call(changes):
    provider = NestedPlanBrowserProvider()
    with pytest.raises(ProviderError, match="nested_plan_browser_fixture_model_denied"):
        asyncio.run(provider.complete(model(**changes), [{"role": "user", "content": "Research"}], 1000))
    assert provider.calls == provider.requests == []


@pytest.mark.parametrize("messages,max_tokens", [
    ([], 1000), ([{"role": "user", "content": None}], 1000),
    ([{"role": "user", "content": "Research"}], True),
])
def test_fixture_rejects_malformed_input_without_creating_a_call(messages, max_tokens):
    provider = NestedPlanBrowserProvider()
    with pytest.raises(ProviderError, match="nested_plan_browser_fixture_request_invalid"):
        asyncio.run(provider.complete(model(), messages, max_tokens))
    assert provider.calls == provider.requests == []
