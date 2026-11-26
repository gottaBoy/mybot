"""Disposable browser test service. Never imported by the production application."""
import asyncio
import json
import shutil
import sys
from pathlib import Path

import httpx
import uvicorn

from test_workbench import FakeProvider
from workbench.app import create_app
from workbench.config import Settings
from workbench.provider import ProviderError
from workbench.backend import OpenMausBotNativeReadAdapter


class BrowserProvider(FakeProvider):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.review_failed = False

    async def complete(self, model, messages, max_tokens):
        if model["model"] == "coding-fixture":
            request = json.loads(messages[-1]["content"])
            source = next(file["content"] for file in request["files"] if file["path"] == "workbench/schemas.py")
            extra = r'"\n" in value or ' if request["round"] == 1 else "any(ord(char) < 32 for char in value) or "
            source = source.replace("if " + (r'"\n" in value or ' if request["round"] > 1 else "") + r'"\\" in value or ', "if " + extra + r'"\\" in value or ', 1)
            return {
                "text": json.dumps({"summary": "拒绝路径控制字符，保留普通路径和中文路径。", "changes": [
                    {"path": "workbench/schemas.py", "content": source},
                ]}), "model": model["model"], "input_tokens": 100, "output_tokens": 100,
                "truncated": False,
            }
        if "pause-cancel-fixture" in messages[-1]["content"]:
            await asyncio.sleep(0.8)
        if ("resource-retry-fixture" in messages[-1]["content"]
                and "以下是其他 Agent 的分析" in messages[-1]["content"] and not self.review_failed):
            self.review_failed = True
            raise ProviderError("provider_timeout_outcome_unknown")
        if "timeout-diagnostics-fixture" in messages[-1]["content"]:
            raise ProviderError("codex_cli_timeout_outcome_unknown", detail={
                "timeout_seconds": 90, "events": 3, "last_event": "turn.started",
                "partial_message": True, "last_event_age_ms": 1200,
                "process_reaped": True,
            })
        return await super().complete(model, messages, max_tokens)

root = Path(sys.argv[1])
workspace = root / "workspace"
workspace.mkdir(parents=True)
(workspace / "README.md").write_text("# Browser test repository\nExplicit context fixture.", encoding="utf-8")
if len(sys.argv) > 4 and sys.argv[4] == "coding":
    if root.parent != Path("/tmp") or not root.name.startswith("mybot-astryx-workbench.") or root.is_symlink():
        raise ValueError("Coding browser input requires an explicit disposable fixture")
    repository = Path(__file__).resolve().parents[1]
    (workspace / "workbench").mkdir()
    for name in ("__init__.py", "schemas.py", "saved_views.py"):
        shutil.copyfile(repository / "workbench" / name, workspace / "workbench" / name)
    shutil.copyfile(repository / "tests/fixtures/coding_relative_path_case.py", workspace / "test_relative_path.py")
settings = Settings(root / "data", workspace, poll_interval=0.01,
                    access_token=sys.argv[3] if len(sys.argv) > 3 else "")

def backend_health_fixture(request):
    assert request.method == "GET"
    if request.url.path == "/api/health":
        return httpx.Response(200, json={"app": "openmausbot", "static": True})
    if request.url.path == "/api/bots":
        assert request.url.params["messages"] == "0"
        return httpx.Response(200, json={"bots": [
            {"id": "bot-research", "name": "研发调研（测试夹具）", "threadId": "thread-research", "status": "idle"},
        ]})
    assert request.url.path == "/api/threads/thread-research/messages"
    return httpx.Response(200, json={"messages": [
        {"id": "u1", "kind": "text", "role": "user", "at": 1794355200000,
         "text": "检查多端协作的数据来源和权限边界。"},
        {"id": "b1", "kind": "text", "role": "bot", "at": 1794355201000,
         "text": "只读缓存测试夹具。尚未连接真实 OpenMausBot。\n"
                 "待验证：设备撤销、断线补齐和会话归属。\n<script>window.cacheInjected=true</script>"},
        {"id": "secret1", "kind": "secret", "secret": {"value": "DO_NOT_SHOW_SECRET"}},
    ], "hasMore": True})


backend_client = httpx.AsyncClient(
    base_url="http://127.0.0.1:8000", transport=httpx.MockTransport(backend_health_fixture),
)
uvicorn.run(create_app(settings, BrowserProvider(delay=0.15), OpenMausBotNativeReadAdapter(backend_client)),
            host="127.0.0.1", port=int(sys.argv[2]),
            log_level="warning")
