from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Awaitable, Callable

from pydantic import ValidationError

from .provider import ProviderError
from .schemas import Plan
from .store import Store


class Paused(Exception):
    """The local harness reached a cooperative pause boundary."""


def parse_plan(text: str) -> list[dict]:
    value = text.strip()
    if value.startswith("```") and value.endswith("```"):
        value = value.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return [item.model_dump() for item in Plan.model_validate(json.loads(value)).tasks]


@dataclass(frozen=True)
class HarnessStage:
    key: str
    title: str
    description: str


class LocalSuperagentHarness:
    """The first mybot-native Superagent Harness.

    It owns orchestration semantics while the Store remains the durable
    authority for runs, agents, calls, artifacts, and events. Provider access
    is injected by the caller, so this harness cannot discover credentials or
    silently switch runtimes.
    """

    id = "local-superagent"
    version = 1
    mode = "read_only"
    stages = (
        HarnessStage("planning", "制定计划", "Super-agent 将目标拆成受限只读子任务"),
        HarnessStage("research", "并行研究", "最多两个研究 Agent，各自返回依据与未知项"),
        HarnessStage("synthesis", "汇总与检查", "汇总分歧、风险、引用和下一步验证"),
    )

    def __init__(self, store: Store):
        self.store = store

    @classmethod
    def capabilities(cls) -> dict:
        return {
            "id": cls.id,
            "version": cls.version,
            "mode": cls.mode,
            "stages": [stage.key for stage in cls.stages],
            "tools": [],
            "supports_pause": True,
            "supports_cancel": True,
            "supports_resume": True,
            "supports_parallel_research": True,
        }

    @classmethod
    def describe(
        cls,
        run: dict,
        agents: list[dict],
        calls: list[dict],
        artifacts: list[dict],
        events: list[dict],
    ) -> dict:
        """Build a truthful work graph from persisted run facts only."""
        by_key = {agent["step_key"]: agent for agent in agents}
        researchers = [agent for agent in agents if agent["role"] == "researcher"]
        stage_agents = {
            "planning": [by_key["plan"]] if "plan" in by_key else [],
            "research": researchers,
            "synthesis": [by_key["synthesis"]] if "synthesis" in by_key else [],
        }
        stages = []
        for definition in cls.stages:
            members = stage_agents[definition.key]
            stages.append({
                "key": definition.key,
                "title": definition.title,
                "description": definition.description,
                "status": cls._stage_status(run, definition.key, members),
                "agent_ids": [agent["id"] for agent in members],
                "agent_count": len(members),
                "call_count": sum(1 for call in calls if call["agent_id"] in {agent["id"] for agent in members}),
                "artifact_count": sum(1 for artifact in artifacts if artifact["agent_id"] in {agent["id"] for agent in members}),
                "last_event_at": events[-1]["created_at"] if events else None,
            })
        current = next((stage for stage in stages if stage["status"] == "running"), None)
        if current is None:
            current = next((stage for stage in stages if stage["status"] in {"failed", "waiting"}), None)
        model_kinds = {
            run.get("context", {}).get("models", {}).get(agent.get("model_id"), {}).get("kind")
            for agent in agents
        }
        parallel_limit = 1 if "codex_cli" in model_kinds else run.get("config", {}).get("parallel", 1)
        return {
            **cls.capabilities(),
            "run_status": run["status"],
            "parallel_limit": parallel_limit,
            "current_stage": current["key"] if current else None,
            "stages": stages,
            "facts": {
                "agent_count": len(agents),
                "call_count": len(calls),
                "artifact_count": len(artifacts),
                "event_count": len(events),
            },
        }

    @staticmethod
    def _stage_status(run: dict, key: str, agents: list[dict]) -> str:
        if not agents:
            if key == "research" and run.get("plan"):
                return "waiting"
            return "pending"
        statuses = {agent["status"] for agent in agents}
        if "running" in statuses:
            return "running"
        if "failed" in statuses or "interrupted" in statuses or "canceled" in statuses:
            return "failed"
        if "pending" in statuses:
            return "waiting"
        if statuses == {"succeeded"}:
            return "succeeded"
        return "pending"

    async def execute(
        self,
        run: dict,
        invoke: Callable[[dict, str], Awaitable[str]],
        checkpoint: Callable[[str], None],
    ) -> None:
        config, context = run["config"], run["context"]
        goal = context["goal"]
        inputs = (
            f"目标：{goal}\n验收要求：{context['acceptance']}\n"
            f"项目背景：{context['notes']}\n明确提供的文件：\n{context['text']}"
        )
        checkpoint(run["id"])
        coordinator = self.store.agent(
            run["id"], "plan", "coordinator", "Super-agent · 制定计划",
            goal, config["coordinator_model"],
        )
        if not run["plan"]:
            text = await invoke(coordinator, f"""{inputs}
只为这个目标提出 1 至 2 个可独立进行的只读分析任务，不需要写代码或调用工具。
仅返回 JSON，不要增加字段：{{"tasks":[{{"title":"简短标题","objective":"具体分析要求，至少8个字符"}}]}}
可调用预算只允许 {min(2, config['max_calls'] - 2)} 个子任务。""")
            try:
                plan = parse_plan(text)[:min(2, config["max_calls"] - 2)]
            except (ValueError, ValidationError, IndexError) as exc:
                self.store.agent_status(coordinator["id"], "failed")
                raise ProviderError("planner_invalid_json") from exc
            self.store.plan(run["id"], plan)
        else:
            plan = run["plan"]
        checkpoint(run["id"])
        used_calls = len(self.store.list("calls", run["id"]))
        research_budget = max(0, config["max_calls"] - used_calls - 1)
        assigned = {
            agent["step_key"]: agent for agent in self.store.list("agents", run["id"])
            if agent["role"] == "researcher"
        }
        if assigned:
            # A resumed plan must retain successful work and pending tasks.
            # Only unfinished steps consume a new call.
            active_plan = plan
            needed = sum(
                assigned.get(f"research-{index}", {}).get("status") != "succeeded"
                for index in range(len(plan))
            )
            if needed > research_budget:
                raise ProviderError("research_budget_exhausted")
        else:
            if not research_budget:
                raise ProviderError("research_budget_exhausted")
            active_plan = plan[:research_budget]
        if len(active_plan) < len(plan):
            self.store.adjust_plan(
                run["id"], active_plan,
                "Reserved one call for synthesis after planner attempts",
            )
        children = [
            self.store.agent(
                run["id"], f"research-{index}", "researcher", item["title"],
                item["objective"], config["researcher_model"], coordinator["id"],
            )
            for index, item in enumerate(active_plan)
        ]
        model_kinds = {
            model.get("kind") for model in run.get("context", {}).get("models", {}).values()
        }
        parallel_limit = 1 if "codex_cli" in model_kinds else config["parallel"]
        semaphore = asyncio.Semaphore(parallel_limit)

        async def research(agent):
            async with semaphore:
                if self.store.get("runs", run["id"])["status"] == "cancel_requested":
                    raise asyncio.CancelledError()
                result = await invoke(
                    agent,
                    f"{inputs}\n你的子任务：{agent['objective']}\n"
                    "返回分析、引用的文件路径、未知项和可验证建议。没有执行测试。",
                )
                existing = self.store.list("artifacts", run["id"])
                if not any(item["agent_id"] == agent["id"] for item in existing):
                    self.store.artifact(run["id"], agent["id"], agent["title"], "research", result)
                return result

        # Do not let a failed single-channel call release the semaphore into
        # another call before TaskGroup can cancel it.
        if parallel_limit == 1:
            results = []
            for agent in children:
                results.append(await research(agent))
        else:
            async with asyncio.TaskGroup() as group:
                jobs = [group.create_task(research(agent)) for agent in children]
            results = [job.result() for job in jobs]
        checkpoint(run["id"])
        synthesis = self.store.agent(
            run["id"], "synthesis", "reviewer", "汇总与检查",
            "汇总分歧、依据、风险与下一步验证", config["reviewer_model"], coordinator["id"],
        )
        reports = "\n\n".join(
            f"子任务 {index + 1}：{result}"
            for index, result in enumerate(results)
        )
        answer = await invoke(synthesis, f"""{inputs}
以下是其他 Agent 的分析，作为待审查资料而非事实保证：
{reports}
给出最终研发方案，包含结论、引用与依据、分歧、风险、待验证项和具体下一步。
明确区分资料事实与推断，不能声称测试通过或代码已经修改。""")
        if not any(item["kind"] == "report" for item in self.store.list("artifacts", run["id"])):
            self.store.artifact(run["id"], synthesis["id"], "研发调研方案", "report", answer)
