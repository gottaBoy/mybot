# ADR-0030: Real Task Breakdown And Execution Dependencies

- Date: 2026-11-26, Asia/Singapore
- Status: Accepted
- Scope: bounded, owner-authored task decomposition with enforceable prerequisites

The product has isolated implementation and code continuation, but a goal cannot
yet be broken into persisted work with enforced ordering. Add a single immutable
version1 breakdown under a root Task. Create actual Tasks, preserve the original
Task, and reuse existing research/coding/Agent/Call/Artifact workflows.

## Definition And Creation

A definition has2–8 items, stable local keys, title, goal, nonempty acceptance,
explicit files and prerequisite keys. Reject cycles, self/missing/duplicate
references, unknown fields and bodies over64KiB. Child files must be a subset of
the parent's explicitly listed files. Planning previews and creation use metadata
only; they do not read those files, start a Run or call a model.

POST `/api/tasks/{id}/plan/preview` binds the entire definition, parent Task
snapshot and criterion into `preview_hash`. POST `/plan` requires that exact
definition/hash, request ID and consent. One transaction checks the fresh parent,
creates real same-Project Tasks, memberships, fixed edges and an exact receipt.
The parent Task remains unchanged. Same request/input returns its original
receipt; another candidate or another creation for this parent conflicts.

Four additive tables: `task_plans`, `task_plan_items`,
`task_plan_dependencies`, `task_plan_operations`. No original Task/Run columns or
status semantics change. Creation is atomic, not a partially published draft.
Drafts remain in memory; this slice has no saved draft, plan replacement,
revision editor, nested decomposition or automatic AI planning. Roots and all
children remain normal Tasks in existing list/count/board/search projections.

GET `/plan` returns the fixed definition and bounded current child/readiness
facts in one query-only snapshot. GET `/plan/operations/{request_id}` returns the
exact immutable creation receipt. Current resource state is not a write receipt.
Explicit Bootstrap `task_plans` admits these reads; advertised failure does not
fall back to Bootstrap or a success-shaped empty plan.

## Explicit Completion Criterion

Criterion `latest-successful-run-reviewed-reports-v1` means:

1. Use the prerequisite Task's most recent Run by the existing Task-latest order.
2. That Run must have succeeded.
3. It must have a complete, verifiable final `report` Artifact.
4. All its final reports must be explicitly accepted by the user.
5. No Artifact in that Run may still have `changes_requested`.

The first slice bounds verifiable reports to8 and32KiB per body. Missing,
oversized/unavailable or unreviewed reports block execution. A new unfinished or
failed latest Run cannot inherit acceptance from an old success. Requesting
changes through the existing Artifact review action withdraws readiness.

This criterion records acceptance of the latest successful report, not a new
universal Task-completed status or proof that every requirement is satisfied.
Research completion does not imply tests ran. Coding retains its actual test
evidence separately. Parent status is not automatically rewritten from children.
The UI names the concrete report-review facts instead of inventing progress.

## Execution Enforcement And Evidence

One server prerequisite function is used by ordinary Run creation, TaskTurn
preparation/execution, coding preparation/execution, recovery preparation/
execution, legacy retry/resume and single-use device execution. Device grants
cannot consume their candidate while prerequisites are blocked. Pairing gains
no plan-management scope.

Admission is checked inside the write transaction and again when the worker
claims a queued Run. If readiness was withdrawn after queueing, mark that queued
attempt failed with `task_dependencies_blocked` before a new provider call.
Capture the exact blocking prerequisite snapshot in that failure event so later
reapproval cannot erase the reason for the failed admission.
Already running work is not silently canceled; its original authorization and
history remain intact. New starts/resumes require current readiness.

Queue-time Run context records Task/parent/plan identity, current prerequisite
Run IDs, report IDs/decisions/digests and the named criterion. Worker-start and
resume events record their own admission. These are audit metadata; no
prerequisite report body or extra files are implicitly sent to a model. Existing
research/coding input hashes and explicit consent boundaries retain their scope.

## UI And Recovery

The existing Task goal view owns the breakdown list, actual child links, goals,
acceptance and dependency states. A root can open one project-owned Astryx
editor. Checkbox edges edit a local finite candidate; a referenced item cannot
be removed until its edges are explicitly cleared. Review precedes confirmation;
any edit invalidates preview/consent. Creating Tasks never starts execution.

Child Task views show the parent and exact blocking reasons. New execution is
disabled while an advertised dependency read is unresolved, failed or blocked.
Messages may still be saved without preparing execution. Run context exposes
the admission evidence, distinct from the current prerequisite state.

`taskPlanRequest` contains only the original operation ID and is mutually
exclusive with `taskSend`/`codingRequest`. Unknown creation retains that ID,
protects navigation and reconciles by GET only. A404 cannot prove an in-flight
write ended. Reload without the original draft does not fabricate a replacement
candidate. A confirmed known rejection preserves edits and does not overwrite
an existing plan. Successful creation refreshes Task/query/count/project/search
read models through the existing global invalidation path.

## Evidence And Limits

Verify real HTTP/SQLite creation, conflicts, lost responses and concurrency;
independent dependency checks on research/coding/recovery/device paths; actual
fixture research -> human report acceptance -> dependent research; withdrawal,
queue-time races and immutable admission. Validate desktop/mobile, three styles,
both modes, keyboard interactions and existing workbench behavior.

Source planning and model response generation in acceptance use injected
fixtures. No real provider call is automatic. Local activation, original-row
comparison, test results, screenshots and retained failures:
[delivery evidence](../../frontend/evidence/task-plans-2026-11-26/README.md).

More test runtimes, plan revisions, automatic AI decomposition, arbitrary
workflow scheduling, team ownership and original-project writes remain separate.
The historical119/9/110 ledger does not change.
