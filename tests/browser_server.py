"""Disposable browser test service. Never imported by the production application."""
import sys
from pathlib import Path

import uvicorn

from test_workbench import FakeProvider
from workbench.app import create_app
from workbench.config import Settings

root = Path(sys.argv[1])
workspace = root / "workspace"
workspace.mkdir(parents=True)
(workspace / "README.md").write_text("# Browser test repository\nExplicit context fixture.", encoding="utf-8")
settings = Settings(root / "data", workspace, poll_interval=0.01,
                    access_token=sys.argv[3] if len(sys.argv) > 3 else "")
uvicorn.run(create_app(settings, FakeProvider(delay=0.15)), host="127.0.0.1", port=int(sys.argv[2]),
            log_level="warning")
