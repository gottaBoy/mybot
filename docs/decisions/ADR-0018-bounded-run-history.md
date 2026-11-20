# ADR-0018: Bounded All-Run History Query

- Date: 2026-11-20, Asia/Singapore
- Status: Accepted; listed consumer implemented and locally verified
- Work Item: IZ-07.3c2a
- Follows: ADR-0017

## Contract

Add explicit Bootstrap `run_query: true`. Only this capability selects the new
history consumer; absent/false retains the original local table. An advertised
endpoint failure never substitutes Bootstrap rows or fabricated zero counts.
Bootstrap remains full for other consumers.

`GET /api/runs/query` accepts only `query`, `sorts`, `scope_project_id`, `page`,
`page_size`, with the same defaults and strict JSON/UTF-8/bounds as task query.
Query uses the existing finite SavedViewQuery: text/projects/states/jql/mode.
Projects are OR within a field; fields are AND. Fixed scope overrides valid
project candidates. Unavailable effective projects fail explicitly.

This endpoint counts **all** historical Runs joined to real tasks/projects.
State classification uses each Run's own status, not its task's latest Run.
Pending-task selection is valid but matches zero Runs; unknown statuses are
other. Literal Python-lowercase text matches Run ID, task ID/title, project
ID/name. It never searches configuration, context, error text or model outputs.

Sorts is an array of zero or one exact `{sortKey,direction}` rule. Run sort keys
are `id`, `title`, `projectName`, `status`, `created_at`; directions are ascending
or descending. Task-only `attempts`/`updated` and multi-sort are rejected.
Existing JQL ORDER BY CREATED/SUMMARY overrides valid explicit Run sorting.
No new JQL expressions or grouping are introduced.

Use `unicode-natural-v1` collation for explicit text/status/date keys and append
created_at descending, source rowid ascending for deterministic ties/default.
The algorithm is server-owned, not Intl.Collator equivalence. Page size is
20/50/100, page bound is existing task MAX_PAGE; clamp presentation to the last
page (page1/total_pages1 for empty) without changing the requested URL.

The exact response is schema_version1, unit `"runs"`, items, total,
requested_page, page, page_size, total_pages, has_more, query, sorts,
scope_project_id and sort_semantics `"unicode-natural-v1"`.
Each item is exactly:

```text
{
  run: {id,task_id,status,created_at},
  task: {id,project_id,title},
  project: {id,name},
  state_category: "active"|"attention"|"completed"|"other"
}
```

No goals, files, notes, errors, configuration, context, agents, calls or outputs
belong to this projection. One mode=ro/query_only SQLite transaction returns
count and page; close connections on all outcomes. No write/Provider dependency.

## Client And Presentation

Strict client validates exact fields, safe pagination/count arithmetic, row
identity, duplicates, task/project relationships, Run-state classification and
binding to a copied sent request. It preserves admitted server order and does
not re-filter Unicode matches or sort/slice the page again.

The workbench retains the existing single-row committed-query behavior and
project-reference admission. A run-specific `runOrder` URL parameter owns one
sort rule, represented as `key:direction`. Task `order/sorts` remain Task state.
Invalid runOrder is preserved and blocks only remote Run results; clearing Run
sorting removes that candidate. JQL ordering remains the explicit override.
SavedViews remain Task snapshots and do not capture Run ordering.

Use the existing Astryx table wrapper with serverSorted/totalRows/rowStart,
real 20/50/100 capacity, one footer and accessible page position. Header sort
changes commit runOrder and reset page. Keep column visibility/density settings,
table tools at the table upper-right, and real Run links via existing navigation.
A single page's row count must not masquerade as the total.
Keep Run table column visibility and compact-row settings in the parent view so
that a different-query loading remount does not reset them. They are in-memory
presentation preferences, not part of the query or a saved Task view.
After page navigation, restore an available pager action (or explicit read Retry
after failure) only if focus remains on the originating action/body. Exclude
both native and ARIA-disabled controls and preserve user-moved focus.

Different requests hide obsolete rows; same-key refresh retains validated rows
with busy state. Abort/discard obsolete GETs, use15s timeout, revalidate ready
data on background Bootstrap polls without canceling loading or replaying errors,
and provide explicit GET retry. HTTP401 clears private projections. Task/Board
state, model calls and mutations do not inherit this read policy.

## Scope

This slice migrates the Run-history list, not every Run/Task consumer or the
Bootstrap payload. Board, Inbox, overview, hierarchy, documents, negotiated
Bootstrap reduction, invalidation impact graphs and transfer/scale measurements
remain open. No new model execution, write retry, main-service activation or
global performance claim. Original119/9/110 is unchanged. Evidence follows.

## Evidence

Final 1415 frontend tests/51 files, 906 Python tests, TypeScript and production
build passed. Production browser: 48 synthetic Run-query checks, 9 actual
HTTP/SQLite checks and 58 comprehensive checks; 80 final PNG, no page errors.
Column/compact preferences survive paging; focus, capability gating, stale reads,
real polling and error retry are verified independently from source inspection.
See `frontend/evidence/run-query-2026-11-20/README.md` for failed test assumptions,
exact fixture boundaries, reproduction and unchanged primary4180 activation.
Bootstrap reduction and remaining consumers are still open.
