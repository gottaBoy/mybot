"""Read-only backend contracts and adapters; never dispatches model work."""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol
from urllib.parse import quote

import httpx

OPENMAUSBOT_FORK_COMMIT = "1bc4749aa8307d7d6998bf86de4ef6478460dd93"


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


@dataclass(frozen=True)
class BackendHealth:
    status: str
    app: str | None = None
    packaged: bool | None = None


@dataclass(frozen=True)
class RecentMessages:
    messages: list[MessageRef]
    has_more: bool


class ConversationBackendPort(Protocol):
    async def list_conversations(
        self, connection: BackendConnection, *, cursor: str | None = None,
    ) -> tuple[list[ConversationRef], str | None]:
        ...

    async def list_messages(
        self, connection: BackendConnection, conversation: ConversationRef, *, cursor: str | None = None,
    ) -> tuple[list[MessageRef], str | None]:
        ...

    async def recent_messages(
        self, connection: BackendConnection, conversation: ConversationRef,
    ) -> RecentMessages:
        ...


class UnconfiguredConversationBackend:
    async def list_conversations(self, connection, *, cursor=None):
        if connection.status != "unconfigured":
            raise BackendError("backend_adapter_not_configured")
        return [], None

    async def list_messages(self, connection, conversation, *, cursor=None):
        raise BackendError("backend_adapter_not_configured")

    async def recent_messages(self, connection, conversation):
        raise BackendError("backend_adapter_not_configured")


class OpenMausBotReadOnlyAdapter:
    """Narrow HTTP read adapter for isolated contract testing.

    Endpoint paths are configuration, not claims about the upstream fork's
    public API. No write method exists in this adapter.
    """

    def __init__(self, client: httpx.AsyncClient | None = None):
        self.client = client

    @classmethod
    def supported_commit(cls) -> str:
        return OPENMAUSBOT_FORK_COMMIT

    async def list_conversations(self, connection, *, cursor=None):
        return await self._list(
            connection, connection.settings.get("conversations_path", "/conversations")
            if connection.settings else "/conversations",
            cursor=cursor, collection_keys=("bots", "conversations", "threads", "items"),
            mapper=lambda item: self._conversation(connection, item),
        )

    async def list_messages(self, connection, conversation, *, cursor=None):
        if connection.id != conversation.connection_id:
            raise BackendError("backend_connection_unknown")
        path = f"/conversations/{quote(conversation.external_id, safe='')}/messages"
        return await self._list(
            connection, path, cursor=cursor, collection_keys=("messages", "items"),
            mapper=lambda item: self._message(conversation, item),
        )

    async def _list(self, connection, path, *, cursor, collection_keys, mapper, extra_params=None):
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
            params = dict(extra_params or {})
            if cursor:
                params["cursor"] = cursor
            response = await client.get(path, params=params, follow_redirects=False)
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


class OpenMausBotNativeReadAdapter(OpenMausBotReadOnlyAdapter):
    """Read-only mapping for the observed OpenMausBot package endpoints.

    Observed package contract (fixed npm artifact, not a live connection):
    `GET /api/bots` and `GET /api/threads/{threadId}/messages?limit=N`.
    """

    async def check_health(self, connection):
        payload = await self._read_json(connection, "/api/health", max_bytes=65536)
        if payload.get("app") != "openmausbot":
            raise BackendError("backend_not_openmausbot")
        packaged = payload.get("static")
        if packaged is not None and not isinstance(packaged, bool):
            raise BackendError("backend_schema_invalid")
        return BackendHealth("reachable", "openmausbot", packaged)

    async def _read_json(self, connection, path, *, max_bytes, params=None):
        if connection.status == "revoked" or connection.revoked_at:
            raise BackendError("backend_revoked")
        if connection.status != "configured":
            raise BackendError("backend_not_configured")
        client = self.client
        owned = client is None
        if owned:
            client = httpx.AsyncClient(
                base_url=connection.endpoint, follow_redirects=False,
                trust_env=False, timeout=httpx.Timeout(10, connect=5),
            )
        try:
            async with asyncio.timeout(10):
                async with client.stream("GET", path, params=params, follow_redirects=False) as response:
                    if response.status_code in {401, 403}:
                        raise BackendError(
                            "backend_auth_required" if response.status_code == 401 else "backend_access_denied"
                        )
                    if 300 <= response.status_code < 400:
                        raise BackendError("backend_redirect_denied")
                    if response.status_code == 404 and path != "/api/health":
                        raise BackendError("backend_not_found")
                    if response.status_code >= 400:
                        raise BackendError(f"backend_http_{response.status_code}")
                    data = bytearray()
                    async for chunk in response.aiter_bytes():
                        data.extend(chunk)
                        if len(data) > max_bytes:
                            raise BackendError("backend_response_too_large")
        except (httpx.TimeoutException, TimeoutError) as exc:
            raise BackendError("backend_timeout") from exc
        except httpx.HTTPError as exc:
            raise BackendError("backend_unreachable") from exc
        finally:
            if owned:
                await client.aclose()
        try:
            payload = json.loads(data)
        except ValueError as exc:
            raise BackendError("backend_schema_invalid") from exc
        if not isinstance(payload, dict):
            raise BackendError("backend_schema_invalid")
        return payload

    async def list_conversations(self, connection, *, cursor=None):
        if cursor is not None:
            raise BackendError("backend_cursor_unsupported")
        payload = await self._read_json(connection, "/api/bots", params={"messages": 0}, max_bytes=1048576)
        items = payload.get("bots")
        if not isinstance(items, list) or len(items) > 500:
            raise BackendError("backend_schema_invalid")
        try:
            return dedupe_refs([self._native_bot(connection, item) for item in items]), None
        except (TypeError, ValueError) as exc:
            raise BackendError("backend_schema_invalid") from exc

    async def recent_messages(self, connection, conversation) -> RecentMessages:
        if connection.id != conversation.connection_id:
            raise BackendError("backend_connection_unknown")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,160}", conversation.external_id):
            raise BackendError("backend_schema_invalid")
        payload = await self._read_json(
            connection, f"/api/threads/{conversation.external_id}/messages",
            params={"limit": 30}, max_bytes=1048576,
        )
        items, has_more = payload.get("messages"), payload.get("hasMore")
        if not isinstance(items, list) or len(items) > 30 or not isinstance(has_more, bool):
            raise BackendError("backend_schema_invalid")
        result = []
        for item in items:
            if not isinstance(item, dict) or not isinstance(item.get("kind"), str):
                raise BackendError("backend_schema_invalid")
            if item["kind"] != "text":
                continue
            key, role, text, at = (item.get(field) for field in ("id", "role", "text", "at"))
            if (not isinstance(key, str) or not key or len(key) > 160
                    or role not in ("user", "bot") or not isinstance(text, str)
                    or type(at) is not int):
                raise BackendError("backend_schema_invalid")
            try:
                created = datetime.fromtimestamp(at / 1000, timezone.utc).isoformat(timespec="milliseconds")
            except (ValueError, OverflowError, OSError) as exc:
                raise BackendError("backend_schema_invalid") from exc
            result.append(MessageRef(key, conversation.id, role, text, created))
        return RecentMessages(dedupe_refs(result), has_more)

    async def list_messages(self, connection, conversation, *, cursor=None):
        if cursor is not None:
            raise BackendError("backend_cursor_unsupported")
        return (await self.recent_messages(connection, conversation)).messages, None

    @staticmethod
    def _native_bot(connection, item):
        if not isinstance(item, dict):
            raise TypeError
        thread_id = item.get("threadId")
        if not isinstance(thread_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,160}", thread_id):
            raise ValueError
        return ConversationRef(
            id=f"{connection.id}:{thread_id}",
            connection_id=connection.id,
            external_id=thread_id,
            title=str(item.get("name", item.get("title", thread_id))),
            status=str(item.get("status", "unknown")),
            cursor=None,
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
