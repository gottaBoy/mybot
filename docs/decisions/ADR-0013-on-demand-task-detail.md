# ADR-0013: On-Demand Task Detail And Bounded History

- Date: 2026-11-17, Asia/Singapore
- Status: Implemented; isolated acceptance completed
- Work Item: IZ-07.3a, a slice of IZ-07.3
- Follows: [ADR-0012](ADR-0012-task-query-client-admission.md)

## Context

The task list can consume bounded server pages, but its Inspector still derives
all history from Bootstrap. Removing those global records first would silently
break the Inspector, Quick find, counts, Board, Run history and other pages.
Migrate each consumer before negotiating a reduced Bootstrap representation.

This slice moves only the selected task's detail and Inspector history to a
bounded read. It does not remove Bootstrap fields or claim lower initial transfer.

## Read Contract

Bootstrap explicitly advertises `capabilities.task_detail: true`. Only that exact
value admits the new path. Missing/false retains the existing local Inspector.
An advertised endpoint returning an error never falls back to Bootstrap history.

`GET /api/tasks/{identifier}/detail` accepts `page`, `page_size` and optional
`scope_project_id`. Only one occurrence of each known parameter is admitted.
Page bounds match ADR-0011; capacity is 20, 50 or 100. A fixed project scope
restricts the task identity; an absent task/project or scope mismatch returns an
unavailable response without exposing another project's record.

The exact response has:

- `schema_version: 1`, `unit: "task_detail"`.
- `item`: the task-query projection, containing the task's seven fields, minimal
  project identity/name, minimal latest Run or null, current category and attempts.
- `history`: `unit: "runs"`, minimal Run items, total, requested/effective page,
  capacity, total pages, has-more and `order: "created-desc-source-v1"`.

Task/project, latest Run, attempts and the history page come from one read-only
SQLite transaction with guaranteed connection closure. History uses created time
descending, then source row order ascending, matching the task query's latest-Run
selection. No Run config/context, model key, transcript, calls or artifacts are
included. Empty history has page/total-pages 1; requested out-of-range pages are
explicitly retained while the effective page clamps.

This is a response snapshot, not a cross-request lease. New Runs between page
requests can move offset boundaries. The Inspector does not certify an immutable
history or infer cost from Run counts.

## Client And Inspector

Reuse the task projection parser. Validate the exact envelope, identity/scope,
finite capacity and arithmetic, unique Run identities, attempts equal to history
total and consistency of the latest Run with page one. Bind an awaited response
to the sent request snapshot. The server owns ordering; the browser neither
re-sorts history nor checks Unicode equivalence.

Read only after selecting a task. Selection, list page and Inspector history page
remain separate; a newly selected task starts with its first history page.
Abort/discard obsolete reads on selection change, close or unmount. Appearance,
language and density changes do not initiate a read or authorize execution.

The selected list row supplies the persistent heading during initial loading or
an error. Until a detail response is validated, do not show its action, goal,
files or history. Same-key refresh can retain validated content with an explicit
busy state. A different history-page request hides previous-page rows.

Explicit refresh/post-mutation revision invalidates the read. Background Bootstrap
or selected-row updates can revalidate a ready detail; they cannot cancel an
in-flight read or automatically replay a failed one. A finite timeout, forbidden,
unavailable and invalid response are distinct failures. Retry is an explicit GET
only; it does not start, retry or resume a Run.

Keep the same Astryx wrappers and desktop/mobile Inspector layout. Existing
close/Escape/focus behavior remains. History pagination belongs inside the
Inspector, independently of the task-list URL and pagination.
On a new task identity the Inspector remounts and starts at history page one.
Desktop/mobile container changes also remount it and reset that history page,
while preserving the selected task; cross-breakpoint history-page restoration
is not part of this slice.

After pagination, restore focus only if it remains on the originating control
or has returned to the body because that control unmounted. Exclude both native
and ARIA-disabled controls. Last-page navigation targets an enabled neighbor;
a failed read targets Retry. User-directed focus changes are preserved.

## Verification And Remaining Work

Acceptance passed 943 frontend tests across 39 files, 562 Python tests, TypeScript
and production build. Production-browser reports passed 40 detail, 6 actual
detail-API, 35 existing query and 58 comprehensive checks. The 77 final screenshots,
failure baselines and reproduction commands are in the
[acceptance record](../../frontend/evidence/task-detail-2026-11-17/README.md).
The comprehensive suite uses FakeProvider/MockTransport; it does not invoke a
real Provider.

Review found and fixed A-page-two to B to A restoring an old history page.
Keyboard tests also reproduced a last-page focus error caused by treating
`aria-disabled` as enabled. The failing report is retained and the original
assertion passes after the fix. An unrelated full-suite reload assertion now
waits for the exact expected task before checking its original row count.
No production database write, credential access, real Provider call, dependency
upgrade or main-service restart occurred.

The backend running on 4180 does not acquire a new route/capability merely through
a commit. Activation and any consistent backup/restart remain a separate task.
The previously stopped 5173 development frontend was started and returns 200;
4180 still advertises neither new read capability, so that entry uses legacy
reads. Disposable 4187/5176 acceptance services are stopped.

Bootstrap, Quick find, sidebar counts, Board, Run history and other full-data
consumers remain migration work. IZ-07.3 is not complete until those dependencies
are addressed and reduced loading is independently measured. IZ-07.4 and the
original 119-item ledger are not closed by this sub-slice.
