from __future__ import annotations

import json
import os

import httpx


class ProviderError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def key_available(model: dict) -> bool:
    return not model["key_env"] or bool(os.environ.get(model["key_env"]))


class ChatProvider:
    """OpenAI-compatible Chat Completions, without implicit retries or fallbacks."""

    async def complete(self, model: dict, messages: list[dict], max_tokens: int) -> dict:
        if not key_available(model):
            raise ProviderError("missing_api_key")
        headers = {"Content-Type": "application/json"}
        if model["key_env"]:
            headers["Authorization"] = f"Bearer {os.environ[model['key_env']]}"
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60, connect=10),
                                         follow_redirects=False, trust_env=False) as client:
                async with client.stream(
                    "POST", model["endpoint"] + "/chat/completions", headers=headers,
                    json={"model": model["model"], "messages": messages,
                          "max_tokens": max_tokens, "stream": False},
                ) as response:
                    if response.status_code != 200:
                        raise ProviderError(f"provider_http_{response.status_code}")
                    data = bytearray()
                    async for chunk in response.aiter_bytes():
                        data.extend(chunk)
                        if len(data) > 1024 * 1024:
                            raise ProviderError("response_too_large")
            raw = json.loads(data)
            choice = raw["choices"][0]
            text = choice["message"].get("content")
            if not isinstance(text, str) or not text.strip():
                raise ProviderError("empty_response")
            if len(text) > 80000:
                raise ProviderError("response_too_large")
            usage = raw.get("usage") or {}

            def tokens(name):
                value = usage.get(name)
                return value if type(value) is int and value >= 0 else None

            return {"text": text, "model": raw.get("model") if isinstance(raw.get("model"), str) else None,
                    "input_tokens": tokens("prompt_tokens"), "output_tokens": tokens("completion_tokens"),
                    "truncated": choice.get("finish_reason") == "length"}
        except httpx.TimeoutException as exc:
            raise ProviderError("provider_timeout_outcome_unknown") from exc
        except httpx.HTTPError as exc:
            raise ProviderError("provider_connection_error") from exc
        except (json.JSONDecodeError, KeyError, IndexError, TypeError, AttributeError) as exc:
            raise ProviderError("invalid_provider_response") from exc
