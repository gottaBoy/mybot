import asyncio

import pytest

from workbench.backend import (
    BackendConnection,
    BackendError,
    ConversationRef,
    UnconfiguredConversationBackend,
)


def test_unconfigured_backend_has_no_network_or_send_path():
    backend = UnconfiguredConversationBackend()
    connection = BackendConnection("c1", "OpenMausBot", "openmausbot", "", "unconfigured")
    conversations, cursor = asyncio.run(backend.list_conversations(connection))
    assert conversations == []
    assert cursor is None
    with pytest.raises(BackendError, match="backend_adapter_not_configured"):
        asyncio.run(backend.list_messages(
            ConversationRef("r1", "c1", "thread-1", "Thread", "unknown")
        ))


def test_backend_value_objects_are_stable():
    conversation = ConversationRef("r1", "c1", "thread-1", "Thread", "active", "cursor-1")
    assert conversation.connection_id == "c1"
    assert conversation.cursor == "cursor-1"
