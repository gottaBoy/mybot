import asyncio

import httpx
import pytest

import workbench.provider as module
from workbench.provider import ChatProvider, ProviderError


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
