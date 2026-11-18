# Project Reference Directory Acceptance

Date: 2026-11-18, Asia/Singapore. Work item: IZ-07.3b2.
Contract: [ADR-0015](../../../docs/decisions/ADR-0015-project-reference-directory.md).
Starting branch was clean `main`, synchronized with `origin/main` at `b83e5d9`.

## Final Evidence

| Check | Result | Source |
| --- | --- | --- |
| Frontend unit/component | 1,199 tests / 43 files passed | `unit-results.txt` |
| Backend | 710 passed, including 71 new project-reference tests | Root terminal: `.venv/bin/python -m pytest -q` |
| TypeScript / production build | Passed | `build-results.txt` |
| Project-directory synthetic browser | 37 checks / 14 PNG, no pageerror or API writes | `directory/verification.json` |
| Real HTTP / SQLite browser | 8 checks / 2 PNG, no pageerror | `live/verification.json` |
| Comprehensive browser regression | 58 checks / 60 PNG, no pageerror | `full/verification.json` |
| Workspace-count regression | 15 checks / 6 PNG, no pageerror or API writes | `counts/verification.json` |

There are 82 final screenshots; the three failure screenshots below are separate.
The production build used for all four final browser reports includes both the
navigation mount correction and the final `endContent` count-column correction.
Earlier intermediate passing reports are not the final acceptance.

The directory checks use deliberately inconsistent Bootstrap names and no tasks
to prove the sidebar/rail consume authoritative references and totals. A visible
empty task result in those screenshots is synthetic fixture setup, not a count
bug or production data. Directory matching/order remain server-owned.

Coverage includes actual 20-item pages, selected references outside the page,
independent directory search and task query, IME Enter, missing selection,
true-empty search retaining selection, fixed project scope, keyboard last-page
focus, same-key busy retention, delayed reads spanning an observed Bootstrap
poll, no automatic replay after 403, exact one-GET retry, malformed 2xx,
late-response discard, legacy capability and HTML 401 cleanup.

Three styles (`neutral`, `zira`, `y2k`) in both modes are rendered under reduced
motion. Computed colors/fonts and region geometry are recorded. Screenshot
checks also compare project-count right edges within one pixel; long localized
names truncate without forcing document horizontal overflow. The comprehensive
suite additionally checks 320/390/768/1024/1440 layouts and existing theme,
density, navigation, forms and recovery contracts.

## Actual Endpoint Fixture

The real browser fixture is `/tmp/mybot-astryx-workbench.kDEXR5`, seeded only after
the empty-directory, explicit-marker, schema and symlink guards passed.
It contains 45 projects, 45 tasks and 88 terminal historical Runs, and no models.
Project `reference-project-000` has two tasks and 45 Runs; its latest Run
succeeded after older failed/canceled attempts. Project `reference-project-001`
has a verified task/Run count of zero.

The real report validates clamping, exact selected/missing hydration, all-workspace
totals independent of search, real paging/search/activation, task/Run denominator
switching (45/88 globally and 2/45 for project 000), and the mobile Astryx filter
dialog. It compares full Bootstrap project/task/Run/model arrays before/after.
Its only non-GET request is login using the public fixture token.
The comprehensive run used a separate fresh fixture,
`/tmp/mybot-astryx-workbench.2lUIpj`, with FakeProvider/MockTransport.

## Retained Failures

- `failures/duplicate-navigation/`: first synthetic run found two mounted sidebar
  directories after opening mobile navigation. CSS hid the desktop sidebar but
  did not unmount its read hook. `useDockedWorkbenchNavigation` now mounts only
  the currently presented navigation; opening mobile navigation no longer
  creates a second hidden directory consumer.
- `failures/on-demand-auth/`: after that correction, the old test waited for a
  directory 401 without opening a mobile directory. The test now opens Filters
  before checking the unchanged sign-in/private-data cleanup assertions.
- `failures/counts-hidden-navigation/`: the existing counts suite expected a
  hidden sidebar badge to remain in the DOM after closing navigation. It now
  opens navigation before inspecting the restored/unknown badge. The exact GET
  retry and background-poll assertions remain.

The backend agent's first targeted run was 68 passed / 3 failed because two tests
called unsupported `Store.list("events")` and one assumed the wrong canonical
selected-ID order. Tests now read events with SQLite and inspect references by ID;
the final 71 targeted tests and root's 710-test suite pass. These were test setup
corrections, not endpoint fallback or relaxed assertions.

## Reproduction

From the repository root:

```sh
.venv/bin/python -m pytest -q
PYTHONPATH=.:tests .venv/bin/python tests/browser_server.py "$(mktemp -d /tmp/mybot-astryx-workbench.XXXXXX)" 4187 astryx-browser-fixture
```

From `frontend/`, with that disposable backend running:

```sh
pnpm test
pnpm build
MYBOT_BACKEND_URL=http://127.0.0.1:4187 pnpm preview --host 127.0.0.1 --port 5176
MYBOT_BROWSER_SYNTHETIC=1 node scripts/verify-project-references.mjs
MYBOT_BROWSER_SYNTHETIC=1 node scripts/verify-workspace-counts.mjs
MYBOT_BROWSER_FIXTURE=1 PLAYWRIGHT_MODULE=/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs BROWSER_EXECUTABLE=/usr/bin/google-chrome node scripts/verify-workbench.mjs
```

The comprehensive suite requires an empty fixture. For the actual directory
report, start a **different** empty disposable backend fixture, seed its printed
directory from the root, then run the live script from `frontend/`:

```sh
PYTHONPATH=.:tests .venv/bin/python tests/seed_project_references_fixture.py /tmp/mybot-astryx-workbench.NEW_FIXTURE
```

```sh
MYBOT_BROWSER_FIXTURE=1 node scripts/verify-project-references-live.mjs
```

The Playwright/Chrome paths above describe this environment, not bundled tooling.
Use a locally installed Playwright module and Chrome via the documented env vars
on another machine. Never point fixture-mutating commands at the main service.

## Limits

Original 4180 remains PID 2064113 and has not loaded the new capability. Restored
5173 serves the frontend against that legacy backend; this report is not main
environment activation. Disposable 4187/5176 are stopped after acceptance.
No real Provider requests, credentials, sibling projects, production DB writes,
dependency upgrades or deployment occurred.

The project sidebar and task-scope directory migrated. Full Project selectors,
SavedView validation, routes/list/forms and other view consumers still need
Bootstrap. No transfer reduction, full directory migration, scale performance,
Safari/real-device certification or user visual acceptance is claimed.
Directory draft/page state is local to the mounted panel; changing responsive
containers or closing/reopening a mobile panel can reset it. Task query state
remains governed by the existing URL/draft contract.

Existing Starlette/httpx deprecation and large-chunk build warnings remain.
The app chunk is 147.13 kB (48.70 kB gzip), app CSS 37.86 kB (7.21 kB gzip);
lazy FocusedWorkbench is 67.74 kB (22.23 kB gzip), CSS 12.12 kB (2.62 kB gzip).
These individual build chunks are not a measurement of total initial transfer.
IZ-07.3c/d, IZ-07.4 and the original 119/9/110 ledger remain open.
