# ADR-0012: Explicit Task Query Client Admission

- Date: 2026-11-17, Asia/Singapore
- Status: Implemented; isolated acceptance completed
- Work Item: IZ-07.2, a slice of IZ-07, not a new 119-item ledger item
- Follows: [ADR-0011](ADR-0011-server-task-query.md)

## Context

ADR-0011 established a bounded read endpoint without replacing the existing
Bootstrap projection. This slice connects the task list to that endpoint while
preserving the React 19/Astryx 0.7.13 business tree, query drafts, navigation
admission and private SavedView semantics.

A running backend may predate the endpoint. Detecting a failed request and then
silently showing a locally filtered list would conflate an unsupported backend
with a failed read, and would make page totals and ordering change without an
explicit contract.

## Decision

Bootstrap advertises `capabilities.task_query: true` only when the backend
supports this contract. The client uses the bounded endpoint for the task-list
view only when that value is exactly `true`. Missing or false keeps the existing
local projection. An advertised endpoint returning 404 is an error, not a signal
to fall back. Board and Run history keep their existing local semantics.

Build requests only from the committed finite query, effective sort rules,
fixed route scope and URL page/capacity. Basic/JQL candidates remain in memory;
typing a draft does not query the server or authorize model execution. Loading
a SavedView copies its committed snapshot through the existing admission path.

## Strict Client Boundary

Reject malformed input before requesting. Validate successful responses for the
exact schema version, unit, supported sort-semantics identifier, required DTO
fields, bounded page arithmetic, expected item count, duplicate IDs and identity
relationships. Bind the response to the request's effective criteria, sorts,
fixed scope, requested page and capacity. Validate project scope, state and
latest-Run/attempt consistency without manufacturing missing Project fields.

An HTTP 2xx response with an error envelope, missing fields or contradictory
metadata is a failed read. It must not become an empty success or a fabricated
record. Authentication cleanup remains earlier than response-body parsing.

The server is the authority for text matching, total count and ordering. The
client does **not** repeat text membership or sorting as response admission, and
does not re-sort a returned page. JavaScript and Python can use different Unicode
data versions; even lowercase mappings are not guaranteed equal. Recomputing
them in the browser can reject a legitimate server page.

`unicode-natural-v1` names the server algorithm, not Intl.Collator equivalence
or a frozen cross-runtime Unicode mapping. The server runtime's Unicode data
remains a dependency. Shared English/Chinese/Unicode/numeric golden cases are
finite regression examples, not proof of all-Unicode equivalence. A single page
also cannot independently prove the full result count or cross-page order.

## Async And Paging

Query state is bound to a key containing workspace, capability, view, committed
query, sorts, fixed scope, page, capacity and local validation state. Abort and
discard obsolete reads. An older response may not replace a newer query, even
when its transport finishes after cancellation. A bounded read timeout reports a
read failure; it does not retry a Provider request or mutation.

For a different-key query, hide the previous rows while pending. For a same-key
refresh, retain the current rows with an explicit busy state. On failure hide
the result rows, preserve query input and expose an explicit GET-only retry.
Render errors from codes in the current locale rather than retaining a stale
translated string.

Bootstrap refreshes have an explicit/poll cause. A successful explicit refresh
advances a refresh revision for an intentional query refresh. A background poll
may invalidate a ready page, but does not cancel an in-flight query or retry an
error/unavailable page. The request effect must not depend on Bootstrap object
identity: polling every six seconds otherwise aborts slow valid queries and can
silently retry 403/404 failures. An explicit user refresh or GET retry remains
separate from that background invalidation.

Use the response's effective page for displayed pagination and row coordinates.
Do not replace the URL's requested page merely because the server clamped it:
an old page response must not reset a newly requested page or overwrite history.
Back/Forward and refresh continue using canonical shared navigation. There is
no second hash/popstate listener or cross-page snapshot lease.

The project Table wrapper passes server rows through unchanged, while retaining
Astryx's header sort controls/indicators. It must not sort or slice an already
paginated server page again. Accessible total-row and page-start coordinates
come from the bounded response.

## Rollout And Remaining Work

The first acceptance uses intercepted HTTP responses plus a disposable real
HTTP/API/SQLite fixture, not user data or real Provider calls. Final counts, failure
baselines and screenshots belong in the separate
[acceptance record](../../frontend/evidence/server-pagination-2026-11-17/README.md).
The final build passed 870 frontend tests across 38 files, 499 Python tests,
type checking and production build. Production browser reports passed 35 client,
6 actual API, 30 advanced and 58 comprehensive checks with 92 screenshots.
They include an eight-second query across the real six-second Bootstrap poll,
403 without background retry, explicit retry and non-JSON 401 cleanup.

The comprehensive script's first final attempt stopped at its empty-fixture
guard. That failure is retained. A new fixture was checked read-only for zero
projects/tasks/runs/models before the successful final run; no user database
was involved. Temporary 4187/5176 acceptance services are stopped. Existing
bundle and Starlette/httpx warnings remain; commit/push is recorded separately.

This slice does not reduce Bootstrap, global Quick find, sidebar counts or
Inspector history. Those full projections remain IZ-07.3 work. It makes no
end-to-end transfer, production latency or global scalability claim.

The existing 4180 backend and 5173 frontend have not been restarted for this
slice. The running backend does not advertise the new capability, so its task
list keeps the legacy path. Code, tests and commit/push are not service activation.
Any later activation needs separate idle-task, configuration and consistent
backup checks.

No real Provider call, credential read, production database write, execution permission,
connector, team ACL, deployment or device handoff is added. The original ledger
remains 119 total, 9 complete and 110 not fully complete.

## Follow-Up

ADR-0013 subsequently migrates the selected-task Inspector to an explicitly
advertised detail capability and bounded history read. Bootstrap and the other
full-data consumers listed above still remain migration work. Its independent
acceptance does not alter this task-list contract or activate the running backend.
