"""Revocable, Task-scoped browser identities; no execution or credential discovery."""

from __future__ import annotations

from contextlib import closing, contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
import re
import secrets
import sqlite3

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .store import dump, now, uid
from .task_query import MAX_PAGE
from .task_turns import TaskTurnCreate


DEVICE_COOKIE = "workbench_device"
SCOPES = ["task_read", "message_save"]
MAX_INTEGER = (1 << 53) - 1
PAIR_SECONDS = 600
DEVICE_SECONDS = 30 * 86400
REQUEST_PATTERN = r"^[A-Za-z0-9_-]{8,100}$"
SECRET_PATTERN = r"^[A-Za-z0-9_-]{43}$"


class DeviceError(Exception):
    def __init__(self, code, status=409):
        self.code, self.status = code, status
        super().__init__(code)


def secret_hash(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def command_hash(command):
    return secret_hash(json.dumps(command, sort_keys=True, ensure_ascii=False, separators=(",", ":")))


def request_identifier(value):
    if not isinstance(value, str) or not re.fullmatch(REQUEST_PATTERN, value):
        raise DeviceError("device_request_invalid", 422)
    return value


def exact_identifier(value):
    if not isinstance(value, str) or not 1 <= len(value) <= 100 or value.strip() != value:
        raise DeviceError("device_identifier_invalid", 422)
    try:
        value.encode("utf-8")
    except UnicodeError as error:
        raise DeviceError("device_identifier_invalid", 422) from error
    return value


class DeviceInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class PairingCreate(DeviceInput):
    request_id: str = Field(pattern=REQUEST_PATTERN)
    task_id: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=80)
    pair_secret: str = Field(pattern=SECRET_PATTERN)
    consent: bool = False

    @field_validator("task_id")
    @classmethod
    def task_identifier(cls, value):
        return exact_identifier(value)

    @field_validator("label")
    @classmethod
    def label_text(cls, value):
        value.encode("utf-8")
        if not value.strip() or value.strip() != value:
            raise ValueError("device_label_invalid")
        return value


class DeviceClaim(DeviceInput):
    request_id: str = Field(pattern=REQUEST_PATTERN)
    pairing_id: str = Field(pattern=REQUEST_PATTERN)
    pair_secret: str = Field(pattern=SECRET_PATTERN)
    device_name: str = Field(min_length=1, max_length=80)
    device_secret: str = Field(pattern=SECRET_PATTERN)

    @field_validator("device_name")
    @classmethod
    def name_text(cls, value):
        return PairingCreate.label_text(value)


class DeviceRevoke(DeviceInput):
    request_id: str = Field(pattern=REQUEST_PATTERN)
    expected_revision: int = Field(ge=1, le=2)
    consent: bool = False


def public_device(row):
    return {
        **{key: row[key] for key in (
            "id", "name", "task_id", "pairing_id", "claim_request_id",
            "created_at", "expires_at", "revoked_at", "revision",
        )},
        "scopes": list(SCOPES),
    }


def public_pairing(row, clock):
    return {
        **{key: row[key] for key in (
            "id", "task_id", "label", "created_at", "expires_at", "device_id",
        )},
        "state": "claimed" if row["device_id"] is not None else (
            "expired" if row["expires_at"] <= clock else "available"
        ),
    }


def public_message(row):
    value = dict(row)
    if value.get("discarded_at") is not None:
        value["state"] = "discarded"
    return {key: value[key] for key in ("id", "request_id", "content", "created_at", "state", "run_id")}


class DeviceService:
    def __init__(self, store, task_turns):
        self.store, self.task_turns = store, task_turns

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
    def active(db, token):
        if not isinstance(token, str) or not re.fullmatch(SECRET_PATTERN, token):
            raise DeviceError("device_session_unavailable", 401)
        row = db.execute("SELECT * FROM devices WHERE token_hash=?", (secret_hash(token),)).fetchone()
        if row is None or row["revoked_at"] is not None or row["expires_at"] <= now():
            raise DeviceError("device_session_unavailable", 401)
        if db.execute("SELECT 1 FROM tasks WHERE id=?", (row["task_id"],)).fetchone() is None:
            raise DeviceError("device_session_unavailable", 401)
        return row

    def session(self, token):
        with self.reader() as db:
            try:
                device = public_device(self.active(db, token))
            except DeviceError:
                device = None
        return {"schema_version": 1, "device": device}

    @staticmethod
    def require_identity(device, expected_device_id):
        if expected_device_id is None:
            raise DeviceError("device_identity_required", 422)
        if expected_device_id != device["id"]:
            raise DeviceError("device_identity_changed")

    @staticmethod
    def prior(db, request_id, kind, candidate_hash):
        row = db.execute("SELECT * FROM device_operations WHERE request_id=?", (request_id,)).fetchone()
        if row is None:
            return None
        if row["kind"] != kind or row["candidate_hash"] != candidate_hash:
            raise DeviceError("device_request_conflict")
        return json.loads(row["receipt"])

    @staticmethod
    def receipt(db, request_id, kind, candidate_hash, result):
        receipt = {
            "request_id": request_id, "kind": kind, "candidate_hash": candidate_hash,
            "state": "applied", "result": result,
        }
        db.execute(
            "INSERT INTO device_operations(request_id,kind,candidate_hash,receipt,created_at) VALUES(?,?,?,?,?)",
            (request_id, kind, candidate_hash, dump(receipt), now()),
        )
        return receipt

    def pair(self, body):
        body = PairingCreate.model_validate(body.model_dump())
        if not body.consent:
            raise DeviceError("device_pair_consent_required", 422)
        command = {"kind": "pair", **body.model_dump()}
        command["pair_secret"] = secret_hash(body.pair_secret)
        candidate_hash = command_hash(command)
        with self.store.transaction() as db:
            prior = self.prior(db, body.request_id, "pair", candidate_hash)
            if prior is not None:
                return prior
            if db.execute("SELECT 1 FROM tasks WHERE id=?", (body.task_id,)).fetchone() is None:
                raise DeviceError("device_task_unavailable", 404)
            created = datetime.now(timezone.utc)
            db.execute(
                "INSERT INTO device_pairings(id,task_id,label,secret_hash,created_at,expires_at)"
                " VALUES(?,?,?,?,?,?)",
                (body.request_id, body.task_id, body.label, secret_hash(body.pair_secret),
                 created.isoformat(), (created + timedelta(seconds=PAIR_SECONDS)).isoformat()),
            )
            row = db.execute("SELECT * FROM device_pairings WHERE id=?", (body.request_id,)).fetchone()
            return self.receipt(db, body.request_id, "pair", candidate_hash, public_pairing(row, now()))

    def pairing(self, pairing_id):
        request_identifier(pairing_id)
        with self.reader() as db:
            row = db.execute("SELECT * FROM device_pairings WHERE id=?", (pairing_id,)).fetchone()
            if row is None:
                raise DeviceError("device_pairing_unavailable", 404)
            return public_pairing(row, now())

    def claim(self, body):
        body = DeviceClaim.model_validate(body.model_dump())
        candidate = body.model_dump()
        for key in ("pair_secret", "device_secret"):
            candidate[key] = secret_hash(candidate[key])
        candidate_hash = command_hash(candidate)
        with self.store.transaction() as db:
            prior = db.execute(
                "SELECT * FROM devices WHERE claim_request_id=?", (body.request_id,),
            ).fetchone()
            if prior is not None:
                if prior["claim_hash"] != candidate_hash:
                    raise DeviceError("device_claim_conflict")
                self.active(db, body.device_secret)
                return public_device(prior)
            pairing = db.execute(
                "SELECT * FROM device_pairings WHERE id=?", (body.pairing_id,),
            ).fetchone()
            if pairing is None or not secrets.compare_digest(
                pairing["secret_hash"], secret_hash(body.pair_secret),
            ):
                raise DeviceError("device_pairing_invalid", 403)
            if pairing["device_id"] is not None:
                raise DeviceError("device_pairing_used")
            if pairing["expires_at"] <= now():
                raise DeviceError("device_pairing_expired")
            if db.execute("SELECT 1 FROM devices WHERE token_hash=?", (secret_hash(body.device_secret),)).fetchone():
                raise DeviceError("device_claim_conflict")
            identifier, created = uid(), datetime.now(timezone.utc)
            db.execute(
                "INSERT INTO devices(id,name,task_id,pairing_id,claim_request_id,claim_hash,token_hash,"
                "created_at,expires_at,revision) VALUES(?,?,?,?,?,?,?,?,?,1)",
                (identifier, body.device_name, pairing["task_id"], body.pairing_id, body.request_id,
                 candidate_hash, secret_hash(body.device_secret), created.isoformat(),
                 (created + timedelta(seconds=DEVICE_SECONDS)).isoformat()),
            )
            db.execute("UPDATE device_pairings SET device_id=? WHERE id=?", (identifier, body.pairing_id))
            return public_device(db.execute("SELECT * FROM devices WHERE id=?", (identifier,)).fetchone())

    def list(self, page=1):
        if type(page) is not int or not 1 <= page <= MAX_PAGE:
            raise DeviceError("device_page_invalid", 422)
        with self.reader() as db:
            total = db.execute("SELECT COUNT(*) FROM devices").fetchone()[0]
            total_pages = max(1, (total + 19) // 20)
            current = min(page, total_pages)
            items = [public_device(row) for row in db.execute(
                "SELECT * FROM devices ORDER BY created_at DESC,rowid ASC LIMIT 20 OFFSET ?",
                ((current - 1) * 20,),
            )]
        return {
            "schema_version": 1, "unit": "devices", "items": items, "total": total,
            "requested_page": page, "page": current, "page_size": 20,
            "total_pages": total_pages, "has_more": current < total_pages,
        }

    def revoke(self, identifier, body):
        exact_identifier(identifier)
        body = DeviceRevoke.model_validate(body.model_dump())
        if not body.consent:
            raise DeviceError("device_revoke_consent_required", 422)
        candidate_hash = command_hash({"kind": "revoke", "device_id": identifier, **body.model_dump()})
        with self.store.transaction() as db:
            prior = self.prior(db, body.request_id, "revoke", candidate_hash)
            if prior is not None:
                return prior
            row = db.execute("SELECT * FROM devices WHERE id=?", (identifier,)).fetchone()
            if row is None:
                raise DeviceError("device_unavailable", 404)
            if row["revision"] != body.expected_revision:
                raise DeviceError("device_revision_changed")
            if row["revoked_at"] is not None:
                raise DeviceError("device_already_revoked")
            db.execute("UPDATE devices SET revoked_at=?,revision=2 WHERE id=?", (now(), identifier))
            result = public_device(db.execute("SELECT * FROM devices WHERE id=?", (identifier,)).fetchone())
            return self.receipt(db, body.request_id, "revoke", candidate_hash, result)

    def operation(self, request_id):
        request_identifier(request_id)
        with self.reader() as db:
            row = db.execute("SELECT receipt FROM device_operations WHERE request_id=?", (request_id,)).fetchone()
            if row is None:
                raise DeviceError("device_operation_unavailable", 404)
            return json.loads(row["receipt"])

    @staticmethod
    def event_scope():
        return (
            " FROM events e LEFT JOIN runs r ON r.id=e.run_id"
            " WHERE (r.task_id=? OR e.entity_id=? OR json_extract(e.payload,'$.task_id')=?)"
        )

    def watermark(self, db, task_id):
        return db.execute(
            "SELECT COALESCE(MAX(e.seq),0)" + self.event_scope(), (task_id,) * 3,
        ).fetchone()[0]

    def task(self, token):
        with self.reader() as db:
            device = self.active(db, token)
            task_id = device["task_id"]
            task = db.execute("SELECT id,title,goal,acceptance FROM tasks WHERE id=?", (task_id,)).fetchone()
            latest = db.execute(
                "SELECT id,task_id,status,created_at FROM runs WHERE task_id=?"
                " AND run_kind='execution' ORDER BY created_at DESC,rowid ASC LIMIT 1", (task_id,),
            ).fetchone()
            messages = [public_message(row) for row in db.execute(
                "SELECT * FROM task_turns WHERE task_id=? ORDER BY created_at DESC,rowid ASC LIMIT 20",
                (task_id,),
            )]
            total = db.execute("SELECT COUNT(*) FROM task_turns WHERE task_id=?", (task_id,)).fetchone()[0]
            report = db.execute(
                "SELECT id,run_id,title,content,decision FROM artifacts WHERE run_id=? AND kind='report'"
                " ORDER BY created_at DESC,rowid ASC LIMIT 1", (latest["id"],),
            ).fetchone() if latest is not None else None
            if report is not None:
                report = {**dict(report), "content": report["content"][:20000],
                          "truncated": len(report["content"]) > 20000}
            return {
                "schema_version": 1, "device_id": device["id"], "task": dict(task),
                "latest_run": dict(latest) if latest is not None else None,
                "messages": {"items": messages, "total": total}, "report": report,
                "cursor": self.watermark(db, task_id), "run_history": True,
                "execution_delegation": True,
            }

    def runs(self, token, page=1, expected_device_id=None):
        if type(page) is not int or not 1 <= page <= MAX_PAGE:
            raise DeviceError("device_page_invalid", 422)
        with self.reader() as db:
            device = self.active(db, token)
            self.require_identity(device, expected_device_id)
            total = db.execute(
                "SELECT COUNT(*) FROM runs WHERE task_id=? AND run_kind='execution'",
                (device["task_id"],),
            ).fetchone()[0]
            total_pages = max(1, (total + 19) // 20)
            current = min(page, total_pages)
            items = [dict(row) for row in db.execute(
                "SELECT id,task_id,status,created_at FROM runs WHERE task_id=? AND run_kind='execution'"
                " ORDER BY created_at DESC,rowid ASC LIMIT 20 OFFSET ?",
                (device["task_id"], (current - 1) * 20),
            )]
            return {
                "schema_version": 1, "device_id": device["id"], "task_id": device["task_id"],
                "items": items, "total": total, "requested_page": page, "page": current,
                "page_size": 20, "total_pages": total_pages, "has_more": current < total_pages,
            }

    def run(self, token, identifier, expected_device_id=None):
        exact_identifier(identifier)
        with self.reader() as db:
            device = self.active(db, token)
            self.require_identity(device, expected_device_id)
            run = db.execute(
                "SELECT id,task_id,status,created_at FROM runs WHERE id=? AND task_id=?",
                (identifier, device["task_id"]),
            ).fetchone()
            if run is None:
                raise DeviceError("device_run_unavailable", 404)
            report = db.execute(
                "SELECT id,run_id,title,content,decision FROM artifacts WHERE run_id=? AND kind='report'"
                " ORDER BY created_at DESC,rowid ASC LIMIT 1", (identifier,),
            ).fetchone()
            if report is not None:
                report = {**dict(report), "content": report["content"][:20000],
                          "truncated": len(report["content"]) > 20000}
            return {
                "schema_version": 1, "device_id": device["id"], "task_id": device["task_id"],
                "run": dict(run), "report": report,
            }

    def events(self, token, after):
        if type(after) is not int or not 0 <= after <= MAX_INTEGER:
            raise DeviceError("device_cursor_invalid", 422)
        with self.reader() as db:
            device = self.active(db, token)
            task_id = device["task_id"]
            watermark = self.watermark(db, task_id)
            if after > watermark:
                raise DeviceError("device_cursor_reset")
            rows = db.execute(
                "SELECT e.seq,e.id,e.run_id,e.kind,e.created_at" + self.event_scope()
                + " AND e.seq>? AND e.seq<=? ORDER BY e.seq ASC LIMIT 51",
                (*((task_id,) * 3), after, watermark),
            ).fetchall()
            more, items = len(rows) > 50, [dict(row) for row in rows[:50]]
            return {
                "schema_version": 1, "device_id": device["id"], "task_id": task_id,
                "after": after, "items": items, "next_cursor": items[-1]["seq"] if more else watermark,
                "watermark": watermark, "has_more": more,
            }

    def save_message(self, token, body, expected_device_id=None):
        body = TaskTurnCreate.model_validate(body.model_dump())
        with self.store.transaction() as db:
            device = self.active(db, token)
            self.require_identity(device, expected_device_id)
            mapping = db.execute(
                "SELECT * FROM device_messages WHERE request_id=?", (body.request_id,),
            ).fetchone()
            if mapping is not None and mapping["device_id"] != device["id"]:
                raise DeviceError("device_message_request_conflict")
            if mapping is None and db.execute(
                "SELECT 1 FROM task_turns WHERE request_id=?", (body.request_id,),
            ).fetchone():
                raise DeviceError("device_message_request_conflict")
            turn = self.task_turns.save_in_transaction(
                db, device["task_id"], body, actor=f"device:{device['id']}",
            )
            if mapping is None:
                db.execute(
                    "INSERT INTO device_messages(request_id,device_id,turn_id,created_at) VALUES(?,?,?,?)",
                    (body.request_id, device["id"], turn["id"], now()),
                )
            return public_message(turn)

    def message_receipt(self, token, request_id, expected_device_id=None):
        request_identifier(request_id)
        with self.reader() as db:
            device = self.active(db, token)
            self.require_identity(device, expected_device_id)
            row = db.execute(
                "SELECT t.* FROM device_messages m JOIN task_turns t ON t.id=m.turn_id"
                " WHERE m.request_id=? AND m.device_id=? AND t.task_id=?",
                (request_id, device["id"], device["task_id"]),
            ).fetchone()
            if row is None:
                raise DeviceError("device_message_unavailable", 404)
            return public_message(row)
