# ADR-0017: On-Demand Project Resources And Task Creation

- Date: 2026-11-20, Asia/Singapore
- Status: Implemented; isolated acceptance completed
- Work Item: IZ-07.3c1b
- Follows: ADR-0016

## Read Contracts

Add independent explicit Bootstrap capabilities `project_detail` and
`project_query`. Missing/false keeps the existing consumer. An advertised
endpoint error must not use Bootstrap as fallback or invent missing/zero data.
Bootstrap itself remains unchanged for remaining consumers.

`GET /api/projects/{identifier}/detail` accepts no query parameters. Validate the
identifier using the existing exact UTF-8 project identifier contract (1-100 code
points, no leading/trailing Python whitespace). Its exact response is
`{schema_version:1, unit:"project_detail", project:{id,name,goal,directory,notes},
task_count, run_count}`. Missing project is HTTP404 with structured code
`project_detail_unavailable`. Return no tasks, Runs, credentials or file contents.
Counts include joined tasks and all their historical Runs.

`GET /api/projects/query` accepts only `q`, `page`, `page_size` with the same
bounds/defaults, literal matching, trimming, created-desc/source-asc ordering
and clamping as ADR-0015. Its exact response fields are `schema_version:1`,
`unit:"project_query"`, `query`, `requested_page`, `page`, `page_size`, `total`,
`total_pages`, `has_more`, `order:"projects-created-v1"` and `items`.
Each item is exactly `{project:{id,name,goal,directory},task_count,run_count}`.
Search matches ID/name, not goal/notes/path. Notes belong only to the detail
response. Empty data uses page1/total_pages1 and zero items.

Both responses use one mode=ro/query_only SQLite transaction, close on success
or failure, reject unknown/repeated parameters and malformed Unicode, and
invoke no Provider or mutation. Summary results are server-authoritative; the
client validates exact DTOs, request binding, IDs, counts and pagination
arithmetic without sorting/filtering returned pages.

## Consumers

Project routes request one full Project by route ID before mounting the existing
FocusedWorkbench. Retain same-ID validated content during refresh with busy
metadata, discard old-ID reads and block on error with explicit GET retry.
For same-ID timeout, invalid response or unavailable endpoint, retain previously
validated content with an explicit stale/error notice so a transient refresh
does not destroy a query draft. Confirmed missing/forbidden hides the resource;
401 clears private state. First-load failures never manufacture content.
The route title uses the fetched name. A missing object, forbidden read and
unavailable endpoint are distinct. Fixed scope and query-draft/navigation rules
remain unchanged. Do not synthesize a full Project from minimal references.

The Projects page uses bounded summary pages with URL-backed `q/page/pageSize`,
explicit search draft/commit and one pagination row. Refresh/back/forward restore
committed state; share the canonical navigation admission event. Query changes
hide old rows, same-key refresh retains busy rows, and errors do not look empty.
Use existing Astryx wrappers, semantic tokens and project-list composition.
Keep goal/directory visible; no per-project HTTP fan-out or notes on the list.

Task creation uses the existing project_references capability independently.
Use a project-owned single-project picker built from Astryx wrappers with
paginated references and radio selection. A fixed route's ID is an explicit
initial candidate, not evidence of availability. Global creation starts with
no implicit first project; use explicit selection, verified no-project state
and a real Create project command. Do not route to project creation because a
Bootstrap array is empty when references are supported.

The form validates its selected project independently of Bootstrap and rechecks
that exact ID by a fresh reference GET before POST /tasks. Lock duplicate submit
during validation; preserve inputs on failures. A response is not a durable lease,
so the server still checks the project at mutation time. Do not turn a read retry
into an automatic task-creation or Provider retry. Full Project data is not needed
to select a task's project; notes/path are never copied into form defaults.
Background refresh and theme changes must not replace a user's project candidate.

## Scope And Evidence

Task/Run/Board and other views still retain Bootstrap dependencies. This slice
does not remove Bootstrap fields, add general execution permissions, activate the
main service, create a full project editor or claim global performance gains.
Original119/9/110 remains unchanged. Unit, backend and production browser evidence
is recorded separately from upstream/source observations.

## Implementation And Evidence

`project_resources.py` reuses ADR-0015's parameter parsing, order and joined-count
CTE. The full-detail route accepts encoded delimiters via the path converter;
the static query route is registered first. Client DTOs require every Project
field, bound text lengths, valid counts and exact request identity.

`useProjectDetail` isolates workspace/ID, cancels obsolete reads and revalidates
only ready data during background polling. Empty route IDs fail validation
instead of waiting forever. `ProjectResourceList` is lazy-loaded and preserves
the original goal/directory summaries with URL-controlled 20/50/100 pages.

`ProjectTaskPicker` uses the project-owned `AppRadioList` wrapper, retaining
Astryx radio behavior and UI density. Its selection is a form candidate, never
an implicit first project. The form holds a duplicate-submit lock while a fresh
GET verifies the exact ID; a 15-second timeout, unmount cancellation and
fingerprint check prevent obsolete validation from reaching POST.

Example of the generic wrapper used by the domain picker:

```tsx
<AppRadioList
  label={t('任务项目', 'Task project')}
  value={projectId}
  options={page.items.map(({ project }) => ({
    value: project.id,
    label: project.name,
  }))}
  disabled={busy}
  onChange={selectAdmittedProject}
/>
```

Acceptance passed 1,314 frontend tests / 48 files, 787 Python tests, TypeScript
and production build. Final production reports passed resources37, previous
project-query44, comprehensive58 and actual API4, with81 final PNG and no
pageerrors. The actual API test creates one task and its context preview in an
isolated fixture, compares all original tasks plus projects/Runs/models, and
starts no Run or Provider.

Reproduction and retained failures:
[acceptance](../../frontend/evidence/project-resources-2026-11-20/README.md).
Original4180 remains unchanged and does not advertise either capability.
Restored5173 therefore uses its legacy path. Bootstrap is still full; other
view consumers, negotiated reduction and measurements remain open.
