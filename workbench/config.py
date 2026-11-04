from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Settings:
    data_dir: Path
    workspace: Path
    allowed_hosts: tuple[str, ...] = ("127.0.0.1", "localhost", "[::1]", "testserver")
    access_token: str = ""
    secure_cookie: bool = False
    poll_interval: float = 0.25

    @classmethod
    def from_env(cls) -> "Settings":
        root = Path(__file__).resolve().parents[1]
        token = os.environ.get("WORKBENCH_ACCESS_TOKEN", "")
        if token and len(token) < 32:
            raise ValueError("WORKBENCH_ACCESS_TOKEN must contain at least 32 characters")
        hosts = tuple(filter(None, (v.strip() for v in os.environ.get(
            "WORKBENCH_ALLOWED_HOSTS", "127.0.0.1,localhost,[::1]"
        ).split(","))))
        if "*" in hosts:
            raise ValueError("Use explicit WORKBENCH_ALLOWED_HOSTS, not *")
        return cls(
            data_dir=Path(os.environ.get("WORKBENCH_DATA_DIR", root / ".runtime")).resolve(),
            workspace=Path(os.environ.get("WORKBENCH_WORKSPACE", root)).resolve(),
            allowed_hosts=hosts,
            access_token=token,
            secure_cookie=os.environ.get("WORKBENCH_SECURE_COOKIE") == "1",
        )
