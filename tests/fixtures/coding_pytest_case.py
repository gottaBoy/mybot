"""Immutable pytest acceptance input, failing against the copied baseline."""
import pytest

from workbench.schemas import relative_path


@pytest.fixture
def path_parser():
    return relative_path


@pytest.mark.parametrize("value", ["workbench/schemas.py", "研发/方案.py"], ids=["ordinary", "localized"])
def test_retains_admitted_source(path_parser, value):
    assert path_parser(value) == value


@pytest.mark.parametrize("value", ["source\nunexpected.py", "source\tunexpected.py"], ids=["newline", "tab"])
def test_rejects_control_characters(path_parser, value):
    with pytest.raises(ValueError):
        path_parser(value)
