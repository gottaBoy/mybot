"""Explicit, durable connection tests. Reconciliation never invokes a provider."""

from __future__ import annotations

import asyncio
import re
from pathlib import Path

from .provider import ProviderError
from .store import Store


SAFE_ERROR_CODES = {
    "missing_api_key", "provider_timeout_outcome_unknown", "provider_connection_error",
    "invalid_provider_response", "response_too_large", "empty_response",
    "codex_cli_not_found", "codex_cli_output_limit", "codex_cli_timeout_outcome_unknown",
    "codex_cli_start_failed", "codex_cli_failed", "codex_cli_empty_response",
    "pi_sdk_not_available", "pi_sdk_invalid_input", "pi_sdk_start_failed",
    "pi_sdk_provider_rejected", "pi_sdk_policy_violation", "pi_sdk_invalid_response",
    "pi_sdk_empty_response", "pi_sdk_output_limit",
    "pi_sdk_timeout_outcome_unknown", "pi_sdk_connection_outcome_unknown",
}
UNKNOWN_ERROR_CODES = {
    "provider_timeout_outcome_unknown", "provider_connection_error",
    "codex_cli_timeout_outcome_unknown", "model_test_execution_outcome_unknown",
    "pi_sdk_timeout_outcome_unknown", "pi_sdk_connection_outcome_unknown",
    "pi_sdk_output_limit", "pi_sdk_invalid_response", "pi_sdk_policy_violation",
    "pi_sdk_empty_response",
}


def safe_test_error(error: ProviderError) -> str:
    code = error.code
    if isinstance(code, str) and (
        code in SAFE_ERROR_CODES or re.fullmatch(r"provider_http_[1-5][0-9]{2}", code)
    ):
        return code
    return "model_test_execution_outcome_unknown"


def public_test(record: dict) -> dict:
    fields = (
        "request_id", "model_id", "state", "status",
        "input_tokens", "output_tokens", "started_at", "ended_at",
    )
    return {
        **{key: record[key] for key in fields},
        "outcome_unknown": record["state"] == "unknown",
        "usage_unknown": record["input_tokens"] is None or record["output_tokens"] is None,
        "note": "A minimal request tests reachability, not full tool capability",
    }


class ModelTestService:
    def __init__(self, store: Store, provider, workspace: Path):
        self.store, self.provider, self.workspace = store, provider, workspace

    def read(self, model_id: str, request_id: str) -> dict:
        return public_test(self.store.model_test(model_id, request_id))

    def latest(self, model_id: str) -> dict | None:
        record = self.store.latest_model_test(model_id)
        return public_test(record) if record is not None else None

    async def start(self, model_id: str, request_id: str) -> dict:
        record, claimed, model = self.store.claim_model_test(model_id, request_id)
        if not claimed:
            return public_test(record)
        if model.get("kind") == "codex_cli":
            model = {**model, "workspace": str(self.workspace)}
        input_tokens = output_tokens = None
        try:
            result = await self.provider.complete(
                model, [{"role": "user", "content": "Reply only OK."}], 16,
            )

            def tokens(key):
                value = result.get(key)
                return value if type(value) is int and value >= 0 else None

            input_tokens, output_tokens = tokens("input_tokens"), tokens("output_tokens")
            state, status = (
                ("failed", "output_truncated") if result.get("truncated")
                else ("succeeded", "reachable")
            )
        except asyncio.CancelledError:
            self.store.finish_model_test(
                model_id, request_id, "unknown", "model_test_interrupted_outcome_unknown",
            )
            raise
        except ProviderError as error:
            status = safe_test_error(error)
            state = "unknown" if status in UNKNOWN_ERROR_CODES else "failed"
        except Exception:
            state, status = "unknown", "model_test_execution_outcome_unknown"
        return public_test(self.store.finish_model_test(
            model_id, request_id, state, status, input_tokens, output_tokens,
        ))
