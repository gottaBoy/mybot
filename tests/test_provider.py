import asyncio
import json
import sys

import httpx
import pytest

import workbench.provider as module
from workbench.provider import ChatProvider, CodexCliProvider, ProviderError


MODEL = {"endpoint": "https://model.example/v1", "model": "model-x", "key_env": "WORKBENCH_MODEL_TEST_KEY"}


def invoke(monkeypatch, handler):
    original = httpx.AsyncClient
    monkeypatch.setattr(module.httpx, "AsyncClient",
                        lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    monkeypatch.setenv("WORKBENCH_MODEL_TEST_KEY", "private-test-key")
    return asyncio.run(ChatProvider().complete(MODEL, [{"role": "user", "content": "test"}], 400))


def test_chat_protocol_and_usage(monkeypatch):
    def handler(request):
        assert str(request.url) == "https://model.example/v1/chat/completions"
        assert request.headers["authorization"] == "Bearer private-test-key"
        assert b'"max_tokens":400' in request.content
        return httpx.Response(200, json={"model": "returned-model", "choices": [
            {"message": {"content": "answer"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 8}})
    result = invoke(monkeypatch, handler)
    assert result == {"text": "answer", "model": "returned-model",
                      "input_tokens": 5, "output_tokens": 8, "truncated": False}


@pytest.mark.parametrize("status", [302, 401, 429, 503])
def test_provider_errors_do_not_disclose_body_or_retry(monkeypatch, status):
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(status, text="private-test-key", headers={"location": "https://other.example"})
    with pytest.raises(ProviderError) as exc:
        invoke(monkeypatch, handler)
    assert exc.value.code == f"provider_http_{status}"
    assert "private" not in str(exc.value)
    assert len(requests) == 1


def test_missing_usage_is_unknown(monkeypatch):
    result = invoke(monkeypatch, lambda request: httpx.Response(200, json={
        "choices": [{"message": {"content": "answer"}, "finish_reason": "length"}]}))
    assert result["input_tokens"] is result["output_tokens"] is None
    assert result["truncated"] is True


def test_provider_rejects_unbounded_response(monkeypatch):
    with pytest.raises(ProviderError, match="response_too_large"):
        invoke(monkeypatch, lambda request: httpx.Response(200, content=b"x" * 1100000))


def test_provider_reports_timeout_without_raw_exception(monkeypatch):
    def handler(request):
        raise httpx.ReadTimeout("contains-private-content")
    with pytest.raises(ProviderError, match="provider_timeout_outcome_unknown") as exc:
        invoke(monkeypatch, handler)
    assert "private" not in str(exc.value)


def test_codex_cli_adapter_uses_json_output_without_api_key(monkeypatch, tmp_path):
    script = tmp_path / "codex"
    script.write_text(
        "#!/bin/sh\n"
        "cat >/dev/null\n"
        "printf '%s\\n' '{\"item\":{\"type\":\"agent_message\",\"text\":\"codex answer\"}}'\n"
    )
    script.chmod(0o700)
    monkeypatch.setattr(module.shutil, "which", lambda name: str(script))
    result = asyncio.run(CodexCliProvider().complete({
        "kind": "codex_cli", "model": "codex-cli", "workspace": str(tmp_path),
    }, [{"role": "user", "content": "test"}], 400))
    assert result["text"] == "codex answer"
    assert result["input_tokens"] is None


def fake_codex(monkeypatch, tmp_path, body):
    script = tmp_path / "codex"
    script.write_text(f"#!{sys.executable}\nimport json, sys, time\n{body}\n")
    script.chmod(0o700)
    monkeypatch.setattr(module.shutil, "which", lambda name: str(script))
    original = module.tempfile.NamedTemporaryFile
    monkeypatch.setattr(module.tempfile, "NamedTemporaryFile",
                        lambda **kwargs: original(dir=tmp_path, **kwargs))
    return {"kind": "codex_cli", "model": "codex-cli", "workspace": str(tmp_path)}


def test_codex_completed_usage_and_output_file_take_precedence(monkeypatch, tmp_path):
    model = fake_codex(monkeypatch, tmp_path, """
sys.stdin.read()
from pathlib import Path
Path(sys.argv[sys.argv.index('--output-last-message') + 1]).write_text('final answer')
print(json.dumps({'type': 'item.completed', 'item': {'type': 'agent_message', 'text': 'commentary'}}))
print(json.dumps({'type': 'turn.completed', 'usage': {'input_tokens': 42, 'output_tokens': 9}}))
""")
    result = asyncio.run(CodexCliProvider().complete(model, [], 400))
    assert result["text"] == "final answer"
    assert (result["input_tokens"], result["output_tokens"]) == (42, 9)
    assert not list(tmp_path.glob("mybot-codex-*.txt"))


def test_codex_timeout_retains_only_safe_diagnostics_and_reaps(monkeypatch, tmp_path):
    model = fake_codex(monkeypatch, tmp_path, """
sys.stdin.read()
print(json.dumps({'type': 'item.completed', 'item': {'type': 'agent_message', 'text': 'private text'}}), flush=True)
print(json.dumps({'type': 'private-api-key', 'item': {'type': 'private-path'}}), flush=True)
sys.stderr.write('private stderr')
time.sleep(30)
""")
    monkeypatch.setattr(module, "codex_timeout_seconds", lambda: 0.3)
    with pytest.raises(ProviderError) as error:
        asyncio.run(CodexCliProvider().complete(model, [], 400))
    assert error.value.code == "codex_cli_timeout_outcome_unknown"
    assert error.value.detail["events"] == 2
    assert error.value.detail["last_event"] == "other"
    assert error.value.detail["partial_message"] is True
    assert error.value.detail["process_reaped"] is True
    assert error.value.detail["last_event_age_ms"] >= 0
    assert "private" not in json.dumps(error.value.detail)
    assert not list(tmp_path.glob("mybot-codex-*.txt"))


def test_codex_cancel_drains_reader_tasks_and_cleans_temp(monkeypatch, tmp_path):
    model = fake_codex(monkeypatch, tmp_path, "sys.stdin.read()\ntime.sleep(30)")

    async def run():
        call = asyncio.create_task(CodexCliProvider().complete(model, [], 400))
        await asyncio.sleep(0.1)
        call.cancel()
        with pytest.raises(asyncio.CancelledError):
            await call
        assert not [task for task in asyncio.all_tasks() if task is not asyncio.current_task()]

    asyncio.run(run())
    assert not list(tmp_path.glob("mybot-codex-*.txt"))


def test_codex_excessive_jsonl_is_bounded_and_not_timeout(monkeypatch, tmp_path):
    model = fake_codex(monkeypatch, tmp_path, """
sys.stdin.read()
for _ in range(200):
    print(json.dumps({'type': 'ignored', 'data': 'x' * 8192}), flush=True)
time.sleep(30)
""")
    with pytest.raises(ProviderError, match="codex_cli_output_limit") as error:
        asyncio.run(CodexCliProvider().complete(model, [], 400))
    assert error.value.detail["process_reaped"] is True
    assert not list(tmp_path.glob("mybot-codex-*.txt"))


def test_codex_start_failure_cleans_temp_output(monkeypatch, tmp_path):
    model = fake_codex(monkeypatch, tmp_path, "")

    async def fail_start(*args, **kwargs):
        raise OSError("private path")

    monkeypatch.setattr(module.asyncio, "create_subprocess_exec", fail_start)
    with pytest.raises(ProviderError, match="codex_cli_start_failed"):
        asyncio.run(CodexCliProvider().complete(model, [], 400))
    assert not list(tmp_path.glob("mybot-codex-*.txt"))


def test_codex_connection_tests_share_run_single_channel(monkeypatch, tmp_path):
    model = fake_codex(monkeypatch, tmp_path, """
sys.stdin.read()
from pathlib import Path
with Path('execution.lock').open('x'):
    time.sleep(0.05)
Path('execution.lock').unlink()
print(json.dumps({'item': {'type': 'agent_message', 'text': 'completed'}}))
""")

    async def run():
        provider = CodexCliProvider()
        return await asyncio.gather(
            provider.complete(model, [], 100), provider.complete(model, [], 100),
        )

    results = asyncio.run(run())
    assert [result["text"] for result in results] == ["completed", "completed"]
    assert not list(tmp_path.glob("mybot-codex-*.txt"))


def test_codex_explicit_run_timeout_overrides_environment_default(monkeypatch, tmp_path):
    model = fake_codex(monkeypatch, tmp_path, """
sys.stdin.read()
time.sleep(0.05)
print(json.dumps({'item': {'type': 'agent_message', 'text': 'completed'}}))
""")
    monkeypatch.setattr(module, "codex_timeout_seconds", lambda: 0.001)
    result = asyncio.run(CodexCliProvider().complete({**model, "_timeout_seconds": 1}, [], 100))
    assert result["text"] == "completed"


def test_chat_explicit_timeout_is_forwarded_to_http_client(monkeypatch):
    def handler(request):
        assert request.extensions["timeout"]["read"] == 180
        return httpx.Response(200, json={"choices": [{"message": {"content": "answer"}}]})

    original = httpx.AsyncClient
    monkeypatch.setattr(module.httpx, "AsyncClient",
                        lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    monkeypatch.setenv("WORKBENCH_MODEL_TEST_KEY", "private-test-key")
    result = asyncio.run(ChatProvider().complete({**MODEL, "_timeout_seconds": 180}, [], 100))
    assert result["text"] == "answer"
