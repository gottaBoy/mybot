"""Pure recovery planning; no provider calls or filesystem discovery."""

from __future__ import annotations

import hashlib
import json


RETRYABLE = {"failed", "canceled", "interrupted", "paused"}
MODEL_FIELDS = ("coordinator_model", "researcher_model", "reviewer_model")


def fingerprint(value) -> str:
    return hashlib.sha256(json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
    ).encode()).hexdigest()


def retry_preview(run: dict, agents: list[dict], calls: list[dict], artifacts: list[dict]) -> dict:
    by_step = {agent["step_key"]: agent for agent in agents}

    def completed(key):
        agent = by_step.get(key)
        return bool(agent and agent["status"] == "succeeded" and agent["output"] is not None)

    keep_plan = bool(run["plan"]) and completed("plan")
    reusable = ["plan"] if keep_plan else []
    steps = [{
        "key": "plan", "role": "coordinator", "title": "制定计划",
        "action": "reuse" if keep_plan else "retry",
    }]
    if keep_plan:
        for index, item in enumerate(run["plan"]):
            key = f"research-{index}"
            reuse = completed(key) and by_step[key]["objective"] == item["objective"]
            if reuse:
                reusable.append(key)
            steps.append({
                "key": key, "role": "researcher", "title": item["title"],
                "action": "reuse" if reuse else "retry",
            })
    else:
        steps.append({
            "key": "research", "role": "researcher",
            "title": "只读研究（规划后分配 1–2 项）", "action": "retry",
        })
    reuse_synthesis = keep_plan and all(
        f"research-{index}" in reusable for index in range(len(run["plan"]))
    ) and completed("synthesis")
    if reuse_synthesis:
        reusable.append("synthesis")
    steps.append({
        "key": "synthesis", "role": "reviewer", "title": "汇总与检查",
        "action": "reuse" if reuse_synthesis else "retry",
    })
    minimum = sum(step["action"] != "reuse" for step in steps)
    return {
        "source_run_id": run["id"],
        "source_status": run["status"],
        "allowed": run["status"] in RETRYABLE and minimum > 0,
        "snapshot_hash": fingerprint({
            "run": run,
            "agents": sorted(agents, key=lambda item: item["id"]),
            "calls": sorted(calls, key=lambda item: item["id"]),
            "artifacts": sorted(artifacts, key=lambda item: item["id"]),
        }),
        "steps": steps,
        "reuse_step_keys": reusable,
        "minimum_calls": minimum,
        "source_call_count": len(calls),
        "source_unknown_usage": sum(
            call["input_tokens"] is None or call["output_tokens"] is None for call in calls
        ),
        "requires_acknowledgement": any(
            call["status"] in {"failed", "interrupted", "canceled"} for call in calls
        ),
        "context": {
            key: run["context"].get(key, "" if key != "evidence" else [])
            for key in ("goal", "acceptance", "notes", "text", "evidence")
        },
        "reused_outputs": [
            {"agent_id": by_step[key]["id"], "step_key": key,
             "title": by_step[key]["title"], "output": by_step[key]["output"]}
            for key in reusable
        ],
    }
