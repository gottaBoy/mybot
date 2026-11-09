"""Synthetic read-only contract, not an integrated Agent security boundary."""

from __future__ import annotations

from dataclasses import dataclass, replace
import math
import re
from typing import Mapping


@dataclass(frozen=True)
class HostContext:
    actor: str
    project: str
    run: str
    origin: str


@dataclass(frozen=True)
class HostGrant:
    actor: str
    project: str
    run: str
    revision: int
    expires_at: float
    resources: frozenset[str]
    capabilities: frozenset[str] = frozenset({"fixture.read"})
    revoked: bool = False


@dataclass(frozen=True)
class Decision:
    allowed: bool
    reason: str


FIELDS = {"operation", "resource", "approval_mode", "grant_revision"}
RESOURCE = re.compile(r"fixture:[a-z0-9-]{1,64}\Z")


def finite_time(value) -> bool:
    return type(value) in {int, float} and math.isfinite(value)


def valid_grant(grant) -> bool:
    return (
        type(grant) is HostGrant
        and all(type(value) is str and bool(value.strip())
                for value in (grant.actor, grant.project, grant.run))
        and type(grant.revision) is int and grant.revision > 0
        and finite_time(grant.expires_at) and grant.expires_at > 0
        and type(grant.revoked) is bool
        and type(grant.resources) is frozenset
        and all(type(value) is str and RESOURCE.fullmatch(value) for value in grant.resources)
        and type(grant.capabilities) is frozenset
        and grant.capabilities <= {"fixture.read"}
    )


def authorize(request: dict, context: HostContext, grant: HostGrant | None, now: float) -> Decision:
    deny = lambda reason: Decision(False, reason)
    if type(request) is not dict or request.keys() - FIELDS:
        return deny("invalid_request")
    if grant is None:
        return deny("no_host_grant")
    if not valid_grant(grant) or type(context) is not HostContext or not finite_time(now):
        return deny("invalid_host_authority")
    if grant.revoked:
        return deny("revoked")
    if now >= grant.expires_at:
        return deny("expired")
    if (context.actor, context.project, context.run) != (grant.actor, grant.project, grant.run):
        return deny("binding_mismatch")
    if context.origin in {"api", "channel"}:
        return deny("draft_only")
    if context.origin not in {"person", "delegation"}:
        return deny("unknown_origin")
    if type(request.get("grant_revision")) is not int or request["grant_revision"] != grant.revision:
        return deny("stale_grant")
    if request.get("approval_mode", "ask") != "ask":
        return deny("elevated_or_unknown_mode")
    if request.get("operation") != "fixture.read" or "fixture.read" not in grant.capabilities:
        return deny("capability_denied")
    resource = request.get("resource")
    if not isinstance(resource, str) or not RESOURCE.fullmatch(resource) or resource not in grant.resources:
        return deny("resource_denied")
    return Decision(True, "synthetic_read_allowed")


def narrow(parent: HostGrant, *, actor: str, resources: frozenset[str],
           capabilities: frozenset[str], expires_at: float) -> HostGrant:
    if (not valid_grant(parent) or type(actor) is not str or not actor.strip()
            or parent.revoked or type(resources) is not frozenset
            or type(capabilities) is not frozenset or not resources <= parent.resources
            or not capabilities <= parent.capabilities or not finite_time(expires_at)
            or expires_at <= 0 or expires_at > parent.expires_at):
        raise ValueError("child grant may only narrow host authority")
    return replace(parent, actor=actor, resources=resources, capabilities=capabilities,
                   expires_at=expires_at)


class FixtureRunner:
    """Reads only caller-supplied in-memory fixtures; no shell, files or HTTP."""

    def __init__(self, fixtures: Mapping[str, str]):
        self.fixtures = dict(fixtures)
        self.reads = 0

    def execute(self, request: dict, context: HostContext, current_grant: HostGrant | None,
                now: float) -> str:
        decision = authorize(request, context, current_grant, now)
        if not decision.allowed:
            raise PermissionError(decision.reason)
        self.reads += 1
        return self.fixtures[request["resource"]]
