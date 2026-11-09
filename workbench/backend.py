"""Read-only conversation backend contracts.

No network client lives here. Upstream adapters map their identities and
states into these stable mybot-owned value shapes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import httpx

class BackendError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class BackendConnection:
    id: str
    name: str
    kind: str
    endpoint: str
    status: str
    revoked_at: str | None = None
    settings: dict | None = None


@dataclass(frozen=True)
class ConversationRef:
    id: str
    connection_id: str
    external_id: str
    title: str
    status: str
    cursor: str | None = None


@dataclass(frozen=True)
class MessageRef:
    external_id: str
    conversation_id: str
    role: str
    content: str
    created_at: str | None


class ConversationBackendPort(Protocol):
    async def list_conversations(
        self, connection: BackendConnection, *, cursor: str | None = None,
    ) -> tuple[list[ConversationRef], str | None]:
        ...

    async def list_messages(
        self, conversation: ConversationRef, *, cursor: str | None = None,
    ) -> tuple[list[MessageRef], str | None]:
        ...


class UnconfiguredConversationBackend:
    async def list_conversations(self, connection, *, cursor=None):
        if connection.status != "unconfigured":
            raise BackendError("backend_adapter_not_configured")
        return [], None

    async def list_messages(self, conversation, *, cursor=None):
        raise BackendError("backend_adapter_not_configured")


class OpenMausBotReadOnlyAdapter:
    """Narrow HTTP read adapter for isolated contract testing.

    Endpoint paths are configuration, not claims about the upstream fork's
    public API. No write method exists in this adapter.
    """

    def __init__(self, client: httpx.AsyncClient | None = None):
        self.client = client
        self._connections: dict[str, BackendConnection] = {}

    async def list_conversations(self, connection, *, cursor=None):
        self._connections[connection.id] = connection
        return await self._list(
            connection, connection.settings.get("conversations_path", "/conversations")
            if connection.settings else "/conversations",
            cursor=cursor, collection_keys=("conversations", "threads", "items"),
            mapper=lambda item: self._conversation(connection, item),
        )

    async def list_messages(self, conversation, *, cursor=None):
        connection = self._connections.get(conversation.connection_id)
        if connection is None:
            raise BackendError("backend_connection_unknown")
        path = f"/conversations/{conversation.external_id}/messages"
        return await self._list(
            connection, path, cursor=cursor, collection_keys=("messages", "items"),
            mapper=lambda item: self._message(conversation, item),
        )

    async def _list(self, connection, path, *, cursor, collection_keys, mapper):
        if connection.status == "revoked" or connection.revoked_at:
            raise BackendError("backend_revoked")
        if connection.status != "configured":
            raise BackendError("backend_not_configured")
        client = self.client
        owned = client is None
        if owned:
            client = httpx.AsyncClient(
                base_url=connection.endpoint, follow_redirects=False,
                trust_env=False, timeout=httpx.Timeout(20, connect=5),
            )
        try:
            params = {"cursor": cursor} if cursor else {}
            response = await client.get(path, params=params)
        except httpx.HTTPError as exc:
            raise BackendError("backend_unreachable") from exc
        finally:
            if owned:
                await client.aclose()
        if response.status_code == 403:
            raise BackendError("backend_access_denied")
        if response.status_code == 404:
            raise BackendError("backend_not_found")
        if response.status_code >= 400:
            raise BackendError(f"backend_http_{response.status_code}")
        try:
            payload = response.json()
        except ValueError as exc:
            raise BackendError("backend_schema_invalid") from exc
        if not isinstance(payload, dict):
            raise BackendError("backend_schema_invalid")
        items = next((payload[key] for key in collection_keys if isinstance(payload.get(key), list)), None)
        if items is None:
            raise BackendError("backend_schema_invalid")
        try:
            values = [mapper(item) for item in items]
        except (KeyError, TypeError, ValueError) as exc:
            raise BackendError("backend_schema_invalid") from exc
        next_cursor = payload.get("next_cursor", payload.get("nextCursor"))
        if next_cursor is not None and not isinstance(next_cursor, str):
            raise BackendError("backend_schema_invalid")
        return dedupe_refs(values), next_cursor

    @staticmethod
    def _conversation(connection, item):
        if not isinstance(item, dict):
            raise TypeError
        external_id = item.get("id", item.get("thread_id"))
        if not isinstance(external_id, str) or not external_id:
            raise ValueError
        return ConversationRef(
            id=f"{connection.id}:{external_id}",
            connection_id=connection.id,
            external_id=external_id,
            title=str(item.get("title", item.get("name", external_id))),
            status=str(item.get("status", "unknown")),
            cursor=item.get("cursor") if isinstance(item.get("cursor"), str) else None,
        )

    @staticmethod
    def _message(conversation, item):
        if not isinstance(item, dict):
            raise TypeError
        external_id = item.get("id", item.get("message_id"))
        content = item.get("content", item.get("text"))
        if not isinstance(external_id, str) or not external_id or not isinstance(content, str):
            raise ValueError
        return MessageRef(
            external_id=external_id, conversation_id=conversation.id,
            role=str(item.get("role", "unknown")), content=content,
            created_at=item.get("created_at") if isinstance(item.get("created_at"), str) else None,
        )


def dedupe_refs(items):
    seen = set()
    result = []
    for item in items:
        key = getattr(item, "external_id", None)
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result
