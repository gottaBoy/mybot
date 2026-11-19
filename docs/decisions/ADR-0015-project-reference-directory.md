# ADR-0015: Bounded Project Reference Directory

- Date: 2026-11-18, Asia/Singapore
- Status: Implemented; isolated acceptance completed
- Work Item: IZ-07.3b2
- Follows: ADR-0014

## Decision

Add `project_references: true` as an explicit Bootstrap capability. Consumers
without that capability retain their existing path. Advertised endpoint failure
must show an error, never fall back to Bootstrap projects or fabricated counts.
Bootstrap remains unchanged while other consumers still need full Project data.

`GET /api/project-references` accepts only `q` (up to 2,000 Unicode code points),
`page` (1 through 1,000,000), `page_size` (20, 50 or 100), and `selected` (strict
JSON array of up to 100 distinct project IDs). Defaults are empty query, page 1,
size 20 and no selected IDs. Reject unknown/repeated parameters, invalid Unicode,
malformed IDs, duplicate IDs and duplicate JSON object keys. Canonical selected
IDs use Python code-point ordering.

Matching is a Python-lowercase literal substring of project ID plus name; trim
the query using Python whitespace semantics. Order by project creation descending
and source rowid ascending, identified by `projects-created-v1`. The server owns
matching and ordering; the browser does not sort or filter authoritative rows.
Clamp a requested page to the last page, with page 1 for an empty directory;
clamping changes presentation, not the request or browser history.

The exact response fields are `schema_version: 1`, `unit: "project_references"`,
`query`, `requested_page`, `page`, `page_size`, `total`, `total_pages`, `has_more`,
`order`, `selected_ids`, `selected`, `missing_ids`, `totals` and `items`.
Each item contains exactly `project: {id, name}`, `task_count` and `run_count`.
`totals` contains exactly `projects`, `tasks` and `runs` for the whole workspace,
independent of the directory query and page. Only tasks joined to real projects,
and Runs joined to those tasks, contribute. Task counts count tasks; Run counts
include every historical attempt.

`selected` hydrates every existing requested ID independently of search and
pagination, in canonical ID order. `missing_ids` is the complementary ordered ID
list. A project outside the current page is not missing. Any page/selected overlap
must have identical data. A failed directory read cannot classify selected IDs as
missing. Do not expose paths, goals, notes, task context, Run configuration or
outputs through this reference endpoint.

Page, selected references, counts and workspace totals come from one mode=ro,
query_only SQLite transaction. Close the connection on every outcome. No
Provider call, database write or per-project HTTP fan-out is involved.

## Client And UI

Use a strict project-owned client with bounded counts, exact DTO shapes,
duplicate/partition/overlap checks, pagination arithmetic and binding to a copied
request snapshot. Share a paginated project-directory component between the
global sidebar and task-scope rail, using Astryx wrappers and semantic tokens.
Keep their directory search/page local; it does not commit the task query.

Directory search commits by Search or non-composing Enter. Show page range and
total, selected off-page references, busy/true-empty/error states and explicit
GET retry. Block obsolete row activation while a different request is pending;
same-key refresh can retain validated rows with a busy indicator. Abort/discard
obsolete reads and clear private data through existing authentication handling.
Explicit refresh revalidates; background Bootstrap polling revalidates only ready
reads, without canceling in-flight work or retrying errors.

The scope rail's All projects count uses workspace totals, never a page sum.
Task/Board and Run-history counts keep their distinct denominators. A fixed
project route displays only the hydrated selected project and remains fixed.
Existing canonical navigation and query-draft admission rules remain in force.

## Remaining Consumers And Evidence

This slice migrates the global project sidebar and task-scope project directory.
Task query selectors and SavedView validation subsequently migrated under
[ADR-0016](ADR-0016-project-query-selection.md). Project routes/list/task forms
were addressed separately in
[ADR-0017](ADR-0017-project-resource-consumers.md); other view consumers still
require Bootstrap. In particular, the installed Astryx MultiSelector supports local option search but
does not expose a remote-search callback; a truncated directory must not be
passed to it as a complete option catalog.

This is not negotiated Bootstrap reduction, a full selector migration, global
performance acceptance, production activation or new execution permission.
IZ-07.3c/d and IZ-07.4 remain open, as does the original 119/9/110 ledger.

The implemented `ProjectReferenceDirectory` is used by Workbench's project
sidebar and `TaskScopeNavigation`, with `countUnit="tasks"` or `"runs"`:

```tsx
<ProjectReferenceDirectory
  data={data}
  refreshRevision={refreshRevision}
  selectedIds={committedConditions.projects}
  t={t}
  variant="scope"
  countUnit={view === 'table' ? 'runs' : 'tasks'}
  includeAll
  onSelect={onProjectFilterChange}
/>
```

Use the published Button `endContent` slot for a stable count column; do not
style vendor label descendants. Mount only the currently presented global
navigation, avoiding duplicate hidden/mobile directory reads. Responsive panel
remounts can reset local directory drafts/pages, without changing task query
state. Fixed project scope is a static reference, not a no-op action.

Final acceptance passed 1,199 frontend tests in 43 files, 710 Python tests,
TypeScript and production build. Production browser checks passed directory 37,
actual API 8, comprehensive 58 and counts regression 15, with 82 final PNG and no
pageerror. Retained failures and reproduction are in the
[acceptance record](../../frontend/evidence/project-references-2026-11-18/README.md).
Original 4180 remains unchanged; capability activation and Bootstrap reduction
are separate work.
