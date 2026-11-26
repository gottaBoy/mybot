"""Single-use permission for an owner-prepared candidate, separate from pairing."""

from datetime import datetime, timedelta, timezone
import json

from pydantic import Field

from .devices import (
    DeviceError, DeviceInput, REQUEST_PATTERN, command_hash, exact_identifier,
    public_device, request_identifier,
)
from .store import dump, now
from .task_turns import TaskTurnExecute


class ExecutionGrantCreate(DeviceInput):
    request_id: str = Field(pattern=REQUEST_PATTERN)
    turn_id: str = Field(min_length=1, max_length=100)
    candidate_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    expected_device_revision: int = Field(ge=1, le=1)
    consent: bool = False


class ExecutionGrantRevoke(DeviceInput):
    request_id: str = Field(pattern=REQUEST_PATTERN)
    expected_revision: int = Field(ge=1, le=1)
    consent: bool = False


class DeviceExecutionService:
    def __init__(self, devices):
        self.devices = devices
        self.store, self.turns = devices.store, devices.task_turns

    @staticmethod
    def owner_device(db, identifier):
        exact_identifier(identifier)
        device = db.execute("SELECT * FROM devices WHERE id=?", (identifier,)).fetchone()
        if device is None:
            raise DeviceError("device_unavailable", 404)
        return device

    def public(self, db, row):
        turn = self.turns.turn(db, row["task_id"], row["turn_id"])
        state = (
            "applied" if row["run_id"] is not None else
            "revoked" if row["revoked_at"] is not None else
            "superseded" if turn["state"] == "applied" else
            "expired" if row["expires_at"] <= now() else "authorized"
        )
        if row["run_id"] is not None:
            linked = db.execute(
                "SELECT task_id,request_id FROM runs WHERE id=?", (row["run_id"],),
            ).fetchone()
            if (linked is None or turn["state"] != "applied" or turn["run_id"] != row["run_id"]
                    or linked["task_id"] != row["task_id"] or linked["request_id"] != turn["request_id"]):
                raise DeviceError("device_execution_receipt_inconsistent")
        return {**json.loads(row["summary"]), **{key: row[key] for key in (
            "id", "device_id", "task_id", "turn_id", "candidate_hash",
            "created_at", "expires_at", "revoked_at", "revision", "run_id",
        )}, "state": state}

    @staticmethod
    def summary(row):
        candidate = json.loads(row["candidate"])
        config, snapshot = candidate["config"], candidate["snapshot"]
        return {
            "turn_request_id": row["request_id"], "content": row["content"],
            "context_hash": snapshot["context_hash"],
            "resources": {key: config[key] for key in (
                "max_calls", "parallel", "minutes", "max_output_tokens",
            )},
            "models": [{
                "role": field, "id": config[field],
                **{key: candidate["context"]["models"][config[field]][key]
                   for key in ("name", "model", "kind")},
            } for field in ("coordinator_model", "researcher_model", "reviewer_model")],
            "source_count": len(snapshot["evidence"]), "source_bytes": snapshot["bytes"],
            "workflow_version": snapshot.get("workflow", {}).get("version"),
            **({"artifact_count": len(snapshot["artifacts"])} if snapshot.get("artifacts") else {}),
        }

    def current(self, db, device):
        row = db.execute(
            "SELECT * FROM device_execution_grants WHERE device_id=?"
            " ORDER BY created_at DESC,rowid DESC LIMIT 1", (device["id"],),
        ).fetchone()
        return self.public(db, row) if row is not None else None

    def owner(self, device_id):
        with self.devices.reader() as db:
            device = self.owner_device(db, device_id)
            prepared = db.execute(
                "SELECT * FROM task_turns WHERE task_id=? AND state='prepared'",
                (device["task_id"],),
            ).fetchone()
            return {
                "schema_version": 1, "device": public_device(device),
                "prepared": ({
                    "turn_id": prepared["id"],
                    "candidate_hash": json.loads(prepared["candidate"])["candidate_hash"],
                    **self.summary(prepared),
                } if prepared is not None else None),
                "grant": self.current(db, device),
            }

    @staticmethod
    def prior(db, request_id, kind, fingerprint):
        row = db.execute(
            "SELECT * FROM device_execution_operations WHERE request_id=?", (request_id,),
        ).fetchone()
        if row is None:
            return None
        if row["kind"] != kind or row["candidate_hash"] != fingerprint:
            raise DeviceError("device_execution_request_conflict")
        return json.loads(row["receipt"])

    def receipt(self, db, request_id, kind, fingerprint, grant):
        receipt = {
            "request_id": request_id, "kind": kind, "candidate_hash": fingerprint,
            "state": "applied", "grant": grant,
        }
        db.execute(
            "INSERT INTO device_execution_operations VALUES(?,?,?,?,?)",
            (request_id, kind, fingerprint, dump(receipt), now()),
        )
        return receipt

    def create(self, device_id, body):
        body = ExecutionGrantCreate.model_validate(body.model_dump())
        exact_identifier(body.turn_id)
        if not body.consent:
            raise DeviceError("device_execution_consent_required", 422)
        fingerprint = command_hash({"kind": "grant", "device_id": device_id, **body.model_dump()})
        with self.store.transaction() as db:
            prior = self.prior(db, body.request_id, "grant", fingerprint)
            if prior is not None:
                return prior
            device = self.owner_device(db, device_id)
            if (device["revoked_at"] is not None or device["expires_at"] <= now()
                    or device["revision"] != body.expected_device_revision):
                raise DeviceError("device_execution_device_unavailable")
            row = self.turns.turn(db, device["task_id"], body.turn_id)
            if row["state"] != "prepared":
                raise DeviceError("device_execution_not_prepared")
            if json.loads(row["candidate"])["candidate_hash"] != body.candidate_hash:
                raise DeviceError("device_execution_candidate_changed")
            self.turns.require_ready(db, device["task_id"], body.turn_id)
            for grant in db.execute(
                "SELECT * FROM device_execution_grants WHERE (device_id=? OR turn_id=?)"
                " AND revoked_at IS NULL AND run_id IS NULL AND expires_at>?",
                (device_id, body.turn_id, now()),
            ).fetchall():
                if self.public(db, grant)["state"] == "authorized":
                    raise DeviceError("device_execution_grant_pending")
            created = datetime.now(timezone.utc)
            expires = min(created + timedelta(seconds=600), datetime.fromisoformat(device["expires_at"]))
            if expires <= created:
                raise DeviceError("device_execution_device_unavailable")
            db.execute(
                "INSERT INTO device_execution_grants"
                "(id,device_id,task_id,turn_id,candidate_hash,summary,created_at,expires_at,revision)"
                " VALUES(?,?,?,?,?,?,?,?,1)",
                (body.request_id, device_id, device["task_id"], body.turn_id, body.candidate_hash,
                 dump(self.summary(row)), created.isoformat(), expires.isoformat()),
            )
            self.store.event(db, "device.execution.granted", {
                "task_id": device["task_id"], "device_id": device_id,
                "turn_id": body.turn_id, "grant_id": body.request_id,
                "candidate_hash": body.candidate_hash, "execution_started": False,
            }, entity_id=body.request_id, actor="user")
            grant = db.execute(
                "SELECT * FROM device_execution_grants WHERE id=?", (body.request_id,),
            ).fetchone()
            return self.receipt(db, body.request_id, "grant", fingerprint, self.public(db, grant))

    def revoke(self, device_id, grant_id, body):
        body = ExecutionGrantRevoke.model_validate(body.model_dump())
        request_identifier(grant_id)
        if not body.consent:
            raise DeviceError("device_execution_consent_required", 422)
        fingerprint = command_hash({
            "kind": "revoke", "device_id": device_id, "grant_id": grant_id, **body.model_dump(),
        })
        with self.store.transaction() as db:
            prior = self.prior(db, body.request_id, "revoke", fingerprint)
            if prior is not None:
                return prior
            self.owner_device(db, device_id)
            grant = self.exact(db, device_id, grant_id)
            if grant["revision"] != body.expected_revision or self.public(db, grant)["state"] != "authorized":
                raise DeviceError("device_execution_grant_changed")
            db.execute(
                "UPDATE device_execution_grants SET revoked_at=?,revision=2 WHERE id=?",
                (now(), grant_id),
            )
            self.store.event(db, "device.execution.revoked", {
                "task_id": grant["task_id"], "device_id": device_id, "grant_id": grant_id,
            }, entity_id=grant_id, actor="user")
            updated = self.exact(db, device_id, grant_id)
            return self.receipt(db, body.request_id, "revoke", fingerprint, self.public(db, updated))

    def operation(self, device_id, request_id):
        request_identifier(request_id)
        with self.devices.reader() as db:
            self.owner_device(db, device_id)
            row = db.execute(
                "SELECT receipt FROM device_execution_operations WHERE request_id=?", (request_id,),
            ).fetchone()
            if row is None:
                raise DeviceError("device_execution_operation_unavailable", 404)
            receipt = json.loads(row["receipt"])
            if receipt["grant"]["device_id"] != device_id:
                raise DeviceError("device_execution_operation_unavailable", 404)
            return receipt

    @staticmethod
    def exact(db, device_id, grant_id):
        row = db.execute(
            "SELECT * FROM device_execution_grants WHERE id=? AND device_id=?",
            (grant_id, device_id),
        ).fetchone()
        if row is None:
            raise DeviceError("device_execution_grant_unavailable", 404)
        return row

    def read(self, token, expected_device_id, grant_id=None):
        if grant_id is not None:
            request_identifier(grant_id)
        with self.devices.reader() as db:
            device = self.devices.active(db, token)
            self.devices.require_identity(device, expected_device_id)
            return {
                "schema_version": 1, "device_id": device["id"], "task_id": device["task_id"],
                "grant": (self.public(db, self.exact(db, device["id"], grant_id))
                          if grant_id is not None else self.current(db, device)),
            }

    def execute(self, token, expected_device_id, grant_id, body):
        request_identifier(grant_id)
        body = TaskTurnExecute.model_validate(body.model_dump())
        if not body.consent:
            raise DeviceError("device_execution_consent_required", 422)
        with self.store.transaction() as db:
            device = self.devices.active(db, token)
            self.devices.require_identity(device, expected_device_id)
            grant = self.exact(db, device["id"], grant_id)
            if grant["task_id"] != device["task_id"] or grant["candidate_hash"] != body.candidate_hash:
                raise DeviceError("device_execution_candidate_changed")
            public = self.public(db, grant)
            if public["state"] == "applied":
                return {"schema_version": 1, "device_id": device["id"],
                        "task_id": device["task_id"], "grant": public}
            if public["state"] != "authorized":
                raise DeviceError("device_execution_grant_changed")
            turn = self.turns.execute_in_transaction(
                db, grant["task_id"], grant["turn_id"], body, actor=f"device:{device['id']}",
            )
            db.execute("UPDATE device_execution_grants SET run_id=? WHERE id=?", (turn["run_id"], grant_id))
            self.store.event(db, "device.execution.applied", {
                "task_id": grant["task_id"], "device_id": device["id"], "grant_id": grant_id,
                "turn_id": grant["turn_id"], "candidate_hash": body.candidate_hash,
                "execution_success": False,
            }, turn["run_id"], entity_id=grant_id, actor=f"device:{device['id']}")
            return {
                "schema_version": 1, "device_id": device["id"], "task_id": device["task_id"],
                "grant": self.public(db, self.exact(db, device["id"], grant_id)),
            }
