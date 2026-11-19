# Project Resource Consumers Acceptance

Date: 2026-11-20, Asia/Singapore (November19 in America/Los_Angeles).
Work item: IZ-07.3c1b. Clean starting `main/origin/main`: `7bb2140`.
Contract: [ADR-0017](../../../docs/decisions/ADR-0017-project-resource-consumers.md).

## Final Results

| Check | Result | Evidence |
| --- | --- | --- |
| Frontend unit/component | 1,314 tests / 48 files passed | `unit-results.txt` |
| Python | 787 passed, including77 new project-resource cases | `backend-results.txt` |
| TypeScript / production build | Passed | `build-results.txt` |
| Synthetic project resource browser | 37 checks /10 PNG | `resources/verification.json` |
| Prior project-query regression | 44 checks /8 PNG | `query/verification.json` |
| Comprehensive regression | 58 checks /60 PNG | `full/verification.json` |
| Actual HTTP / SQLite browser | 4 checks /3 PNG | `live/verification.json` |

All143 final browser checks passed with81 final PNG and no pageerrors. The final
production build includes radio-density mapping and the constrained page-size
control. Previous intermediate reports are not the final acceptance.

New frontend coverage includes59 resource-client/list tests,7 task-picker/form
boundary tests and3 form-validation cases. Effects and real overlay/radio
behavior are checked in the browser, not claimed from SSR markup alone.
Backend tests cover exact summaries/full detail, strict Unicode/parameters,
encoded IDs, auth, counts/orphans, concurrent snapshots, connection closure and
no Provider calls or record/event writes.

## User Flows

The synthetic Bootstrap has no projects while new capabilities are enabled.
The Projects page renders20 authoritative summaries, including goals/directories
and task/all-history-Run counts, without notes. URL pages/search survive Back.
IME does not submit, failed reads have explicit GET retry, malformed2xx remains
an error and late pages cannot replace a newer committed query.

Project routes fetch full data by ID; old-ID responses cannot populate the new
route. Project info shows notes from detail only. First-load403, confirmed404 and
invalid empty route IDs are distinct from loading. A same-project transient503
keeps validated details, displays stale feedback and preserves a pending task
query; explicit retry recovers without remounting it.

Global task creation starts with an explicit empty candidate, independently of
the Bootstrap catalog. The nested Astryx picker shows20 radios, supports actual
paging and keyboard Space selection, and admits one project. Before POST, the
form reads fresh selected references. A held403 produces no task POST and keeps
inputs; a later explicit resubmit reaches one mocked422 and preserves its draft.
No-project state offers Create project; dirty input requires a real Keep/Discard
choice. Missing capabilities retain legacy behavior; HTML401 clears private data.

Three styles (`neutral`, `zira`, `y2k`) in both modes render under reduced motion.
Computed colors/fonts/geometry are recorded. Mode changes preserve project-list
search drafts. Desktop and390px Chinese form/detail layouts, long localized goals,
single selection and document overflow are checked. The comprehensive suite
also exercises320/390/768/1024/1440 and existing density/appearance/navigation/
query/recovery contracts.

## Actual Fixture

Final live fixture: `/tmp/mybot-astryx-workbench.9HjicZ`, created by the isolated
browser service and populated using the guarded project-reference seed.
It starts with45 projects,45 tasks,88 terminal Runs and zero models.
The actual query returns20/45 summaries; project000 detail reports2 tasks/45
historical Runs. List page/search restore on reload, then open that fixed scope.

The browser explicitly selects project044 and saves one test task, then checks
the context preview. All45 original tasks, projects, Runs and models are compared
before/after; exactly one new task belongs to044. No new Run or model exists.
Its only non-GET calls are fixture login, POST/tasks, and the new task's preview.
No real Provider/paid call occurs. Screenshot `real-mobile-project.png` shows
project044 with two tasks after this authorized fixture creation.

The comprehensive suite uses a separate initially empty fixture,
`/tmp/mybot-astryx-workbench.sgdukI`, with FakeProvider and MockTransport.
Earlier live fixture `jhH0B0` also passed but predates the added exact comparison
of all original task rows; it is not the final live evidence.

## Retained Failures

- `failures/legacy-link/`: a text locator matched both the legacy sidebar and
  project-result link. It now scopes to the actual project list, keeping the
  no-new-GET/legacy assertion.
- `failures/mobile-navigation/`: the script tried to activate a background
  empty-state New task button while mobile navigation owned focus. It now uses
  the button in the current navigation dialog.
- `failures/keep-editing/`: the discard dialog has both a close button and a
  command named Keep editing. The final test selects the form-action command,
  retaining its exact draft-preservation assertion.
- `failures/explicit-task-selection/`: the comprehensive script depended on the
  removed implicit first-project default and correctly failed to create a task.
  It now explicitly selects the one fixture project using the real radio picker.
  All later context, budget, review and recovery assertions remain.

During concurrent implementation a typecheck exposed a `useRef` declaration
without an explicit initial value; it now uses `undefined` explicitly. Two
initial client-list SSR test assumptions incorrectly expected resolved effect
data; the final unit tests check initial loading/no fallback, and browser reports
prove the asynchronous rows. These are separate from the final passing evidence.

## Reproduction

Start an empty disposable backend from the root:

```sh
PYTHONPATH=.:tests .venv/bin/python tests/browser_server.py "$(mktemp -d /tmp/mybot-astryx-workbench.XXXXXX)" 4187 astryx-browser-fixture
.venv/bin/python -m pytest -q
```

From `frontend/`, build and start a production test preview:

```sh
pnpm test
pnpm build
MYBOT_BACKEND_URL=http://127.0.0.1:4187 pnpm preview --host 127.0.0.1 --port 5176
MYBOT_BROWSER_SYNTHETIC=1 node scripts/verify-project-resources.mjs
MYBOT_BROWSER_SYNTHETIC=1 node scripts/verify-project-query-selection.mjs
MYBOT_BROWSER_FIXTURE=1 PLAYWRIGHT_MODULE=/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs BROWSER_EXECUTABLE=/usr/bin/google-chrome node scripts/verify-workbench.mjs
```

The comprehensive suite requires an empty fixture. For the live project suite,
start another empty marked backend fixture and seed its printed path from root:

```sh
PYTHONPATH=.:tests .venv/bin/python tests/seed_project_references_fixture.py /tmp/mybot-astryx-workbench.NEW_FIXTURE
```

Then from `frontend/`:

```sh
MYBOT_BROWSER_FIXTURE=1 node scripts/verify-project-resources-live.mjs
```

This creates one task in that disposable fixture. Never run fixture scripts on
the primary backend/database. Playwright and Chrome paths are environment-local;
set `PLAYWRIGHT_MODULE` / `BROWSER_EXECUTABLE` for another installation.

## Limits

Original4180 remains PID2064113, unchanged and without the new capabilities.
Restored5173 serves current frontend against that legacy backend. Disposable
4187/5176 are stopped after acceptance. No credentials, sibling modifications,
production data writes, dependency upgrades or deployment occurred.

These consumers no longer require Bootstrap projects when their capabilities are
enabled. Other views still use Bootstrap projects/tasks/Runs. The payload is
unchanged: no negotiated reduction, full invalidation graph, scale acceptance,
global speedup, Safari/real-device certification or user visual approval is
claimed. Project notes are read data, not automatic permission to send them to
a model. Fresh reference validation is not a lease or task-mutation idempotency.

Existing Starlette/httpx and chunk-size warnings remain. App JS163.10kB
(53.89gzip), CSS38.91kB (7.35gzip); lazy Projects list JS5.87kB (2.53gzip),
CSS1.38kB (0.49gzip); lazy FocusedWorkbench JS78.08kB (25.01gzip),
CSS14.03kB (2.91gzip). These are individual chunks, not total initial transfer.
IZ-07.3c2/c3/d, IZ-07.4 and the original119/9/110 ledger remain open.
