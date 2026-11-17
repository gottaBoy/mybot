# IZ-07.3b1 Workspace Counts And Quick Find

2026-11-18, Asia/Singapore. This batch began on November 17 and resumed after a
T3 restart. Baseline `366ca3e` was already pushed with a clean starting tree.
This is isolated acceptance of the shell/status-count and search consumers,
not reduced Bootstrap transfer, complete reference-directory migration or
activation of the user's running backend.

## Delivered

- Read-only aggregate API with distinct task-latest and all-Run denominators,
  project OR selection, fixed route scope and one SQLite response snapshot.
- Bounded navigation search across project/task/Run identities, including old
  historical Run IDs. Explicit total/has-more, finite 20/50 capacity, literal
  Unicode matching and minimal references without context/config/output.
- Strict runtime DTO and sent-request binding, safe count arithmetic,
  canonical project IDs, scope consistency and duplicate/reference rejection.
- Shell Workbench/Inbox badges and task/Run status-scope counts use the aggregate
  capability. Failed values stay unknown and have explicit GET retry.
  Retained refresh values are marked busy. Unknown active-Run counts keep
  conservative background status checks; those checks do not replay failed
  count reads.
- Astryx Quick find retains local navigation and uses bounded remote domain
  results when explicitly supported. Loading/error/true-empty/truncation have
  separate feedback. Request generations, cancellation and selection guards
  prevent optimistic old options from navigating or closing the palette.
- Same-query retry preserves input and sends one GET. Missing capabilities retain
  legacy local behavior; advertised failures never substitute Bootstrap results.
  HTML 401 clears private projections.

## Final Evidence

| Artifact | Result | PNG |
| --- | --- | ---: |
| `frontend-tests.json` | 1,054 tests in 41 files passed | - |
| `python-tests.xml` | 639 passed, zero failures/errors | - |
| `build.log` | TypeScript and production build passed | - |
| `search/verification.json` | 32 search checks | 4 |
| `counts/verification.json` | 15 aggregate/UI checks | 6 |
| `live/verification.json` | 6 actual HTTP/API/SQLite checks | 2 |
| `full/verification.json` | 58 comprehensive checks | 60 |
| `detail-regression/verification.json` | 40 existing detail checks | 9 |

All reports above passed on the final post-review production build: 81 final
screenshots, no page errors. Intercepted suites made no business writes.

Search checks cover an actual clickable old domain option, a visible same-name
navigation option, pending Enter/click blocking, settled keyboard navigation,
superseded responses, 20/35 truncation, 403/404/malformed 2xx, one-GET retry,
close/late response, synthetic IME events, legacy fallback and non-JSON 401.
Desktop English and 390px Chinese dark mode are included.

Counts checks deliberately use Bootstrap with no tasks/Runs and remote aggregates
with data. This proves the new consumer uses the authoritative aggregate rather
than the currently loaded list. These mixed synthetic projections are not a
claim that the product has already reduced Bootstrap. Tests cover task/Run
denominators, fixed project scope, refresh, unknown errors, malformed 2xx,
explicit retry and legacy capability.

The actual API fixture contains two synthetic tasks and 45 terminal Runs, without
models. It proves task counts `2` versus Run count `45`, bounded search `20/48`,
searching `detail-fixture-run-000`, rendered shell/scope values, managed exact task
navigation and 390px search. The suite writes only the public fixture login;
tasks/Runs are compared unchanged afterward.

The comprehensive suite uses a separate fresh fixture and FakeProvider/
MockTransport. Its test/model/Run/control requests are fixture facts, not real
Provider calls, charges or production writes. All intercepted suites reject
business writes and external network requests.
Final actual-API fixture: `/tmp/mybot-astryx-workbench.tDjiFK`. Final comprehensive
fixture: `/tmp/mybot-astryx-workbench.QEwiAZ`. Both are disposable; no user database
was opened for these tests. Counts also observe a real 6.5-second background
poll after 403 without an automatic count retry.

Screenshots: [mobile bounded search](search/mobile-bounded.png),
[unknown counts](counts/desktop-unknown.png),
[actual old Run search](live/old-run-desktop.png).

## Failures And Limits

- The restart canceled an unfinished UI agent and an earlier client turn hit a
  concurrency error. Existing edits were retained; three recovered agents finished
  backend, client and UI ownership without mixing incomplete code with acceptance.
- The initial client test mutated a shared fixture object, changing every
  reference rather than creating a contradiction. The fixture now replaces one
  project/task reference; strict conflict rejection is retained.
- `failures/full.json` preserves the first comprehensive failure: it selected a
  same-name bootstrap navigation option before the new query settled. The
  intentional stale-selection guard blocked navigation. The script now waits
  for `aria-busy` to clear, then retains its original keyboard/route assertions.
  The expanded search suite directly tests that pending same-name selection
  fails and settled selection succeeds.
- Installed Astryx catches search errors and uses nullish empty-state defaults.
  The wrapper preserves structured errors and uses an explicit empty string
  during loading/error instead of incorrectly showing a success-shaped empty.
  See OPEN_SOURCE_RESEARCH section 30.
- `failures/counts-initial.json` preserves an early request-count failure: it took
  the baseline before the independent scope request had settled. Final scripts
  wait for both failures before asserting one explicit shell retry. Other
  diagnostics corrected duplicate mobile navigation locators, the closed mobile
  Filters dialog and a project-page heading expectation; no product assertion
  was removed.
- The counts seed helper accepts underscore/hyphen temporary-directory suffixes,
  while retaining exact `/tmp` fixture prefix, marker, schema, empty-table,
  symlink and atomic-write boundaries. No user database is eligible.

Project directory badges, reference catalogs, Board/Run-history and other
full-data consumers remain pending. There is no cross-response snapshot lease,
initial-transfer reduction, overall latency SLO or complete IZ-07.3/04 claim.
All original 119/9/110 ledger counts remain unchanged. Existing bundle-size and
Starlette/httpx warnings remain. Synthetic IME and Chrome viewports do not certify
physical devices, Safari or user acceptance of the visual design.

## Reproduce

At the repo root, use `.venv/bin/python -m pytest -q`. Under `frontend/`, run
`pnpm exec vitest run` and `pnpm build`. With the existing Playwright/Chrome:

```bash
MYBOT_BROWSER_SYNTHETIC=1 \
MYBOT_FRONTEND_URL=http://127.0.0.1:5176/ \
node scripts/verify-workspace-search.mjs

MYBOT_BROWSER_SYNTHETIC=1 \
MYBOT_FRONTEND_URL=http://127.0.0.1:5176/ \
node scripts/verify-workspace-counts.mjs
```

Follow `frontend/README.md` to start a fresh disposable browser_server fixture
and preview, then seed it with `tests/seed_task_detail_fixture.py` before running:

```bash
MYBOT_BROWSER_FIXTURE=1 \
MYBOT_FRONTEND_URL=http://127.0.0.1:5176/ \
node scripts/verify-workspace-reads-live.mjs
```

Use another newly generated empty fixture for `verify-workbench.mjs`. Never point
mutation suites at the user's backend. Code/commit/push does not activate the
running 4180 process. Final service and push state are recorded in CONTINUE.md
and Git.
The disposable 4187 API and 5176 preview were stopped after verification.
The stopped 5173 development entry was restored. Original 4180 remains unchanged
and advertises neither workspace capability, so 5173 uses legacy reads there.

Contract: [ADR-0014](../../../docs/decisions/ADR-0014-workspace-counts-search.md).
