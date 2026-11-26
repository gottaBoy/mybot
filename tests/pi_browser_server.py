"""Disposable real-Pi-SDK browser fixture; never run against a user's store."""

import json
from pathlib import Path
import re
import shutil
import sys

import uvicorn

from test_pi_provider import pi_mock_server
from workbench.app import create_app
from workbench.config import Settings
from workbench.pi_provider import pi_sdk_available
from workbench.provider import ProviderError, ProviderRouter


TOKEN = "astryx-browser-fixture"
PLAN = '{"tasks":[{"title":"分析边界","objective":"检查提供资料中的实现约束与风险"},{"title":"设计验证","objective":"设计尚待执行的验证条件与测试建议"}]}'
REPORT = "这是测试输出；没有执行任何测试。\n待验证：需要人工确认。"


def reply(body, _index):
    messages = body.get("messages", [])
    prompt = messages[-1].get("content", "") if messages else ""
    if prompt == "Reply only OK.":
        return {"text": "OK"}
    if body.get("model") == "mybot-pi-coding":
        try:
            request = json.loads(prompt)
            source = next(
                item["content"] for item in request["files"]
                if item["path"] == "workbench/schemas.py"
            )
            number = request["round"]
            if type(number) is not int or not 1 <= number <= 3:
                raise ValueError
            extra = r'"\n" in value or ' if number == 1 else "any(ord(char) < 32 for char in value) or "
            before = "if " + (r'"\n" in value or ' if number > 1 else "") + r'"\\" in value or '
            changed = source.replace(before, "if " + extra + r'"\\" in value or ', 1)
            if changed == source:
                raise ValueError
            return {"text": json.dumps({
                "summary": "拒绝路径控制字符，保留普通路径和中文路径。",
                "changes": [{"path": "workbench/schemas.py", "content": changed}],
            })}
        except (ValueError, KeyError, TypeError, StopIteration):
            return {"status": 400}
    return {"text": PLAN if "仅返回 JSON" in prompt else REPORT}


class LoopbackPiRouter(ProviderRouter):
    """Retain the real product router while denying every external destination."""

    def __init__(self, endpoint):
        super().__init__()
        self.fixture_endpoint = endpoint

    async def complete(self, model, messages, max_tokens):
        if (
            model.get("kind") != "pi_sdk"
            or model.get("endpoint") != self.fixture_endpoint
            or model.get("key_env", "")
        ):
            raise ProviderError("pi_browser_fixture_destination_denied")
        return await super().complete(model, messages, max_tokens)


def main(arguments):
    if len(arguments) != 3:
        raise ValueError("Usage: pi_browser_server.py FRESH_TMP_ROOT PORT astryx-browser-fixture")
    root = Path(arguments[0])
    port = int(arguments[1])
    if (
        root.parent != Path("/tmp")
        or not re.fullmatch(r"mybot-astryx-workbench\.[A-Za-z0-9_-]+", root.name)
        or root.is_symlink()
        or root.resolve() != root
        or arguments[2] != TOKEN
        or not 1024 <= port <= 65535
        or port in {4180, 5173}
    ):
        raise ValueError("Only a fresh disposable loopback fixture and the fixed token are admitted")
    if not pi_sdk_available():
        raise RuntimeError("Pinned runtime/pi SDK is unavailable; no fixture fallback")
    if root.exists():
        if not root.is_dir() or any(root.iterdir()):
            raise ValueError("The Pi browser fixture root must be empty")
    else:
        root.mkdir(mode=0o700)
    root.chmod(0o700)
    workspace = root / "workspace"
    workspace.mkdir()
    (workspace / "README.md").write_text(
        "# Pi SDK browser fixture\nCopied mybot source; deterministic HTTP model replies.",
        encoding="utf-8",
    )
    (workspace / "workbench").mkdir()
    repository = Path(__file__).resolve().parents[1]
    for name in ("__init__.py", "schemas.py", "saved_views.py"):
        shutil.copyfile(repository / "workbench" / name, workspace / "workbench" / name)
    shutil.copyfile(repository / "tests/fixtures/coding_pytest_case.py", workspace / "test_relative_path.py")
    settings = Settings(root / "data", workspace, poll_interval=0.01, access_token=TOKEN)

    with pi_mock_server(reply) as mock:
        app = create_app(settings, LoopbackPiRouter(mock.endpoint))

        @app.get("/fixture/pi-status")
        def fixture_status():
            rows = [
                {
                    "model": item["body"].get("model"),
                    "max_tokens": item["body"].get("max_tokens"),
                    "path": item["path"],
                    "no_tools": not item["body"].get("tools") and not item["body"].get("functions"),
                }
                for item in list(mock.calls)
            ]
            return {"fixture": True, "endpoint": mock.endpoint, "calls": len(rows), "requests": rows}

        uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main(sys.argv[1:])
