"""User-triggered connection management, separate from provider execution."""

from __future__ import annotations

from .backend import (
    BackendConnection, BackendError, ConversationRef, MessageRef,
    OPENMAUSBOT_FORK_COMMIT, OpenMausBotNativeReadAdapter,
)
from .schemas import BackendCreate
from .store import Store


class BackendService:
    def __init__(self, store: Store, adapter=None):
        self.store = store
        self.adapter = adapter or OpenMausBotNativeReadAdapter()

    def configure(self, body: BackendCreate) -> dict:
        return self.store.add_backend({
            **body.model_dump(), "status": "configured",
            "settings": {"source_commit": OPENMAUSBOT_FORK_COMMIT, "read_only": True},
        })

    def health(self, identifier: str) -> dict:
        row = self.store.get("backend_connections", identifier)
        revoked = row["status"] == "revoked" or bool(row["revoked_at"])
        return {
            "connection_id": identifier,
            "status": "revoked" if revoked else row.get("test_status") or "untested",
            "tested_at": row.get("tested_at"),
            "authentication": "unverified",
            "read_access_verified": False,
            "read_only": True,
        }

    async def check_health(self, identifier: str, consent: bool) -> dict:
        if not consent:
            raise BackendError("backend_check_confirmation_required")
        row = self.store.get("backend_connections", identifier)
        if row["status"] == "revoked" or row["revoked_at"]:
            raise BackendError("backend_revoked")
        if row["status"] != "configured":
            raise BackendError("backend_not_configured")
        # Revalidate persisted endpoints; old/internal records cannot bypass
        # the same origin restriction applied to new API configurations.
        try:
            BackendCreate(name=row["name"], kind=row["kind"], endpoint=row["endpoint"])
        except ValueError as exc:
            raise BackendError("backend_endpoint_invalid") from exc
        connection = BackendConnection(
            row["id"], row["name"], row["kind"], row["endpoint"], row["status"],
            row["revoked_at"], row["settings"],
        )
        try:
            await self.adapter.check_health(connection)
            status = "reachable"
        except BackendError as exc:
            status = exc.code
        self.store.record_backend_check(identifier, status)
        return self.health(identifier)

    def revoke(self, identifier: str) -> dict:
        return self.store.revoke_backend(identifier)

    async def sync_conversations(self, identifier: str, consent: bool) -> dict:
        if not consent:
            raise BackendError("backend_read_confirmation_required")
        row = self.store.get("backend_connections", identifier)
        if row["status"] == "revoked" or row["revoked_at"]:
            raise BackendError("backend_revoked")
        connection = BackendConnection(
            row["id"], row["name"], row["kind"], row["endpoint"], row["status"],
            row["revoked_at"], row["settings"],
        )
        refs, cursor = await self.adapter.list_conversations(connection)
        saved = self.store.upsert_conversations(identifier, [
            {"external_id": ref.external_id, "title": ref.title, "status": ref.status, "cursor": ref.cursor}
            for ref in refs
        ])
        return {"status": "synced", "count": len(saved), "next_cursor": cursor, "read_only": True}

    async def sync_messages(self, identifier: str, consent: bool) -> dict:
        if not consent:
            raise BackendError("backend_read_confirmation_required")
        conversation = self.store.get("conversation_refs", identifier)
        connection = self.store.get("backend_connections", conversation["connection_id"])
        if connection["status"] == "revoked" or connection["revoked_at"]:
            raise BackendError("backend_revoked")
        ref = ConversationRef(
            conversation["id"], conversation["connection_id"], conversation["external_id"],
            conversation["title"], conversation["status"], conversation["cursor"],
        )
        messages, cursor = await self.adapter.list_messages(ref)
        saved = self.store.upsert_messages(identifier, [
            {"external_id": msg.external_id, "role": msg.role, "content": msg.content,
             "created_at": msg.created_at}
            for msg in messages
        ])
        return {"status": "synced", "count": len(saved), "next_cursor": cursor, "read_only": True}
