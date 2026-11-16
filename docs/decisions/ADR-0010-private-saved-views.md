# ADR-0010: Private Saved Views

- Date: 2026-11-16, Asia/Singapore
- Status: Implemented; isolated acceptance evidence recorded separately
- Scope: single-user workspace/project task-list configuration

## Decision

Persist a finite query/table snapshot, not a workflow, model request, shared ACL
or live URL binding. Continue ADR-0009's strict version-1 definition and existing
React/Astryx component tree.

- Workspace and fixed-project directories are separate. A fixed project must be
  the definition's only project. The API validates referenced projects.
- Capture only committed text/project/state/JQL plus applied task columns, order,
  sorts and page size. Pending Basic/JQL edits disable save. Current page is not
  saved; loading starts at page 1.
- Loading reads the resource, then copies its snapshot to literal URL and local
  column preferences. A dirty query requires explicit replacement consent.
  Reload does not fetch a saved-view ID or silently adopt newer revisions.
- Definition validation rejects unknown fields, unsupported JQL, malformed
  columns/sorts and contradictory scope. Task semantics do not become Run-table
  or Board sorting.

## Persistence And Conflicts

`saved_views` is an additive SQLite configuration table. Creation uses a client
ID and normalized request fingerprint. The same ID/payload can return its first
revision; changed content, a superseding revision or a deleted ID is not an
original-create receipt.

Update/delete bind `expected_revision`. A conflict keeps the draft and original
revision. Reading current state does not replace it until explicit confirmation.
Save as creates another ID. Updates do not retain historical definition bodies;
revision numbers and audit events are not a version-history restoration feature.

Deletion keeps a minimal tombstone and removes the name/definition. It cannot
resurrect an old ID. Audit events carry identity/scope/revision, not query text or
view names.

## Unknown Outcomes

No mutation is automatically retried. A timeout, network failure or invalid
success response keeps the original ID and locks further writes in that editor.
Closing its dialog retains an unresolved-change entry while mounted.

An explicit GET reads current resource state, **not an exact receipt for the
original mutation**. Acknowledgement is labeled accordingly. This feature does
not implement a durable operation journal across reload/logout; it must not be
used as evidence that paid model execution or external writes are idempotent.
ADR-0007's execution recovery remains a different contract.

## UI And Navigation

Reuse `AppActionMenu`, `AppDialog`, `AppInput`, shared density and semantic tokens.
The installed Astryx 0.7.13 changes a busy required dialog to `alertdialog`.
Its adaptive touch menu uses a dialog/button action list instead of desktop
menuitems. Browser tests follow those actual semantics.

Directory loading is on demand, with a real count, bounded pages, loading/error,
empty state and explicit refresh. Missing resource, unavailable API, invalid
project, forbidden and malformed response remain distinct.

401 clears private projections before parsing the body, including non-JSON
proxy responses. Scope changes abort/discard stale reads. Dirty navigation still
uses the shared admission guard. At initial subscription only, Workbench rereads
the current URL to close the render/effect gap; later events retain canonical
push/replace/traverse behavior. Initial URL omission does not erase a stored view
preference.

## Activation Boundary

Passing tests does not activate an already-running backend. After separate user
confirmation on 2026-11-16, the idle 4180 service was backed up consistently and
restarted with its original configuration. The saved-view route is now active;
five actual read-only desktop/mobile checks and original-row comparisons passed.
See [local activation checks](../SAVED_VIEWS_ACTIVATION.md) and the separate
[activation record](../../frontend/evidence/local-activation-2026-11-16/README.md).
Production CRUD/fault injection was not performed, and future updates still
require their own quiescence/backup checks.

No new Provider, shell, deployment, external connector, device handoff, team
identity or permission follows from saving a view. Formal database migration
versioning, team ACL and server-side task querying remain separate work.

Evidence and reproducible test commands:
[saved-view acceptance](../../frontend/evidence/saved-views-2026-11-16/README.md).
