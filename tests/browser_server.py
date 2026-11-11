"""Disposable browser test service. Never imported by the production application."""
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
