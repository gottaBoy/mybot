# ADR-0019: Bounded Task Board

- Date: 2026-11-20, Asia/Singapore
- Status: Accepted; listed consumer implemented and locally verified
- Work Item: IZ-07.3c2b1
- Follows: ADR-0018

## Query Contract

Explicit Bootstrap `task_board: true` selects `GET /api/tasks/board`; missing or
false retains the existing local board. An advertised failure never substitutes
Bootstrap cards or zero counts. This slice does not reduce Bootstrap.

Allowed parameters are `query`, `pages`, `scope_project_id` only. Reuse the
strict SavedViewQuery schema and Task query canonicalization, literal text
matching, latest-Run selection/tie rules, state classification and fixed-project
scope. JQL must be empty; a nonempty JQL is rejected even when it is a supported
Task ORDER BY. Board order is independently fixed to task created_at descending,
source rowid ascending, identified as `tasks-created-v1`. Task/Run sorting and
page-size URL settings do not control the board.

`pages` is strict JSON with exactly these five keys: `pending`, `active`,
`attention`, `completed`, `other`. Each is an integer 1..MAX_PAGE. The default is
all1. Duplicate/unknown/missing keys, booleans, fractions, invalid UTF-8 and
unknown or duplicate HTTP parameters fail. Each column has a fixed capacity20;
there is no disconnected capacity selector. At most100 cards return.

One SQLite mode=ro/query_only transaction supplies all five column counts and
pages. Reuse/extract Task query SQL and row serialization instead of opening five
independent query snapshots. Filter query states before counting; excluded states
have zero total and empty items. Total equals the sum of five column totals.
All columns are present in canonical order, including empty or excluded columns.
Unavailable effective projects fail explicitly. Close connections on all paths;
no Provider, context reads, mutations, events or write locks.

The exact response is:

```text
{
  schema_version: 1, unit: "task_board",
  query: <effective SavedViewQuery>,
  scope_project_id: string|null,
  order: "tasks-created-v1", column_size: 20, total: integer,
  columns: [{
    state_category: <one of five>,
    total, requested_page, page, total_pages, has_more,
    items: <existing Task-query item DTO[]>
  }, ...]
}
```

Task-query item DTO intentionally includes the full bounded Task record, minimal
Project reference, latest Run, state_category and attempts. This preserves the
existing card goal and exact Task passed to Review & run without manufacturing
missing acceptance/files or looking up a stale Bootstrap Task. It is not a new
execution permission. Review still enters the existing context preview and
explicit consent flow. No model runs on board reads or pagination.

## Client And URL

Strict client validates exact fields, safe count/page arithmetic, full canonical
column set, total sum, each item's state/identity/project/query consistency and
uniqueness across columns. Bind response metadata to an immutable sent request.
Reuse existing Task DTO parsing. Preserve server order and text matches; no
browser filtering, sorting or slicing of admitted pages.

`boardPages` is an independent URL JSON object with the same exact five keys.
Absent means all1; invalid raw values remain visible and block only the remote
board. Clear removes invalid boardPages. Column pagination changes only its key,
through the shared navigation admission. A query text/project/state or JQL change
resets boardPages in the same URL patch. Presentation-only changes and Back/
Forward preserve the admitted snapshot. SavedViews remain Task-table snapshots,
not board page definitions.
Fixed-project scope injection must preserve the original command's intent:
injected `project/projects` keys on a view/mode/table-setting command are not a
query edit. Preserve the current raw boardPages before adding fixed scope;
an original query command still resets it atomically.

Use the established15s GET/cancel/late-response guard, same-key busy retention,
different-key hiding, ready-only poll revalidation, explicit read retry and401
private-data clearing. No automatic read retry is inherited by Provider calls
or mutations.

## Presentation

Reuse the current Astryx/project-owned TaskBoard business tree. Each shown column
uses its real total and one Previous/Next footer with range and current page.
Show the selected states only, or the usual first four columns plus nonempty
other. Page size is always20. Card actions use exact admitted server DTOs/Run IDs.
Busy retained cards cannot activate actions. No dragging or Run status writes.

Keep global search, one-row committed-query controls, filter heading and result
view tools. Limit horizontal scroll to the board; each column scrolls its cards
and keeps its footer available. After pagination, restore the originating column
and an available pager action (or read Retry) only if the user has not moved
focus. Exclude native and ARIA-disabled controls; preserve horizontal position.
Three styles/both modes, English/Chinese, narrow/mobile, long labels and reduced
motion require browser evidence.

## Remaining Scope

Inbox, overview, hierarchy, documents, remaining Project consumers, negotiated
Bootstrap reduction, invalidation impact graph and actual transfer/scale
measurement remain open. No main4180 activation, real Provider call, credential
access, deployment, new dependencies or sibling changes. Original119/9/110
ledger counts remain unchanged. Implementation and runtime evidence follow.

## Evidence

1540 frontend tests/54 files,996 Python tests, TypeScript and production build
passed. Final production browser reports:50 synthetic,8 actual HTTP/SQLite and58
comprehensive checks;76 final PNG with no page errors. Fixed-project presentation
intent, independent pages, busy action guards, focus/scroll continuity and real
poll behavior are covered. See `frontend/evidence/task-board-2026-11-20/README.md`
for fixtures, earlier failures, reproduction and primary-service boundaries.
