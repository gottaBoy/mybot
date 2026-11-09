"""Contract tests only; passing them does not fence the upstream runtime."""

from dataclasses import replace

import pytest

from readonly_ceiling import FixtureRunner, HostContext, HostGrant, authorize, narrow


CONTEXT = HostContext("developer", "project-a", "run-a", "person")
GRANT = HostGrant("developer", "project-a", "run-a", 3, 1000, frozenset({"fixture:readme"}))
REQUEST = {"operation": "fixture.read", "resource": "fixture:readme", "grant_revision": 3}


def test_default_is_ask_without_broad_permissions():
    assert authorize(REQUEST, CONTEXT, GRANT, 50).allowed


@pytest.mark.parametrize("mode", ["full", "auto", "edits", "custom", "unknown", None, True])
def test_no_elevated_mode(mode):
    assert not authorize({**REQUEST, "approval_mode": mode}, CONTEXT, GRANT, 50).allowed


@pytest.mark.parametrize("field", [
    "origin", "actor", "project", "run", "settings", "alwaysAllow",
    "useDefaults", "autoApprove", "chiefOfStaff", "capabilities", "approved",
])
def test_client_cannot_supply_host_authority(field):
    assert authorize({**REQUEST, field: "untrusted"}, CONTEXT, GRANT, 50).reason == "invalid_request"


@pytest.mark.parametrize("operation", ["shell", "file.write", "mail.send", "document.update", "unknown", None])
def test_effects_and_unknown_tools_denied(operation):
    assert authorize({**REQUEST, "operation": operation}, CONTEXT, GRANT, 50).reason == "capability_denied"


@pytest.mark.parametrize("context", [
    replace(CONTEXT, actor="other"), replace(CONTEXT, project="other"), replace(CONTEXT, run="other"),
])
def test_identity_binding(context):
    assert authorize(REQUEST, context, GRANT, 50).reason == "binding_mismatch"


@pytest.mark.parametrize("origin", ["api", "channel"])
def test_outside_is_draft_only(origin):
    assert authorize(REQUEST, replace(CONTEXT, origin=origin), GRANT, 50).reason == "draft_only"


@pytest.mark.parametrize("origin", ["", "unknown", "chief"])
def test_unknown_origin_denied(origin):
    assert authorize(REQUEST, replace(CONTEXT, origin=origin), GRANT, 50).reason == "unknown_origin"


@pytest.mark.parametrize("revision", [2, 4, True, "3", None])
def test_revision_is_exact_integer(revision):
    assert authorize({**REQUEST, "grant_revision": revision}, CONTEXT, GRANT, 50).reason == "stale_grant"


@pytest.mark.parametrize("resource", ["fixture:other", "../readme", "/etc/passwd", "fixture:readme/..", None])
def test_resource_allowlist(resource):
    assert authorize({**REQUEST, "resource": resource}, CONTEXT, GRANT, 50).reason == "resource_denied"


def test_missing_host_grant():
    assert authorize(REQUEST, CONTEXT, None, 50).reason == "no_host_grant"


def test_missing_capability():
    assert authorize(REQUEST, CONTEXT, replace(GRANT, capabilities=frozenset()), 50).reason == "capability_denied"


@pytest.mark.parametrize("now", [float("nan"), float("inf"), "50", None, True])
def test_invalid_time_fails_closed(now):
    assert authorize(REQUEST, CONTEXT, GRANT, now).reason == "invalid_host_authority"


@pytest.mark.parametrize("changes", [
    {"expires_at": float("nan")}, {"expires_at": float("inf")}, {"expires_at": "1000"},
    {"revision": True}, {"revision": 0}, {"actor": ""}, {"revoked": "false"},
    {"resources": {"fixture:readme"}}, {"capabilities": frozenset({"shell"})},
])
def test_invalid_host_grant_fails_closed(changes):
    assert authorize(REQUEST, CONTEXT, replace(GRANT, **changes), 50).reason == "invalid_host_authority"


@pytest.mark.parametrize("expires_at", [float("nan"), float("inf"), None, True, 0])
def test_invalid_child_expiry(expires_at):
    with pytest.raises(ValueError):
        narrow(GRANT, actor="researcher", resources=GRANT.resources,
               capabilities=GRANT.capabilities, expires_at=expires_at)


def test_child_only_narrows():
    child = narrow(GRANT, actor="researcher", resources=GRANT.resources,
                   capabilities=GRANT.capabilities, expires_at=900)
    assert authorize(REQUEST, replace(CONTEXT, actor="researcher", origin="delegation"), child, 50).allowed
    for changes in (
        {"resources": frozenset({"fixture:other"})},
        {"capabilities": frozenset({"shell"})},
        {"expires_at": 1100},
    ):
        with pytest.raises(ValueError):
            narrow(GRANT, actor="researcher", resources=changes.get("resources", GRANT.resources),
                   capabilities=changes.get("capabilities", GRANT.capabilities),
                   expires_at=changes.get("expires_at", 900))


def test_recheck_before_each_tool_after_revoke_expiry_or_revision_change():
    runner = FixtureRunner({"fixture:readme": "synthetic"})
    assert runner.execute(REQUEST, CONTEXT, GRANT, 50) == "synthetic"
    for grant, now in ((replace(GRANT, revoked=True), 50), (GRANT, 1000), (replace(GRANT, revision=4), 50)):
        with pytest.raises(PermissionError):
            runner.execute(REQUEST, CONTEXT, grant, now)
    assert runner.reads == 1
