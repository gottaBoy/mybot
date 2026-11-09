"""Disposable browser test service. Never imported by the production application."""
import sys
from pathlib import Path

import uvicorn

from test_workbench import FakeProvider
from workbench.app import create_app
from workbench.config import Settings
from workbench.provider import ProviderError


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
uvicorn.run(create_app(settings, BrowserProvider(delay=0.15)), host="127.0.0.1", port=int(sys.argv[2]),
            log_level="warning")
