# Blueprint And Multi-Agent Slice

Date: 2026-11-14, Asia/Singapore.

The user authorized continuing the top-down layout blueprint and requested a
complete todo inventory with multi-agent implementation. The complete original
110 pending business items are indexed in `docs/TODO_INDEX.md`; they are not all
completed by this UI slice.

## Delivered Scope

- BP-01: the task scope rail and workspace header start at the same vertical
  position. The right-side query, field filters, mode and views share one row on
  desktop. Pagination/page size live only in the bottom footer; long lists scroll
  inside the list body.
- The existing single-field sort opens through a header tool. There is no new
  column configuration, multi-sort, full JQL or grouping capability.
- Narrow screens retain one core query row, with task views in the header and
  filters in the existing Dialog. Desktop inspectors temporarily reclaim scope
  space when both panels would compromise the task list.
- WUI-02: directory filtering does not change the selected document; arriving
  project data, invalid scope and removed task selection have explicit behavior.
- WUI-07: an open call dialog derives its record by ID from current run data.
  Normal polling updates status, usage and errors; a removed call does not retain
  a stale success object.

## Verification

- 230 frontend unit tests passed, including 13 document and 3 call-selection tests.
- TypeScript and production build passed. Existing >500 kB chunk warnings remain.
- Final full browser run: 44 named checks passed, zero page errors.
- Geometry checks cover scope/header alignment, same-row controls, recovered
  width, a usable inspector list width and 45-row list scrolling with a stable
  bottom footer.
- Existing 10 routes × 1440/1024/390px inventory, three configuration forms,
  320/390/768px flows and 16 computed style/mode samples remain in the suite.
- Independent read-only contexts validate document selection and live call
  refresh. They allow only synthetic GET responses, reject all API writes, and
  preserve the same open call Dialog throughout the status transitions.
- A closed-tooltip assertion protects the heading from accidentally overriding
  vendor popover visibility. A separate real-workspace read-only hover check
  confirmed the Sort tooltip stays hidden when closed and anchors by the button
  when open.

Screenshots and JSON contain synthetic fixtures, not the user's production tasks.
The main service uses FakeProvider/MockTransport. No real model requests, sibling
credentials, database contents or permission changes were used.

## Reproduction And Limits

Follow the disposable fixture/build/preview procedure in
`../product-ui-audit-2026-11-14/README.md`, using a fresh directory and evidence
output each time:

```bash
MYBOT_BROWSER_FIXTURE=1 \
MYBOT_FRONTEND_URL=http://127.0.0.1:5176/ \
WORKBENCH_EVIDENCE_DIR=/tmp/<new-evidence-directory> \
PLAYWRIGHT_MODULE=/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs \
BROWSER_EXECUTABLE=/usr/bin/google-chrome \
node frontend/scripts/verify-workbench.mjs
```

Final full output: `/tmp/mybot-blueprint-multiagent-20261114-r3/`.
This directory retains verification JSON and nine selected screenshots. Other
screenshot names refer to the complete temporary output. Previous audit and
design evidence remains unchanged.

Earlier attempts are not final evidence: r1 matched an additional vendor live
region instead of the domain count; r2 passed behavior tests but screenshot
review exposed a broad heading selector revealing a closed tooltip. The selector
was scoped to the owned heading content, a regression assertion was added, and
r3 reran the entire suite from a fresh fixture.

Temporary test services 4187/5176 stopped; real 4180/5173 remain. No Python business
logic changed or Python suite rerun. Ten UI audit items, BP-02–05, full advanced
list controls, native recovery, real connectors/devices and production acceptance
remain pending. Visual acceptance is still the user's decision.
