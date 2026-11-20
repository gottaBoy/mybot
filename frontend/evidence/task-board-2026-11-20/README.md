# Task Board Verification

Date: 2026-11-20, Asia/Singapore. Baseline: `3ab8c69`.
Slice: IZ-07.3c2b1, [ADR-0019](../../../docs/decisions/ADR-0019-bounded-task-board.md).

## Final Results

| Evidence | Result | Scope |
| --- | --- | --- |
| `frontend-tests.log` | 1540 passed, 54 files | 125 new tests: 113 client/URL,10 board component,2 fixed-project intent |
| `python-tests.log` | 996 passed,1 warning | 90 new board tests; shared Task SQL extraction retains existing regressions |
| `production-build.log` | TypeScript and production build passed | Existing chunk-size warning retained |
| `query/verification.json` | 50 checks,12 PNG | Synthetic endpoint, poisoned Bootstrap, no writes/external requests/page errors |
| `actual/verification.json` | 8 checks,4 PNG | Real disposable HTTP/API/SQLite; only public fixture login POST |
| `workbench/verification.json` | 58 checks,60 PNG | Fresh disposable FakeProvider/MockTransport regression |

The final reports contain **76 screenshots** and no page errors. Failed and
intermediate evidence is separate, excluded from that count. Chrome viewports
and synthetic composing Enter do not certify physical devices, real IMEs,
screen readers or final user visual acceptance.

## Behavior And Data

- Only explicit `task_board: true` selects the endpoint; absent/false retains the
  original board. Advertised403/404/503, malformed2xx and401 never substitute
  Bootstrap cards or success-shaped zero totals. Explicit Retry sends one GET.
- Five state columns share one read-only snapshot. Fixed20 per column returns
  at most100 full Task DTOs, preserving the card goal, acceptance/files and exact
  Task passed to the existing Review workflow. A component test checks that
  callback; actual API/UI tests compare full Task data and rendered goal.
  Reading a board is not Provider consent or execution.
- Task-latest state differs from all-Run history. In actual fixture
  `/tmp/mybot-astryx-workbench.gKDKl0`,45 Projects/45 Tasks/88 terminal Runs/0 models
  yield43 attention,1 pending,1 completed Task. Project000 has2 Tasks and15
  historic failed Runs, yet0 current attention Tasks after recovery. Its completed
  card links to exact latestRun044 and reports45 attempts.
- Server order and text matches remain authoritative; the browser never filters,
  sorts or slices admitted pages. Per-column20/20/3 pagination, independent column
  pages, global counts, reload/Back/Forward and page99 clamp are verified.
  Task/Run sort and Task page-size settings do not control the board.
- `boardPages` is URL state. Search/non-composing Enter commits and resets all
  column pages; drafts/IME do not issue requests. Invalid pages block only the
  remote board until Clear; nonempty JQL is explicitly unsupported.
  Fixed-project view/mode/table-setting commands preserve page candidates based
  on original command intent before route scope injection.
- Changed keys hide obsolete cards; same-key refresh retains busy cards and blocks
  current/stale activation handlers. Late responses cannot replace newer query
  results. An8s GET survives real6s Bootstrap polling; loading is not canceled and
  a403 is not automatically retried. Non-JSON401 clears private projections.
- Card regions scroll vertically, the board horizontally, and each column footer
  stays available. Pagination restores horizontal position and available pager
  focus, failure selects Retry, and user-moved focus is preserved. Native and
  ARIA-disabled actions are excluded.
- Three styles/both modes, reduced motion, English/Chinese390px, long labels,
  rendered background/text/fonts/card radius and no document horizontal overflow
  were checked. In the synthetic geometry report, the field named `accent` samples
  a button's text color; it is not independent semantic accent-token evidence.
  The actual mobile script additionally asserts the Chinese page heading.

Original actual-fixture Projects/Tasks/Runs/models were compared before and after
and unchanged. Only public fixture login was posted; all other writes and external
HTTP were blocked. Comprehensive fixture `/tmp/mybot-astryx-workbench.rEJTRT` was
fresh and used FakeProvider/MockTransport for existing consent, review, budget and
recovery scenarios. These fixture calls are not real Provider requests or costs.

## Findings And Earlier Attempts

- Code review found that fixed Project routes injected `project/projects` into
  presentation patches, which made the new writer clear boardPages. The route
  helper now preserves original presentation intent before injecting scope.
  Two added unit tests and desktop/mobile Tasks/Board,mode and table-setting
  browser checks pass on the final production build.
- `failures/chinese-label`: the synthetic assertion expected a different403
  Chinese sentence; corrected to the implemented localized error.
- `failures/browser-closed` and `failures/services-stopped`: an earlier run lost
  its browser and temporary test services; the shell sessions returnedSIGTERM143.
  The cause is unconfirmed. Services were restarted with isolated fixtures and
  final suites passed. This is not presented as a reproduced product failure.
- `failures/login-ui`: API login succeeded, while the existing mounted UI had
  already read unauthenticated state. The script now reloads after fixture login.
- `intermediate/english-mobile`: an early successful actual script forced English
  on every document load, overwriting its later Chinese preference. It now only
  initializes an absent preference and asserts the Chinese heading; the final
  actual suite reran on a new empty, seeded fixture. Those English screenshots
  are not counted as final Chinese evidence.

No product edits followed the final build. Only script assertions and records
changed afterwards. The existing comprehensive script needed no changes this slice.

## Reproduction

Use only a fresh empty `/tmp/mybot-astryx-workbench.*` fixture created by
`tests/browser_server.py`, on4187 with the public `astryx-browser-fixture` token.
Seed the actual fixture using `tests/seed_project_references_fixture.py`.
Use a separate fresh unseeded fixture for the comprehensive suite.

```sh
.venv/bin/python -m pytest -q
cd frontend
pnpm test
pnpm build
MYBOT_BACKEND_URL=http://127.0.0.1:4187 pnpm preview --host 127.0.0.1 --port 5176
MYBOT_BROWSER_SYNTHETIC=1 TASK_BOARD_EVIDENCE_DIR=/tmp/mybot-task-board-check node scripts/verify-task-board.mjs
MYBOT_BROWSER_FIXTURE=1 TASK_BOARD_ACTUAL_EVIDENCE_DIR=/tmp/mybot-task-board-actual-check node scripts/verify-task-board-actual.mjs
MYBOT_BROWSER_FIXTURE=1 PLAYWRIGHT_MODULE=/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs BROWSER_EXECUTABLE=/usr/bin/google-chrome WORKBENCH_EVIDENCE_DIR=/tmp/mybot-task-board-workbench-check node scripts/verify-workbench.mjs
```

Scripts accept `MYBOT_FRONTEND_URL` (default5176), `PLAYWRIGHT_MODULE` and
`BROWSER_EXECUTABLE`. No new dependencies or remote fonts were installed.

## Limits

Primary4180 remains PID2064113 and does not advertise task_board; it was not
restarted. Development5173 continues the legacy capability path. Temporary4187/
5176 were stopped after verification. No credential access, primary DB writes,
sibling modifications, real Provider calls, upgrades or deployment.

Bootstrap remains full. Inbox, overview, hierarchy, documents and remaining Project
consumers still require their own bounded projections; negotiated reduction,
invalidation and transfer/scale measurements remain open. The one snapshot uses
a shared CTE executed for count plus five column reads, not a proven CPU speedup.
The original119/9/110 ledger and current execution permissions are unchanged.
