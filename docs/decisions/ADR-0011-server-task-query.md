# ADR-0011: Bounded Server Task Queries

- Date: 2026-11-16, Asia/Singapore
- Status: Query API slice implemented; frontend adoption remains pending
- Work Item: IZ-07.1, a slice of IZ-07, not a new item in the 119-item ledger

## Context

The current React workbench loads tasks and Runs through Bootstrap and computes
its list locally. A paginated table alone does not bound that transfer or query
work. Before replacing this projection, establish a tested server query contract
without changing the UI or silently adopting another string ordering.

Local sources inspected at baseline `f9e5484`:

- `projections.ts`, `query-conditions.ts`: latest Run per task, current-state
  categories, fieldwise OR/AND and literal search.
- `list-location.ts`, `task-sort.ts`: finite criteria, URL sort priorities,
  limited JQL ordering and rejected unsupported conditions.
- `saved_views.py`: strict SavedViewQuery and SavedViewSortRule definitions.
- `store.py`: persistent timestamps, row order and WAL configuration.

These are local observations, not new upstream research or imported libraries.

## Decision

Introduce `GET /api/tasks/query` as an authenticated read endpoint. Reuse the
strict SavedViewQuery and sort-rule schemas; do not create a JQL parser.

Parameters:

| Name | Contract |
| --- | --- |
| `query` | JSON object with exactly text/projects/states/jql/mode; defaults to empty criteria |
| `sorts` | JSON array of at most 3 unique known-column rules; defaults to empty |
| `scope_project_id` | Optional fixed project; overrides valid conflicting query projects |
| `page` | Positive integer, at most 90071992547409 |
| `page_size` | 20, 50 or 100 |

Unknown/repeated parameters, duplicate JSON keys, unsupported fields/JQL,
non-JSON constants, malformed definitions and unpaired surrogate text fail
explicitly. A selected unavailable project is an error, not an empty success.
Malformed criteria are validated before scope is applied.

Text searches task ID/title/project name/latest Run ID with literal Unicode
lowercase substring semantics; `%`/`_` are not wildcards. It does not search
historic Run IDs, context, output or files. Values are SQL parameters; column
identifiers/directions come only from the finite schema and internal map.

## Read Model

Each item contains the persisted task, minimal project identity/name, minimal
latest Run or null, current state category, and total Run-attempt count.
It does not expose full Run configuration/context merely to display a row.

Only absence of a Run means pending. Known active/attention statuses match the
current client categories; succeeded is completed, canceled and unknown statuses
remain other. A historical failed attempt does not make a recovered task fail.
The denominator is tasks, not Runs or calls.

Latest Run uses created_at descending, then persisted row order ascending for
equal timestamps, matching the inspected existing projection's tie behavior.
Task ties/default order use created_at descending then source row order. It is
not a guarantee across arbitrary database rewrites or changing data.

## Sorting And Pagination

Supported JQL ORDER BY remains authoritative over explicit sorts. The API
returns effective query and sorts, not only the submitted candidate.

String sorting is explicitly `unicode-natural-v1`: Unicode lowercase, ordinary
code-point text order and numeric ordering of ASCII digit sequences without
integer conversion. Leading-zero numeric chunks compare equal; stable task
ordering resolves ties. Attempts is numeric. This is **not** Intl.Collator
equivalence or full locale-aware Chinese/English collation.

Therefore this slice does not switch the current Astryx table to server sorting.
Frontend adoption must explicitly resolve ordering consistency and verify URL,
drafts, fixed scope, page bounds and SavedView behavior.

Count and page selection use one read-only SQLite transaction (`mode=ro`,
`query_only=ON`), not Store's write-locked transaction. Connections close on
success and error. A concurrent committed writer cannot make the two reads use
different snapshots.

The response includes schema_version/unit/items/total/requested_page/page/
page_size/total_pages/has_more/query/sorts/scope_project_id/sort_semantics.
Out-of-range pages explicitly clamp to the last page; an empty result has
page=total_pages=1. Each response has at most page_size items. There is no
cross-request snapshot token: inserts between page requests may move offsets.

Add project/created-time and task/Run-created-time indexes for bounded-scope
reads. Literal text search, broad window aggregation and sorting are not claimed
to be fully indexed or constant-time.

## Verification And Rollout

Tests cover schema/transport rejection, literal Unicode/injection-like input,
latest-state vs history, fixed scope, stable paging and sort priority, read
concurrency, connection closure and authentication without Provider requests.
Isolated 2k/20k-task measurements are recorded separately, not production SLOs.

Evidence: [task-query API acceptance](../evidence/task-query-2026-11-16/README.md).
The frontend still uses Bootstrap; the running 4180 process has not been
restarted for this API and still returns 404. Commit/push is not activation.
No new Provider, execution permission, connector, identity/ACL or device control
is introduced.
