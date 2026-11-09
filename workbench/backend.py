"""Read-only conversation backend contracts.

No network client lives here. Upstream adapters map their identities and
states into these stable mybot-owned value shapes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


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
