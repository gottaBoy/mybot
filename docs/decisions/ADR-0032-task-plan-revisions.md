# ADR-0032: Immutable Task Plan Revisions

- Date: 2026-11-27, Asia/Singapore
- Status: Accepted; verified and locally activated
- Scope: bounded revision of real Task decomposition, retaining original evidence

ADR-0030 delivered a fixed v1 plan. Changing its definition in place would change
the meaning of existing Task IDs, accepted reports, queued work and Run admission.
Add immutable versions and explicit impact confirmation instead.

## Task Identity And Versions

Keep the original four v1 tables, Task rows, Run contexts and creation receipts.
New `task_plan_versions`, `task_plan_memberships` and
`task_plan_revision_operations` preserve revisions without rewriting v1.
The highest persisted version is the current head; CAS is checked inside the
existing immediate write transaction. Bound a root to100 versions and20-item
history pages. History returns full immutable snapshots, not a live-state lease.

Definitions remain2–8 items, acyclic, with explicit files inside the parent list.
Reuse a Task only when its key, title, goal, acceptance, files and incoming
prerequisite identities remain unchanged. Create new Tasks for additions or
changes; replacement propagates to dependent nodes. Removed/replaced Tasks
retain their original goals, Run histories and reports, but become retired.
Old accepted reports cannot certify newly changed requirements.

The impact identifies added/replaced/reused/removed keys, retired Task IDs and
authoritative blockers. Affected queued/running/paused work, prepared coding/
TaskTurn/recovery or unconsumed execution grants block publication. Unchanged
siblings may continue; publication never silently cancels work or model calls.
Retired Tasks cannot start/resume work through any research/coding/device path.
Existing unified prerequisite admission enforces this, including worker claim.

## Preview, CAS And Receipts

POST `/api/tasks/{root}/plan/revisions/preview` accepts `items`,
`expected_version` and `expected_plan_hash`. Preview binds the exact baseline,
fresh parent snapshot, entire definition and impact into `preview_hash`.
Blocked preview is still readable; publication rejects blockers.

POST `/plan/revisions` adds `request_id`, `preview_hash` and consent.
Exact same-input replay returns its immutable receipt before current CAS/lock
checks. A stale head or changed impact fails409, preserving the candidate for
explicit review. No automatic rebase, dropped revision or write retry.
Publishing metadata reads no project files and starts no model.

The original `/plan/operations/{id}` admits old create receipts and new revision
receipts. Revision receipts have `schema_version:2`, `operation:"revise"` and
an exact result snapshot. Unknown outcomes retain the existing
`taskPlanRequest` URL marker and reconcile by GET only.404 cannot terminate an
in-flight write or justify a replacement ID.

## Current And Historical Reads

Without revisions, `/plan` remains the exact schema1 contract. After v2,
current root/member reads use schema2. Gates add `plan_version` and
`membership:"current"|"retired"`; retired gates are not ready and expose no
invented prerequisite review. New admission identifies the active version;
old Run snapshots remain as originally recorded.

`GET /plan/versions?page=N` and `/plan/versions/{version}` expose pure frozen
definitions, parent snapshots and Task bindings. They do not attach current
report decisions or gates to a historical version.

The explicit `task_plan_revisions` capability admits new commands and reads.
The existing single Astryx editor supports create/revise modes with a frozen
baseline and local draft. Refresh, locale and theme changes preserve edits.
Any edit invalidates preview/consent; conflict retains the old baseline.
History has independent paging and cancellation; stale responses cannot replace
the current selection. Success invalidates all affected Task/query/count/search
projections only after an admitted exact operation receipt.

## Verification

Verify actual HTTP/SQLite v1->v2, immutable old rows/receipts, replacement closure,
review withdrawal/new prerequisites, retired admission, active/prepared blockers,
concurrency and lost responses. Exercise all existing execution paths and
worker claim. Validate old parser compatibility, failed capability reads,
strict identity, dirty protection, keyboard, mobile and theme/locale preservation.

Final results:1406 Python/2374 frontend/typecheck/build passed. Plan browser9
checks plus1 framing check, Pi5/full58/primary8;81 browser checks and86 final PNG.
Real fixture publication/review/CAS/history and unchanged primary rows are recorded
in [delivery evidence](../../frontend/evidence/plan-revisions-pi-2026-11-27/README.md).
No AI automatic planning, arbitrary scheduler, nested decomposition,
source-file merge or team permission expansion follows from this ADR.
Historical119/9/110 counts remain unchanged.
