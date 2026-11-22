"""Fixed research workflow drafts, immutable versions and exact write receipts."""

from __future__ import annotations

from contextlib import closing, contextmanager
import hashlib
import json
import re
import sqlite3
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .provider import key_available
from .store import dump, now
from .task_query import MAX_PAGE


WORKFLOW_ID = "local-research"
MAX_INTEGER = (1 << 53) - 1
STAGES = (
    ("planning", "coordinator", "coordinator_model"),
    ("research", "researcher", "researcher_model"),
    ("synthesis", "reviewer", "reviewer_model"),
)
RESOURCE_FIELDS = ("max_calls", "parallel", "minutes", "max_output_tokens")
MODEL_IDENTITY_FIELDS = ("id", "kind", "endpoint", "model", "key_env")


class WorkflowError(Exception):
    def __init__(self, code, status=409):
        self.code, self.status = code, status
        super().__init__(code)


def fingerprint(value):
    return hashlib.sha256(json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
    ).encode("utf-8")).hexdigest()


class WorkflowInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


def utf8(value):
    value.encode("utf-8")
    return value


class WorkflowStage(WorkflowInput):
    id: Literal["planning", "research", "synthesis"]
    role: Literal["coordinator", "researcher", "reviewer"]
    model_id: str | None = Field(max_length=100)
    instructions: str = Field(max_length=2000)

    @field_validator("model_id")
    @classmethod
    def identifier(cls, value):
        if value is not None and (not value or value.strip() != value):
            raise ValueError("workflow_model_identifier_invalid")
        return utf8(value) if value is not None else None

    @field_validator("instructions")
    @classmethod
    def instructions_utf8(cls, value):
        return utf8(value)


class WorkflowLimits(WorkflowInput):
    max_calls: int = Field(ge=3, le=8)
    parallel: int = Field(ge=1, le=2)
    minutes: int = Field(ge=1, le=30)
    max_output_tokens: int = Field(ge=256, le=4096)
    research_tasks: int = Field(ge=1, le=2)


class WorkflowDefinition(WorkflowInput):
    schema_version: Literal[1]
    name: str = Field(min_length=1, max_length=80)
    harness: Literal["local-superagent"]
    stages: list[WorkflowStage] = Field(min_length=3, max_length=3)
    limits: WorkflowLimits
    review: Literal["human"]

    @field_validator("schema_version", mode="before")
    @classmethod
    def exact_version(cls, value):
        if type(value) is not int:
            raise ValueError("workflow_schema_invalid")
        return value

    @field_validator("name", mode="before")
    @classmethod
    def name_trim(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("name")
    @classmethod
    def name_utf8(cls, value):
        return utf8(value)

    @model_validator(mode="after")
    def fixed_stages(self):
        if [(stage.id, stage.role) for stage in self.stages] != [
            (stage_id, role) for stage_id, role, _ in STAGES
        ]:
            raise ValueError("workflow_stages_fixed")
        return self


class WorkflowSave(WorkflowInput):
    request_id: str = Field(min_length=8, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    expected_revision: int = Field(ge=1, le=MAX_INTEGER - 1)
    definition: WorkflowDefinition


class WorkflowPublish(WorkflowInput):
    request_id: str = Field(min_length=8, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    expected_revision: int = Field(ge=1, le=MAX_INTEGER)
    definition_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    impact_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    consent: bool = False


def builtin_definition(config=None):
    return {
        "schema_version": 1, "name": "Local research", "harness": "local-superagent",
        "stages": [
            {"id": stage_id, "role": role, "model_id": config[field] if config else None, "instructions": ""}
            for stage_id, role, field in STAGES
        ],
        "limits": {
            **({field: config[field] for field in RESOURCE_FIELDS} if config else {
                "max_calls": 4, "parallel": 2, "minutes": 10, "max_output_tokens": 1800,
            }), "research_tasks": 2,
        },
        "review": "human",
    }


def initialize_workflow(db):
    definition = builtin_definition()
    db.execute(
        "INSERT OR IGNORE INTO workflow_drafts(workflow_id,revision,definition,definition_hash,updated_at)"
        " VALUES(?,1,?,?,?)",
        (WORKFLOW_ID, dump(definition), fingerprint(definition), now()),
    )


def public_version(row):
    return {
        "workflow_id": WORKFLOW_ID, "version": row["version"],
        "definition_hash": row["definition_hash"],
        "definition": json.loads(row["definition"]), "created_at": row["created_at"],
    }


def read_version(db, version):
    if type(version) is not int or not 1 <= version <= MAX_INTEGER:
        raise WorkflowError("workflow_version_invalid", 422)
    row = db.execute(
        "SELECT * FROM workflow_versions WHERE workflow_id=? AND version=?", (WORKFLOW_ID, version),
    ).fetchone()
    if row is None:
        raise WorkflowError("workflow_version_unavailable", 404)
    return public_version(row)


def run_workflow(db, config, version=None):
    if version is None:
        definition = WorkflowDefinition.model_validate(builtin_definition(config)).model_dump()
        return {
            "workflow_id": WORKFLOW_ID, "version": None,
            "definition_hash": fingerprint(definition), "definition": definition,
        }
    selected = read_version(db, version)
    definition = selected["definition"]
    if (
        any(config[field] != stage["model_id"] for stage, (_, _, field) in zip(definition["stages"], STAGES))
        or any(config[field] != definition["limits"][field] for field in RESOURCE_FIELDS)
    ):
        raise WorkflowError("workflow_run_bindings_mismatch")
    return {key: selected[key] for key in ("workflow_id", "version", "definition_hash", "definition")}


def recorded_definition(snapshot):
    if (
        not isinstance(snapshot, dict)
        or set(snapshot) != {"workflow_id", "version", "definition_hash", "definition"}
        or snapshot["workflow_id"] != WORKFLOW_ID
        or (
            snapshot["version"] is not None
            and (type(snapshot["version"]) is not int or not 1 <= snapshot["version"] <= MAX_INTEGER)
        )
    ):
        raise WorkflowError("workflow_snapshot_invalid", 422)
    definition = WorkflowDefinition.model_validate(snapshot["definition"])
    if (
        any(stage.model_id is None for stage in definition.stages)
        or snapshot["definition_hash"] != fingerprint(definition.model_dump())
    ):
        raise WorkflowError("workflow_snapshot_invalid", 422)
    return definition


class WorkflowService:
    def __init__(self, store):
        self.store = store

    @contextmanager
    def reader(self):
        with closing(sqlite3.connect(
            self.store.path.resolve().as_uri() + "?mode=ro", uri=True, timeout=10,
        )) as db:
            db.row_factory = sqlite3.Row
            db.execute("PRAGMA query_only=ON")
            db.execute("BEGIN")
            yield db

    @staticmethod
    def bundle(db):
        row = db.execute("SELECT * FROM workflow_drafts WHERE workflow_id=?", (WORKFLOW_ID,)).fetchone()
        if row is None:
            raise WorkflowError("workflow_unavailable", 404)
        latest = db.execute(
            "SELECT * FROM workflow_versions WHERE workflow_id=? ORDER BY version DESC LIMIT 1",
            (WORKFLOW_ID,),
        ).fetchone()
        return {
            "schema_version": 1, "workflow_id": WORKFLOW_ID,
            "revision": row["revision"], "definition": json.loads(row["definition"]),
            "definition_hash": row["definition_hash"], "updated_at": row["updated_at"],
            "published": public_version(latest) if latest is not None else None,
        }

    def read(self):
        with self.reader() as db:
            return self.bundle(db)

    def versions(self, page=1):
        if type(page) is not int or not 1 <= page <= MAX_PAGE:
            raise WorkflowError("workflow_page_invalid", 422)
        with self.reader() as db:
            total = db.execute(
                "SELECT COUNT(*) FROM workflow_versions WHERE workflow_id=?", (WORKFLOW_ID,),
            ).fetchone()[0]
            total_pages = max(1, (total + 19) // 20)
            current = min(page, total_pages)
            items = [public_version(row) for row in db.execute(
                "SELECT * FROM workflow_versions WHERE workflow_id=? ORDER BY version DESC LIMIT 20 OFFSET ?",
                (WORKFLOW_ID, (current - 1) * 20),
            )]
            return {
                "schema_version": 1, "workflow_id": WORKFLOW_ID, "items": items, "total": total,
                "requested_page": page, "page": current, "page_size": 20,
                "total_pages": total_pages, "has_more": current < total_pages,
            }

    def version(self, version):
        with self.reader() as db:
            return read_version(db, version)

    @staticmethod
    def operation_row(db, request_id):
        row = db.execute(
            "SELECT * FROM workflow_operations WHERE request_id=?", (request_id,),
        ).fetchone()
        return json.loads(row["receipt"]) if row is not None else None

    def operation(self, request_id):
        if not re.fullmatch(r"[A-Za-z0-9_-]{8,100}", request_id):
            raise WorkflowError("workflow_request_invalid", 422)
        with self.reader() as db:
            receipt = self.operation_row(db, request_id)
            if receipt is None:
                raise WorkflowError("workflow_operation_unavailable", 404)
            return receipt

    @classmethod
    def existing(cls, db, request_id, kind, candidate_hash):
        receipt = cls.operation_row(db, request_id)
        if receipt is not None and (
            receipt["kind"] != kind or receipt["candidate_hash"] != candidate_hash
        ):
            raise WorkflowError("workflow_request_conflict")
        return receipt

    def receipt(self, db, body, kind, candidate_hash, result):
        receipt = {
            "request_id": body.request_id, "kind": kind, "candidate_hash": candidate_hash,
            "state": "applied", "result": result,
        }
        db.execute(
            "INSERT INTO workflow_operations(request_id,kind,candidate_hash,receipt,created_at)"
            " VALUES(?,?,?,?,?)",
            (body.request_id, kind, candidate_hash, dump(receipt), now()),
        )
        self.store.event(db, f"workflow.{ 'saved' if kind == 'save' else 'published'}", {
            "workflow_id": WORKFLOW_ID, "request_id": body.request_id,
            "candidate_hash": candidate_hash, "model_execution": False,
        }, entity_id=WORKFLOW_ID, actor="user")
        return receipt

    def save(self, body: WorkflowSave):
        body = WorkflowSave.model_validate(body.model_dump())
        definition = body.definition.model_dump()
        candidate_hash = fingerprint(["save", body.model_dump(exclude={"request_id"})])
        with self.store.transaction() as db:
            existing = self.existing(db, body.request_id, "save", candidate_hash)
            if existing is not None:
                return existing
            current = self.bundle(db)
            if current["revision"] != body.expected_revision:
                raise WorkflowError("workflow_revision_conflict")
            db.execute(
                "UPDATE workflow_drafts SET revision=revision+1,definition=?,definition_hash=?,updated_at=?"
                " WHERE workflow_id=? AND revision=?",
                (dump(definition), fingerprint(definition), now(), WORKFLOW_ID, body.expected_revision),
            )
            return self.receipt(db, body, "save", candidate_hash, self.bundle(db))

    @classmethod
    def impact_in(cls, db, revision, definition_hash):
        current = cls.bundle(db)
        if current["revision"] != revision or current["definition_hash"] != definition_hash:
            raise WorkflowError("workflow_candidate_changed")
        model_ids, dependencies = [], []
        for stage in current["definition"]["stages"]:
            model_id = stage["model_id"]
            if model_id is None:
                raise WorkflowError("workflow_model_required", 422)
            if model_id in model_ids:
                continue
            model_ids.append(model_id)
            model = db.execute("SELECT * FROM models WHERE id=?", (model_id,)).fetchone()
            if model is None:
                raise WorkflowError("workflow_model_unavailable", 422)
            model = dict(model)
            if not key_available(model) and model.get("kind") != "codex_cli":
                raise WorkflowError("workflow_model_key_unavailable", 422)
            dependencies.append({key: model.get(key) for key in MODEL_IDENTITY_FIELDS})
        active, historical = db.execute(
            "SELECT COALESCE(SUM(status NOT IN ('succeeded','failed','canceled')),0),"
            " COALESCE(SUM(status IN ('succeeded','failed','canceled')),0) FROM runs",
        ).fetchone()
        impact = {
            "workflow_id": WORKFLOW_ID, "revision": revision, "definition_hash": definition_hash,
            "model_ids": model_ids, "active_runs": active, "historical_runs": historical,
            "published_version": current["published"]["version"] if current["published"] else None,
        }
        return {**impact, "impact_hash": fingerprint([current["definition"], dependencies, impact])}

    def impact(self, revision, definition_hash):
        if type(revision) is not int or not 1 <= revision <= MAX_INTEGER or not re.fullmatch(r"[0-9a-f]{64}", definition_hash):
            raise WorkflowError("workflow_impact_parameters_invalid", 422)
        with self.reader() as db:
            return self.impact_in(db, revision, definition_hash)

    def publish(self, body: WorkflowPublish):
        body = WorkflowPublish.model_validate(body.model_dump())
        if not body.consent:
            raise WorkflowError("workflow_publish_consent_required", 422)
        candidate_hash = fingerprint(["publish", body.model_dump(exclude={"request_id"})])
        with self.store.transaction() as db:
            existing = self.existing(db, body.request_id, "publish", candidate_hash)
            if existing is not None:
                return existing
            impact = self.impact_in(db, body.expected_revision, body.definition_hash)
            if impact["impact_hash"] != body.impact_hash:
                raise WorkflowError("workflow_impact_changed")
            row = db.execute(
                "SELECT * FROM workflow_versions WHERE workflow_id=? AND definition_hash=?",
                (WORKFLOW_ID, body.definition_hash),
            ).fetchone()
            if row is None:
                current = self.bundle(db)
                version = (current["published"]["version"] if current["published"] else 0) + 1
                db.execute(
                    "INSERT INTO workflow_versions(workflow_id,version,definition_hash,definition,created_at)"
                    " VALUES(?,?,?,?,?)",
                    (WORKFLOW_ID, version, body.definition_hash, dump(current["definition"]), now()),
                )
                row = db.execute(
                    "SELECT * FROM workflow_versions WHERE workflow_id=? AND version=?",
                    (WORKFLOW_ID, version),
                ).fetchone()
            return self.receipt(db, body, "publish", candidate_hash, public_version(row))
