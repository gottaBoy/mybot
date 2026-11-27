"""Explicit file choices for continuing code after its project base changes."""

from __future__ import annotations

from pathlib import PurePosixPath
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .coding_checkpoints import code_diff, file_records
from .coding_runner import CodingError
from .recovery import fingerprint


class ReconciliationResolution(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    path: str = Field(min_length=1, max_length=400)
    source: Literal["current", "checkpoint", "manual"]
    content: str | None = None

    @field_validator("path")
    @classmethod
    def exact_path(cls, value):
        if (
            str(PurePosixPath(value)) != value or "\\" in value or value.startswith("/")
            or any(part.startswith(".") for part in value.split("/"))
            or any(ord(char) < 32 for char in value)
        ):
            raise ValueError("coding_reconciliation_path_invalid")
        value.encode("utf-8")
        return value

    @model_validator(mode="after")
    def manual_content(self):
        if self.source != "manual":
            if "content" in self.model_fields_set:
                raise ValueError("coding_reconciliation_content_unexpected")
        elif self.content is None or "\0" in self.content or len(self.content.encode("utf-8")) > 32768:
            raise ValueError("coding_reconciliation_content_invalid")
        return self


class CodingReconciliation(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    review_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    expected_current_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    resolutions: list[ReconciliationResolution] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def bounded_choices(self):
        if (
            len({item.path for item in self.resolutions}) != len(self.resolutions)
            or sum(len(item.content.encode("utf-8")) for item in self.resolutions if item.content is not None) > 65536
        ):
            raise ValueError("coding_reconciliation_choices_invalid")
        return self


def change_flags(origin, selected, current, writable):
    old, checkpoint, fresh = file_records(origin), file_records(selected), file_records(current)
    if list(old) != list(checkpoint) or list(old) != list(fresh):
        raise CodingError("coding_reconciliation_paths_changed")
    return [{
        "path": path, "writable": path in writable,
        "current_changed": fresh[path] != old[path],
        "checkpoint_changed": checkpoint[path] != old[path],
        "diverged": fresh[path] != checkpoint[path],
        "inherited_discarded": (
            path not in writable and checkpoint[path] != old[path] and checkpoint[path] != fresh[path]
        ),
    } for path in fresh]


def comparison(task, project, config, selected, record, origin, current, model):
    changes = change_flags(origin, selected["files"], current, config["writable"])
    value = {
        "schema_version": 1, "unit": "coding_reconciliation", "task_id": task["id"],
        "config": config,
        "source": {
            "id": record["id"], "sha256": record["sha256"], "run_id": record["run_id"],
            "round": selected["round"], "origin_hash": selected["origin_hash"],
            "candidate_hash": selected["candidate_hash"],
        },
        "origin_files": origin, "checkpoint_files": selected["files"], "current_files": current,
        "current_hash": fingerprint(current), "changes": changes,
    }
    return {**value, "review_hash": fingerprint([value, task, project, model])}


def resolved_files(review, choices, writable):
    if choices.expected_current_hash != review["current_hash"]:
        raise CodingError("coding_reconciliation_current_changed")
    if choices.review_hash != review["review_hash"]:
        raise CodingError("coding_reconciliation_review_changed")
    fresh, checkpoint = file_records(review["current_files"]), file_records(review["checkpoint_files"])
    expected = [path for path in fresh if path in writable]
    if [item.path for item in choices.resolutions] != expected:
        raise CodingError("coding_reconciliation_scope_invalid", 422)
    for item in choices.resolutions:
        if item.source == "checkpoint":
            fresh[item.path] = checkpoint[item.path]
        elif item.source == "manual":
            fresh[item.path] = item.content
    records = [
        {"path": path, "content": content, "bytes": len(content.encode("utf-8"))}
        for path, content in fresh.items()
    ]
    try:
        file_records(records)
    except (TypeError, ValueError, UnicodeError) as error:
        raise CodingError("coding_reconciliation_size_invalid", 422) from error
    return records


def validate_frozen_reconciliation(candidate, config):
    snapshot = candidate["snapshot"]
    choices = config.continuation.reconciliation if config.continuation is not None else None
    if choices is None and "reconciliation" not in snapshot:
        return
    try:
        metadata, source = snapshot["reconciliation"], snapshot["continuation"]
        if (
            choices is None or not isinstance(metadata, dict)
            or set(metadata) != {
                "schema_version", "review_hash", "current_hash", "resolved_hash",
                "source_candidate_hash", "source_origin_files", "checkpoint_files", "changes",
            }
            or type(metadata["schema_version"]) is not int or metadata["schema_version"] != 1
            or not isinstance(source, dict)
            or set(source) != {"id", "sha256", "run_id", "round", "origin_hash", "patch"}
            or source["id"] != config.continuation.checkpoint.id
            or source["sha256"] != config.continuation.checkpoint.sha256
            or not isinstance(source["run_id"], str) or not source["run_id"]
            or type(source["round"]) is not int or not 1 <= source["round"] <= 3
            or not isinstance(metadata["source_candidate_hash"], str)
            or re.fullmatch(r"[0-9a-f]{64}", metadata["source_candidate_hash"]) is None
        ):
            raise ValueError("coding_reconciliation_identity_invalid")
        old, checkpoint = file_records(metadata["source_origin_files"]), file_records(metadata["checkpoint_files"])
        current, resolved = snapshot["origin_files"], snapshot["files"]
        if (
            source["origin_hash"] != fingerprint(metadata["source_origin_files"])
            or source["patch"] != code_diff(old, checkpoint)
            or metadata["current_hash"] != fingerprint(current)
            or metadata["resolved_hash"] != fingerprint(resolved)
            or metadata["changes"] != change_flags(
                metadata["source_origin_files"], metadata["checkpoint_files"], current, config.writable,
            )
            or resolved != resolved_files({
                "review_hash": metadata["review_hash"], "current_hash": metadata["current_hash"],
                "current_files": current, "checkpoint_files": metadata["checkpoint_files"],
            }, choices, config.writable)
            or fingerprint({key: value for key, value in candidate.items() if key != "candidate_hash"})
               != candidate["candidate_hash"]
        ):
            raise ValueError("coding_reconciliation_snapshot_invalid")
    except (CodingError, KeyError, TypeError, ValueError, UnicodeError) as error:
        raise CodingError("coding_reconciliation_inconsistent") from error
