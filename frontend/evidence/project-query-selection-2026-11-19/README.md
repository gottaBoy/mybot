# Project Query Selection Acceptance

Date: 2026-11-19, Asia/Singapore. Work item: IZ-07.3c1a.
Contract: [ADR-0016](../../../docs/decisions/ADR-0016-project-query-selection.md).
Starting `main` was clean and synchronized with `origin/main` at `2a3bbdc`.

## Final Evidence

| Check | Result | Source |
| --- | --- | --- |
| Frontend unit/component | 1,245 tests / 45 files passed | `unit-results.txt` |
| TypeScript / production build | Passed | `build-results.txt` |
| Synthetic project-query browser | 44 checks / 8 PNG | `picker/verification.json` |
| SavedView regression | 32 checks / 26 PNG | `saved-views/verification.json` |
| Comprehensive browser regression | 58 checks / 60 PNG | `full/verification.json` |
| Actual HTTP / SQLite browser | 5 checks / 2 PNG | `live/verification.json` |

The 139 final browser checks have 96 PNG and no pageerrors. The final build
includes the correction that limits the SavedView navigation lock to reference
validation, preserving legacy detail-read cancellation on scope change.
The earlier successful reports were intermediate and are not substituted for
these final reports.

No Python source changed. The previous batch's 710 passing Python tests on
November 18 are prior evidence, not a test run repeated on November 19.
The actual browser fixture still exercises real Python endpoints and SQLite.

## Behavior Covered

The synthetic Bootstrap deliberately omits most projects and supplies a wrong
name for another. The strict task endpoint and project references provide actual
test identities independently. No Bootstrap project is fabricated to make a
selector or committed query pass. Its legacy counts are deliberately empty, so
the synthetic screenshots are not production metrics.

Tests cover new committed IDs waiting for selected-reference hydration before
task GET, remote heading names, bounded 20-item pages, draft-only multi-selection,
independent literal directory search, IME Enter, selected IDs across pages/search,
explicit main-query commit and clear, true empty, failed GET versus confirmed
missing, exact retry, malformed 2xx, canceled/late responses, missing-ID removal,
legacy capability and HTML 401 cleanup.

SavedView checks hold a fresh project-reference request, verify no URL/table
application or success announcement, block duplicate load and a competing route,
then change the Basic draft. Validation rejects that changed baseline, retains
the draft and does not replay the queued route. A later fresh validated load
applies its exact project and page size. Dirty-query confirmation precedes a new
validation; a 403 retains the query, draft and applied table settings.
The separate 32-check suite retains legacy CAS, unknown writes, ID reconciliation,
scope-change cancellation, dirty confirmation, 401, mobile and Chinese behavior.

The picker is rendered in neutral, Zira and Y2K styles, both light/dark, under
reduced motion. Computed font/color/geometry are recorded. Mode switches preserve
unsent project selection; long localized names and a 390px Chinese nested Filters
dialog fit without document horizontal overflow. Escape returns focus to the
picker trigger and leaves the outer mobile dialog open.
The comprehensive suite includes existing 320/390/768/1024/1440 layout, theme,
density, query/history, forms and recovery checks.

## Actual API Fixture

The final live report uses `/tmp/mybot-astryx-workbench.3eAI8M`, initialized by
`tests/browser_server.py` and populated by the guarded
`tests/seed_project_references_fixture.py`. Its 45 projects, 45 tasks, 88 terminal
Runs and zero models are disposable. Project 000 has two tasks; projects 024 and
044 add one each. Main Search returns four **visible** task rows for that
candidate. Mobile changes to project 044 remain draft-only until the outer
Filters Search commits, then one visible task is returned.

The live script compares all project/task/Run/model rows before and after.
Its only non-GET request is public fixture login. No real Provider runs.
The final comprehensive suite uses a separate initially empty fixture,
`/tmp/mybot-astryx-workbench.TnytgE`, with FakeProvider/MockTransport.

## Retained Failures

- `failures/reference-log-timing/`: the pending-request event occurred before the
  route handler appended to its log, so a total-read comparison saw 29 versus28.
  The final check counts the exact held project005 request and proves it remains
  one while duplicate load is disabled. No duplicate-validation behavior is hidden.
- `failures/legacy-navigation/`: initially the new busy lock covered all detail
  reads and prevented legacy project navigation. The lock now applies only while
  `onValidateApply` performs project-reference validation. The unchanged legacy
  scope-change and late-response assertions pass in the final 32-check report.
- `failures/field-live-region/`: an existing text-only test matched both the field
  error and Astryx's modal live-region announcement. The test now checks the
  actual input's `aria-describedby` target for the same validation message.
- `failures/live-presentations-r1/` and `r2/`: the first live checks counted both
  desktop and mobile task renderings, yielding eight instead of four and two
  instead of one. Final checks retain the exact row expectations and count the
  currently visible presentation.

A concurrent first typecheck also exposed a temporary hook variable shadowing
(`active` before declaration). The effect liveness flag is now `live`; final
TypeScript/build and full unit tests pass. Failure evidence is separate from
the 96 final screenshots.

## Reproduction

From the root, start an empty disposable fixture:

```sh
PYTHONPATH=.:tests .venv/bin/python tests/browser_server.py "$(mktemp -d /tmp/mybot-astryx-workbench.XXXXXX)" 4187 astryx-browser-fixture
```

From `frontend/`:

```sh
pnpm test
pnpm build
MYBOT_BACKEND_URL=http://127.0.0.1:4187 pnpm preview --host 127.0.0.1 --port 5176
MYBOT_BROWSER_SYNTHETIC=1 node scripts/verify-project-query-selection.mjs
MYBOT_BROWSER_SYNTHETIC=1 MYBOT_FRONTEND_URL=http://127.0.0.1:5176/ node scripts/verify-saved-views.mjs
MYBOT_BROWSER_FIXTURE=1 PLAYWRIGHT_MODULE=/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs BROWSER_EXECUTABLE=/usr/bin/google-chrome node scripts/verify-workbench.mjs
```

Use a **different**, empty marked fixture for actual project-query checks.
After starting its backend, seed the printed directory from the root:

```sh
PYTHONPATH=.:tests .venv/bin/python tests/seed_project_references_fixture.py /tmp/mybot-astryx-workbench.NEW_FIXTURE
```

Then from `frontend/`:

```sh
MYBOT_BROWSER_FIXTURE=1 node scripts/verify-project-query-selection-live.mjs
```

The Playwright module and Chrome paths describe this environment. Configure
`PLAYWRIGHT_MODULE` and `BROWSER_EXECUTABLE` elsewhere. These fixture commands
must never target the user's primary backend or database.

## Limits

Original 4180 remains PID2064113 and has not loaded the read capabilities. The
restored 5173 development entry uses legacy behavior there. Temporary4187/5176
are stopped after acceptance. No credentials, real Provider/paid calls, sibling
modifications, production DB writes, dependency upgrades or deployment occurred.

Project routes/list/forms still consume full Bootstrap Project data. Board,
Run history, Inbox, overview, hierarchy and documents still have other Bootstrap
dependencies. No response/transfer reduction, entire project migration, global
performance acceptance, real-device/Safari certification or user visual approval
is claimed. Directory searches/pages are local panel state and can reset on
close/remount; the parent Basic project candidate persists until its normal
query lifecycle changes it. The 100-ID limit is tested in the picker unit tests.

Existing build warnings remain. App JS is147.20kB (48.71gzip), CSS37.86kB
(7.21gzip); lazy FocusedWorkbench JS78.53kB (25.16gzip), CSS14.03kB (2.91gzip).
Those are individual production chunks, not measured total initial transfer.
The original119/9/110 ledger and IZ-07.3c1b/c2/c3/d/07.4 remain open.
