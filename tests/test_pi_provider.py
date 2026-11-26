"""Real installed Pi SDK against an owned loopback SSE server, never a model."""

import asyncio
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import threading
import time
from types import SimpleNamespace

import pytest

from workbench.pi_provider import PiSdkProvider, pi_sdk_available
from workbench.provider import ProviderError
import workbench.pi_provider as pi_module


@contextmanager
def pi_mock_server(responder=None):
    """Replies are deterministic data: text/finish/usage/status/delay/tool/reasoning."""
    calls = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            calls.append({"path": self.path, "body": body, "headers": {key.lower(): value for key, value in self.headers.items()}})
            reply = responder(body, len(calls) - 1) if responder else {"text": "Pi SDK fixture answer"}
            time.sleep(reply.get("delay", 0))
            status = reply.get("status", 200)
            self.send_response(status)
            self.send_header("Content-Type", "text/event-stream" if status == 200 else "application/json")
            if reply.get("location"):
                self.send_header("Location", reply["location"])
            self.end_headers()
            try:
                if status != 200:
                    self.wfile.write(b'{"error":{"message":"PRIVATE_UPSTREAM_ERROR"}}')
                    return

                def event(delta, finish=None, usage=None):
                    value = {
                        "id": "chatcmpl-mybot-fixture", "object": "chat.completion.chunk",
                        "created": 1, "model": body["model"],
                        "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
                    }
                    if usage is not None:
                        value["usage"] = usage
                    self.wfile.write(f"data: {json.dumps(value)}\n\n".encode())
                    self.wfile.flush()

                if reply.get("reasoning"):
                    event({"role": "assistant", "reasoning_content": reply["reasoning"]})
                if reply.get("tool"):
                    event({"role": "assistant", "tool_calls": [{
                        "index": 0, "id": "call-denied", "type": "function",
                        "function": {"name": "bash", "arguments": '{"command":"touch forbidden"}'},
                    }]})
                else:
                    event({"role": "assistant", "content": reply.get("text", "")})
                usage = reply.get("usage", {
                    "prompt_tokens": 11, "completion_tokens": 7,
                    "prompt_tokens_details": {"cached_tokens": 3, "cache_write_tokens": 0},
                })
                event({}, reply.get("finish", "tool_calls" if reply.get("tool") else "stop"), usage)
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield SimpleNamespace(endpoint=f"http://127.0.0.1:{server.server_port}/v1", calls=calls)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def model(server, **changes):
    return {
        "kind": "pi_sdk", "endpoint": server.endpoint,
        "model": "mybot-pi-fixture", "key_env": "", **changes,
    }


@pytest.fixture(autouse=True)
def installed_sdk():
    if not pi_sdk_available():
        if os.environ.get("MYBOT_REQUIRE_PI_RUNTIME") == "1":
            pytest.fail("Install the locked runtime/pi dependencies with npm ci --ignore-scripts")
        pytest.skip("Optional Pi runtime is absent; see runtime/pi/README.md")


def complete(server, **changes):
    return asyncio.run(PiSdkProvider().complete(
        model(server, **changes),
        [{"role": "system", "content": "Explicit system"}, {"role": "user", "content": "Explicit user"}],
        400,
    ))


def test_real_sdk_sends_exact_messages_once_and_binds_token_limit():
    with pi_mock_server() as server:
        value = complete(server)
        assert value["text"] == "Pi SDK fixture answer", value
        assert value["model"] == "mybot-pi-fixture"
        assert value["output_tokens"] == 7 and value["input_tokens"] == 11
        assert value["diagnostics"]["native_input_tokens"] == 8
        assert value["diagnostics"]["cache_read_tokens"] == 3
        assert value["diagnostics"]["cache_write_tokens"] == 0
        assert value["diagnostics"]["cache_tokens_are_input_subset"] is True
        assert value["diagnostics"]["process_reaped"] is True
        assert value["truncated"] is False and len(server.calls) == 1
        sent = server.calls[0]
        assert sent["path"] == "/v1/chat/completions"
        assert sent["body"]["messages"] == [
            {"role": "system", "content": "Explicit system"},
            {"role": "user", "content": "Explicit user"},
        ]
        assert sent["body"]["max_tokens"] == 400
        assert not sent["body"].get("tools") and not sent["body"].get("functions")
        assert "authorization" not in sent["headers"]


def test_host_markers_credentials_and_resource_directives_are_not_discovered(tmp_path, monkeypatch):
    (tmp_path / "AGENTS.md").write_text("PRIVATE_AGENTS_MARKER")
    agent = tmp_path / ".pi/agent"
    agent.mkdir(parents=True)
    (agent / "settings.json").write_text(json.dumps({
        "defaultTools": ["bash"], "packages": ["npm:do-not-load"],
        "retry": {"enabled": True}, "cacheWarming": "idle",
    }))
    (agent / "auth.json").write_text('{"openai":{"type":"api_key","key":"PRIVATE_HOST_KEY"}}')
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("PI_CODING_AGENT_DIR", str(agent))
    monkeypatch.setenv("OPENAI_API_KEY", "PRIVATE_ENV_KEY")
    monkeypatch.chdir(tmp_path)
    with pi_mock_server() as server:
        result = complete(server)
        assert result["text"] == "Pi SDK fixture answer"
        sent = json.dumps(server.calls)
        assert "PRIVATE" not in sent and "do-not-load" not in sent
        assert len(server.calls) == 1


def test_only_explicit_key_is_sent_and_not_returned(monkeypatch):
    monkeypatch.setenv("WORKBENCH_PI_FIXTURE_KEY", "test-only-private-key")
    with pi_mock_server() as server:
        result = complete(server, key_env="WORKBENCH_PI_FIXTURE_KEY")
        assert server.calls[0]["headers"]["authorization"] == "Bearer test-only-private-key"
        assert "test-only-private-key" not in json.dumps(result)


def test_reasoning_is_not_saved_and_missing_usage_stays_unknown():
    with pi_mock_server(lambda *_: {
        "text": "Visible answer", "reasoning": "PRIVATE_REASONING", "usage": None,
    }) as server:
        result = complete(server)
        assert result["text"] == "Visible answer"
        assert "PRIVATE_REASONING" not in json.dumps(result)
        assert result["input_tokens"] is result["output_tokens"] is None
        assert result["diagnostics"]["cache_read_tokens"] is None
        assert result["diagnostics"]["native_input_tokens"] is None


@pytest.mark.parametrize("usage,input_tokens,output_tokens,native,read,write", [
    ({"prompt_tokens": 20, "completion_tokens": 7,
      "prompt_tokens_details": {"cached_tokens": 3, "cache_write_tokens": 2}}, 20, 7, 15, 3, 2),
    ({"prompt_tokens": 11, "completion_tokens": 7}, 11, 7, None, None, None),
    ({"prompt_tokens": 11, "completion_tokens": 7, "prompt_cache_hit_tokens": 3}, 11, 7, None, 3, None),
    ({"prompt_tokens": 11, "completion_tokens": 7, "cached_tokens": 3}, 11, 7, None, 3, None),
    ({"completion_tokens": 7}, None, 7, None, None, None),
    ({"prompt_tokens": 11}, 11, None, None, None, None),
    ({"prompt_tokens": -1, "completion_tokens": 7}, None, 7, None, None, None),
    ({"prompt_tokens": 11, "completion_tokens": -1}, 11, None, None, None, None),
    ({"prompt_tokens": "11", "completion_tokens": 7}, None, 7, None, None, None),
    ({"prompt_tokens": 11, "completion_tokens": "7"}, 11, None, None, None, None),
    ({"prompt_tokens": 11, "completion_tokens": 7,
      "prompt_tokens_details": {"cached_tokens": 12}}, None, 7, None, None, None),
    ({"prompt_tokens": 11, "completion_tokens": 7,
      "prompt_tokens_details": {"cached_tokens": 6, "cache_write_tokens": 6}}, None, 7, None, None, None),
    ({"prompt_tokens": 11, "completion_tokens": 7,
      "prompt_tokens_details": {"cached_tokens": -1}}, None, 7, None, None, None),
    ({"prompt_tokens": 11, "completion_tokens": 7,
      "prompt_tokens_details": {"cache_write_tokens": -1}}, None, 7, None, None, None),
    ({"prompt_tokens": 11, "completion_tokens": 7,
      "prompt_tokens_details": {"cached_tokens": "3"}}, None, 7, None, None, None),
    ({"prompt_tokens": 11, "completion_tokens": 7,
      "prompt_tokens_details": {"cached_tokens": None}}, None, 7, None, None, None),
    ({"prompt_tokens": 11, "completion_tokens": 7,
      "prompt_tokens_details": {"cached_tokens": 3}, "cached_tokens": 4}, None, 7, None, None, None),
    ({"prompt_tokens": 11, "completion_tokens": 7,
      "prompt_tokens_details": []}, None, 7, None, None, None),
    ({}, None, None, None, None, None),
    ({"prompt_tokens": 0, "completion_tokens": 0}, 0, 0, 0, 0, 0),
])
def test_raw_wire_usage_keeps_public_prompt_total_and_unknown_fields(
    usage, input_tokens, output_tokens, native, read, write,
):
    with pi_mock_server(lambda *_: {"text": "Usage fixture", "usage": usage}) as server:
        result = complete(server)
        assert result["input_tokens"] == input_tokens
        assert result["output_tokens"] == output_tokens
        assert result["diagnostics"]["native_input_tokens"] == native
        assert result["diagnostics"]["cache_read_tokens"] == read
        assert result["diagnostics"]["cache_write_tokens"] == write
        assert result["diagnostics"]["cache_tokens_are_input_subset"] is True
        assert result["diagnostics"]["usage_reported"] is True
        assert len(server.calls) == 1


def test_length_is_recorded_as_truncation_without_retry():
    with pi_mock_server(lambda *_: {"text": "Partial result", "finish": "length"}) as server:
        result = complete(server)
        assert result["truncated"] is True and len(server.calls) == 1


@pytest.mark.parametrize("status", [302, 401, 429, 503])
def test_http_failure_never_retries_or_discloses_body(status):
    with pi_mock_server(lambda *_: {"status": status}) as server:
        with pytest.raises(ProviderError) as error:
            complete(server)
        assert error.value.code == "pi_sdk_provider_rejected", error.value.detail
        assert len(server.calls) == 1 and "PRIVATE" not in json.dumps(error.value.detail)


def test_tool_call_is_rejected_without_execution_or_second_model_request():
    with pi_mock_server(lambda *_: {"tool": True}) as server:
        with pytest.raises(ProviderError) as error:
            complete(server)
        assert error.value.code == "pi_sdk_policy_violation", error.value.detail
        assert len(server.calls) == 1


def test_redirect_does_not_reach_another_endpoint():
    with pi_mock_server() as other:
        with pi_mock_server(lambda *_: {"status": 302, "location": other.endpoint + "/chat/completions"}) as server:
            with pytest.raises(ProviderError, match="pi_sdk_provider_rejected"):
                complete(server)
            assert len(server.calls) == 1 and other.calls == []


@pytest.mark.parametrize("size", [80001, 1100000])
def test_actual_sdk_text_and_wire_output_are_bounded(size):
    with pi_mock_server(lambda *_: {"text": "x" * size}) as server:
        with pytest.raises(ProviderError, match="pi_sdk_output_limit") as error:
            complete(server)
        assert error.value.detail["process_reaped"] is True
        assert len(server.calls) == 1


def test_missing_key_is_rejected_before_any_request(monkeypatch):
    monkeypatch.delenv("WORKBENCH_PI_MISSING_KEY", raising=False)
    with pi_mock_server() as server:
        with pytest.raises(ProviderError, match="missing_api_key"):
            complete(server, key_env="WORKBENCH_PI_MISSING_KEY")
        assert server.calls == []


def test_missing_runtime_fails_closed_without_a_request(tmp_path, monkeypatch):
    monkeypatch.setattr(pi_module, "BRIDGE", tmp_path / "missing-bridge.mjs")
    assert not pi_sdk_available()
    with pi_mock_server() as server:
        with pytest.raises(ProviderError, match="pi_sdk_not_available"):
            complete(server)
        assert server.calls == []


def test_empty_sdk_result_never_becomes_a_success():
    with pi_mock_server(lambda *_: {"text": ""}) as server:
        with pytest.raises(ProviderError, match="pi_sdk_empty_response"):
            complete(server)
        assert len(server.calls) == 1


@pytest.mark.parametrize("messages,limit", [
    ([], 400), ([{"role": "tool", "content": "Do not execute"}], 400),
    ([{"role": "user", "content": "Text", "tool": "bash"}], 400),
    ([{"role": "user", "content": "Text"}], True),
    ([{"role": "user", "content": "Text"}], 0),
    ([{"role": "user", "content": "Text"}], 16385),
])
def test_message_and_budget_shapes_fail_before_a_request(messages, limit):
    with pi_mock_server() as server:
        with pytest.raises(ProviderError, match="pi_sdk_invalid_input"):
            asyncio.run(PiSdkProvider().complete(model(server), messages, limit))
        assert server.calls == []


@pytest.mark.parametrize("changes", [
    {"endpoint": "file:///etc/passwd"}, {"endpoint": "https://user:pass@example.test/v1"},
    {"endpoint": "https://example.test/v1?key=secret"}, {"model": " bad-model "},
    {"key_env": "bad-key"}, {"_timeout_seconds": True},
])
def test_invalid_configuration_is_rejected_before_any_request(changes):
    with pi_mock_server() as server:
        with pytest.raises(ProviderError, match="pi_sdk_invalid_input"):
            complete(server, **changes)
        assert server.calls == []


def test_timeout_is_unknown_and_reaps_the_process():
    with pi_mock_server(lambda *_: {"text": "Late answer", "delay": 2}) as server:
        with pytest.raises(ProviderError) as error:
            complete(server, _timeout_seconds=1)
        assert error.value.code == "pi_sdk_timeout_outcome_unknown"
        assert error.value.detail["process_reaped"] is True
        assert len(server.calls) <= 1


def test_cancel_reaps_and_removes_reader_tasks():
    with pi_mock_server(lambda *_: {"text": "Late answer", "delay": 2}) as server:
        async def scenario():
            task = asyncio.create_task(PiSdkProvider().complete(
                model(server), [{"role": "user", "content": "Wait"}], 100,
            ))
            for _ in range(100):
                if server.calls:
                    break
                await asyncio.sleep(0.02)
            assert len(server.calls) == 1
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            assert not [pending for pending in asyncio.all_tasks() if pending is not asyncio.current_task()]
        asyncio.run(scenario())
        assert len(server.calls) == 1
