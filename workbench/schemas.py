from __future__ import annotations

import ipaddress
import re
from pathlib import PurePosixPath
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def relative_path(value: str) -> str:
    path = PurePosixPath(value)
    if "\\" in value or "\x00" in value or path.is_absolute() or ".." in path.parts:
        raise ValueError("Use a relative path inside the workspace")
    return value


class ProjectCreate(Input):
    name: str = Field(min_length=1, max_length=100)
    goal: str = Field(default="", max_length=4000)
    directory: str = Field(default=".", max_length=400)
    notes: str = Field(default="", max_length=16000)

    @field_validator("directory")
    @classmethod
    def directory_path(cls, value: str) -> str:
        return relative_path(value)


class ModelCreate(Input):
    kind: str = Field(default="chat_completions", pattern="^(chat_completions|codex_cli)$")
    name: str = Field(min_length=1, max_length=80)
    endpoint: str = Field(min_length=5, max_length=500)
    model: str = Field(min_length=1, max_length=150)
    key_env: str = Field(default="", max_length=100)

    @field_validator("endpoint")
    @classmethod
    def endpoint_url(cls, value: str) -> str:
        url = urlsplit(value)
        if value == "codex://local":
            return value
        if not url.hostname or url.username or url.password or url.query or url.fragment:
            raise ValueError("Endpoint must not contain credentials, query or fragment")
        if url.port is not None and url.port < 1:
            raise ValueError("Invalid port")
        loopback = url.hostname == "localhost"
        try:
            loopback = loopback or ipaddress.ip_address(url.hostname).is_loopback
        except ValueError:
            pass
        if url.scheme != "https" and not (url.scheme == "http" and loopback):
            raise ValueError("Use HTTPS; HTTP is allowed only for a loopback model server")
        if url.hostname in {"169.254.169.254", "metadata.google.internal"}:
            raise ValueError("Metadata endpoints are not model endpoints")
        return value.rstrip("/")

    @model_validator(mode="after")
    def kind_endpoint_match(self):
        if self.kind == "codex_cli" and self.endpoint != "codex://local":
            raise ValueError("Codex CLI models must use codex://local")
        if self.kind == "chat_completions" and self.endpoint == "codex://local":
            raise ValueError("Chat Completions models must use an HTTP(S) endpoint")
        return self

    @field_validator("key_env")
    @classmethod
    def environment_name(cls, value: str) -> str:
        if value and not re.fullmatch(r"WORKBENCH_MODEL_[A-Z0-9_]+_KEY", value):
            raise ValueError("Use WORKBENCH_MODEL_<NAME>_KEY; the key itself is not accepted")
        return value


class DefaultModel(Input):
    model_id: str = Field(min_length=1, max_length=100)


class TaskCreate(Input):
    project_id: str
    title: str = Field(min_length=1, max_length=160)
    goal: str = Field(min_length=8, max_length=8000)
    acceptance: str = Field(default="", max_length=4000)
    files: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("files")
    @classmethod
    def file_paths(cls, values: list[str]) -> list[str]:
        return list(dict.fromkeys(relative_path(value) for value in values if value))


class RunCreate(Input):
    coordinator_model: str
    researcher_model: str
    reviewer_model: str
    max_calls: int = Field(default=4, ge=3, le=8)
    parallel: int = Field(default=2, ge=1, le=2)
    minutes: int = Field(default=10, ge=1, le=30)
    max_output_tokens: int = Field(default=1800, ge=256, le=4096)
    consent: bool = False
    request_id: str = Field(min_length=8, max_length=100)
    context_hash: str = Field(pattern="^[0-9a-f]{64}$")


class Resume(Input):
    acknowledge_replay: bool = False


class RunRetry(Input):
    coordinator_model: str
    researcher_model: str
    reviewer_model: str
    max_calls: int = Field(default=4, ge=1, le=8)
    parallel: int = Field(default=1, ge=1, le=2)
    minutes: int = Field(default=10, ge=1, le=30)
    max_output_tokens: int = Field(default=1800, ge=256, le=4096)
    call_timeout_seconds: int = Field(default=120, ge=10, le=300)
    consent: bool = False
    acknowledge_replay: bool = False
    request_id: str = Field(min_length=8, max_length=100)
    snapshot_hash: str = Field(pattern="^[0-9a-f]{64}$")


class ArtifactDecision(Input):
    decision: str = Field(pattern="^(accepted|changes_requested)$")


class Login(Input):
    token: str = Field(min_length=1, max_length=500)


class PlanItem(Input):
    title: str = Field(min_length=1, max_length=120)
    objective: str = Field(min_length=8, max_length=2000)


class Plan(Input):
    tasks: list[PlanItem] = Field(min_length=1, max_length=2)
