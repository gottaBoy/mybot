"""Safe recovery candidates and receipts; no provider invocation or source-text copies."""

from __future__ import annotations

from collections.abc import Callable

from .provider import key_available
from .recovery import MODEL_FIELDS, fingerprint


UNRESOLVED_INTENT_STATES = ("prepared", "applying", "unknown")
RESOURCE_LIMITS = {
    "max_calls": (1, 8), "parallel": (1, 2), "minutes": (1, 30),
    "max_output_tokens": (256, 4096), "call_timeout_seconds": (10, 300),
}
SAFE_REJECTION_CODES = {
    "task_dependencies_blocked",
    "recovery_intent_snapshot_changed", "recovery_intent_candidate_changed",
    "recovery_intent_source_not_ready", "recovery_intent_resources_invalid",
    "recovery_intent_model_missing", "recovery_resume_not_paused",
    "recovery_resume_has_child", "recovery_resume_ambiguous_calls",
    "recovery_resume_budget_insufficient", "recovery_resume_model_changed",
    "retry_completed_role_model_locked",
    "retry_source_not_ready", "retry_snapshot_changed", "retry_budget_insufficient",
    "retry_other_run_active", "retry_source_has_child", "retry_request_id_conflict",
    "retry_replay_confirmation_required", "missing_api_key",
}


def safe_recovery_rejection(error: ValueError) -> str:
    code = str(error)
    return code if code in SAFE_REJECTION_CODES else "recovery_intent_validation_failed"


def public_recovery_intent(record: dict) -> dict:
    fields = (
        "request_id", "source_run_id", "mode", "snapshot_hash", "candidate_hash",
        "config", "state", "target_run_id", "error_code", "created_at",
        "updated_at", "settled_at",
    )
    return {
        **{key: record[key] for key in fields},
        "requires_acknowledgement": bool(record["requires_acknowledgement"]),
        "outcome_unknown": record["state"] == "unknown",
        "consent_required": record["state"] == "prepared",
        "note": "Applied confirms the queue/control command, not model execution success",
    }


def recovery_candidate(
    source: dict, facts: list[list[dict]], preview: dict, mode: str,
    requested_config: dict | None, resolve_model: Callable[[str], dict | None],
    has_child: bool,
) -> tuple[dict, str, dict]:
    if not preview["allowed"]:
        raise ValueError("recovery_intent_source_not_ready")
    roles = {step["role"] for step in preview["steps"] if step["action"] != "reuse"}
    if mode == "resume":
        if source["status"] != "paused":
            raise ValueError("recovery_resume_not_paused")
        if has_child:
            raise ValueError("recovery_resume_has_child")
        calls = facts[1]
        if any(call["status"] != "succeeded" for call in calls):
            raise ValueError("recovery_resume_ambiguous_calls")
        if source["config"].get("max_calls", 0) - len(calls) < preview["minimum_calls"]:
            raise ValueError("recovery_resume_budget_insufficient")
        config = {
            key: source["config"][key]
            for key in (*MODEL_FIELDS, *RESOURCE_LIMITS)
            if key in source["config"]
        }
    else:
        config = dict(requested_config or {})
    for field in MODEL_FIELDS:
        if not isinstance(config.get(field), str) or not config[field]:
            raise ValueError("recovery_intent_resources_invalid")
    for field, (minimum, maximum) in RESOURCE_LIMITS.items():
        if mode == "resume" and field == "call_timeout_seconds" and field not in config:
            continue
        value = config.get(field)
        if type(value) is not int or not minimum <= value <= maximum:
            raise ValueError("recovery_intent_resources_invalid")
    if mode == "retry" and config["max_calls"] < preview["minimum_calls"]:
        raise ValueError("retry_budget_insufficient")
    models = {}
    for role, field in zip(("coordinator", "researcher", "reviewer"), MODEL_FIELDS):
        if role not in roles:
            if config[field] != source["config"][field]:
                raise ValueError("retry_completed_role_model_locked")
            continue
        current_model = resolve_model(config[field])
        model = source["context"]["models"].get(config[field]) if mode == "resume" else current_model
        if model is None:
            raise ValueError("recovery_intent_model_missing")
        if mode == "resume":
            if current_model is None:
                raise ValueError("recovery_intent_model_missing")
            if any(
                model.get(key, "chat_completions" if key == "kind" else "") !=
                current_model.get(key, "chat_completions" if key == "kind" else "")
                for key in ("kind", "endpoint", "model", "key_env")
            ):
                raise ValueError("recovery_resume_model_changed")
        if not key_available(model):
            raise ValueError("missing_api_key")
        models[model["id"]] = model
    model_hashes = {
        identifier: fingerprint({
            key: model.get(key, "chat_completions" if key == "kind" else "")
            for key in ("kind", "endpoint", "model", "key_env")
        })
        for identifier, model in models.items()
    }
    candidate_hash = fingerprint([
        source["id"], mode, preview["snapshot_hash"], config, model_hashes,
    ])
    return config, candidate_hash, models
