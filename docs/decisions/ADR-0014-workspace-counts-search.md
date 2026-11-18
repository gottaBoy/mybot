# ADR-0014: Workspace Counts And Bounded Quick Find

- Date: 2026-11-18, Asia/Singapore (started November 17)
- Status: Implemented; isolated acceptance completed
- Work Item: IZ-07.3b1, part of IZ-07.3b
- Follows: ADR-0013

## Decision

Migrate shell counts and Quick find to explicitly advertised read contracts.
Keep Bootstrap unchanged until every remaining consumer has its own read model.
Missing/false capability keeps the legacy consumer; an advertised endpoint failing
never falls back to Bootstrap domain data or displays a fabricated zero.

`GET /api/workspace/counts` accepts a strict JSON `projects` array and optional
fixed `scope_project_id`. Fixed scope overrides valid project candidates. It
returns exact `schema_version:1`, `unit:"workspace_counts"`, effective `projects`,
scope, task counts and Run counts from one read-only SQLite snapshot.

Task counts cover all/pending/active/attention/completed/other, using each task's
latest Run. Run counts cover all/active/attention/completed/other across history.
A historical failed attempt does not classify a recovered task as attention.
Only tasks joined to real projects and their Runs contribute.

Shell Workbench badge counts active Runs; Inbox counts pending plus attention
tasks. Scope-status counts use project selection and fixed route scope, without
the current text/status filter. They use Run totals in the history view and task
totals otherwise. Per-project directory badges remain a separate migration.

`GET /api/workspace/search` accepts `q`, finite `limit` (20 or 50) and optional
fixed project scope. Response has exact schema/unit/query/limit/total/has_more/
scope/order/items metadata. Items are tagged minimal project, task and Run
identities, never task context, Run configuration or output.

Search uses Python lowercase literal substring semantics. Projects match ID/name;
tasks match ID/title/project ID/name; Runs also match Run ID across all history,
including records older than the former thirty-entry client limit. Results order
by project/task/Run category then creation descending and source order ascending,
identified by `projects-tasks-runs-created-v1`. A limited page is not a full
directory. The UI reports the returned count and total and invites refinement
when truncated. No full JQL or cross-page immutable lease is introduced.

Both endpoints reject unknown/repeated parameters, malformed IDs/scopes and
unavailable projects. Counts and rows within a response share a mode=ro,
query_only SQLite transaction whose connection is closed on success or failure.
Endpoints never invoke Providers or mutate records.

## Client And UI

Strict DTOs validate safe counts, totals, item lengths, identities, scope,
duplicates and snapshot binding to the exact sent request. The server owns
Unicode matching and ordering. Browser filtering does not reject server results.

Quick find keeps the Astryx CommandPalette wrapper and local navigation commands.
Domain project/task/Run results use the bounded source only when
`workspace_search === true`. Loading/error/true-empty/truncated results are
distinct. Failed reads retain only local navigation with visible error/retry.
Retry is an explicit GET for the current query.

Installed CommandPalette retains optimistic prior rows and catches source errors.
The project wrapper therefore keeps structured status and request generations,
discards obsolete reads and blocks stale option selection by click or keyboard
before the vendor can close the palette. Closing or authentication invalidation
cancels outstanding reads. Source identity remains stable across unrelated
renders so input is not remounted or reset.

Counts show unknown on failure, explicit busy on retained refresh values, and
GET-only retry. An explicit successful Bootstrap refresh invalidates reads;
background polling revalidates ready counts without aborting in-flight work
or automatically retrying failed reads.
An unknown active-Run count keeps conservative Bootstrap status checks rather
than implying zero and stopping observation. Such checks do not replay failed
count requests; only explicit retry or explicit refresh does.

## Remaining Work

Acceptance passed 1,054 frontend tests in 41 files, 639 Python tests, TypeScript
and production build. Production browser checks passed search 32, counts 15,
actual API 6, comprehensive 58 and detail regression 40, with 81 final screenshots.
The counts suite observes actual background polling after a failed count and
proves no automatic count retry. Search checks preserve the pending-selection
guard and validate same-query retry, bounded results and old-history Run search.
Reports, retained failures and reproduction:
[acceptance record](../../frontend/evidence/workspace-reads-2026-11-18/README.md).

No production restart or real Provider call occurred. Original 4180 still
advertises neither new capability, and the restored 5173 entry uses the legacy
path there. Disposable 4187/5176 acceptance services are stopped.

The sidebar/scope project-reference directory and its counts were subsequently
implemented in [ADR-0015](ADR-0015-project-reference-directory.md).
Full Project consumers and negotiated Bootstrap reduction remain open.
This slice is not complete IZ-07.3b, IZ-07.3,
IZ-07.4, a global performance claim or a change to the 119/9/110 ledger.
