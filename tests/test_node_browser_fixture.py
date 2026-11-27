import asyncio
import json
from pathlib import Path
import tempfile

from fastapi.testclient import TestClient
import pytest

from node_browser_server import (
    FIXED_RETURN, JS_SIGNATURE, MODEL, ORIGINAL_RETURN, PARTIAL_RETURN,
    SOURCE_FILE, SOURCE_PATH, SOURCE_SIGNATURE, TEST_FILE, TOKEN,
    NodeBrowserProvider, extracted_source, make_fixture,
)
from workbench.provider import ProviderError


def test_fixture_extracts_one_real_function_and_changes_only_its_signature():
    repository = Path(__file__).resolve().parents[1]
    source = (repository / SOURCE_PATH).read_text()
    copied, metadata = extracted_source(repository)
    function = source[source.index(SOURCE_SIGNATURE):source.index("\n}\n\nexport function apiProxy") + 2]
    assert copied.decode().endswith(function.replace(SOURCE_SIGNATURE, JS_SIGNATURE, 1) + "\n")
    assert metadata["whole_module_executed"] is False
    assert metadata["source_path"] == "frontend/scripts/api-proxy.ts"
    assert len(metadata["source_sha256"]) == len(metadata["copy_sha256"]) == 64
    assert ORIGINAL_RETURN.encode() in copied


def test_fixture_materialization_uses_only_a_new_disposable_store():
    with tempfile.TemporaryDirectory(prefix="mybot-astryx-workbench.", dir="/tmp") as directory:
        root = Path(directory)
        app = make_fixture(root, 4197, TOKEN)
        with TestClient(app, follow_redirects=False) as client:
            value = client.get("/fixture/status").json()
            assert value["model_calls"] == 0
            assert value["profile"] == "node-test"
            assert value["initial_hashes"] == value["current_hashes"]
            assert value["fixture_writes"] == []
            assert set(value["initial_hashes"]) == {SOURCE_FILE, TEST_FILE}
            assert client.get("/api/bootstrap").status_code == 401
            assert client.post("/fixture/advance-current").status_code == 404
            assert app.state.store.list("runs") == []
        with pytest.raises(ValueError, match="newly empty"):
            make_fixture(root, 4197, TOKEN)


@pytest.mark.parametrize("port,token", [(4180, TOKEN), (5173, TOKEN), (4197, "incorrect")])
def test_fixture_rejects_primary_ports_and_unapproved_token(port, token):
    with tempfile.TemporaryDirectory(prefix="mybot-astryx-workbench.", dir="/tmp") as directory:
        with pytest.raises(ValueError):
            make_fixture(Path(directory), port, token)
        assert list(Path(directory).iterdir()) == []


def test_fixture_model_outputs_only_the_selected_copy_and_never_uses_an_endpoint():
    repository = Path(__file__).resolve().parents[1]
    before = (repository / SOURCE_PATH).read_bytes()
    original = extracted_source(repository)[0].decode()
    provider = NodeBrowserProvider()
    model = {"model": MODEL, "kind": "chat_completions",
             "endpoint": "http://127.0.0.1:9999/v1", "key_env": ""}

    def call(source, number):
        return asyncio.run(provider.complete(model, [{
            "role": "user", "content": json.dumps({
                "files": [{"path": SOURCE_FILE, "content": source}], "round": number,
            }),
        }], 8192))

    partial = json.loads(call(original, 1)["text"])["changes"][0]
    assert partial["path"] == SOURCE_FILE and PARTIAL_RETURN in partial["content"]
    complete = json.loads(call(partial["content"], 2)["text"])["changes"][0]
    assert FIXED_RETURN in complete["content"]
    assert (repository / SOURCE_PATH).read_bytes() == before
    assert [item["round"] for item in provider.calls] == [1, 2]
    with pytest.raises(ProviderError, match="node_browser_fixture_model_denied"):
        asyncio.run(provider.complete({**model, "endpoint": "https://real.example/v1"}, [], 8192))
