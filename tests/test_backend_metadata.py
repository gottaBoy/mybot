from workbench.backend import OPENMAUSBOT_FORK_COMMIT, OpenMausBotReadOnlyAdapter


def test_openmausbot_adapter_is_pinned_to_researched_commit():
    assert len(OPENMAUSBOT_FORK_COMMIT) == 40
    assert OpenMausBotReadOnlyAdapter.supported_commit() == OPENMAUSBOT_FORK_COMMIT
