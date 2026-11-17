# IZ-07.3a On-Demand Task Detail

2026-11-17, Asia/Singapore. Isolated implementation acceptance, not main-backend
activation, reduced Bootstrap transfer, a new visual design or full IZ-07.3 completion.
Starting baseline `f917608` was already on `main` and `origin/main`, with a clean tree.

## Delivered

- Explicit `task_detail: true` admission. Read only when a task is selected.
  Missing/false keeps the existing Inspector; advertised errors never fall back
  to Bootstrap history.
- One read-only SQLite snapshot for task/project, latest Run, attempts, count and
  bounded history. Minimal four-field Run rows omit config/context/errors/output.
  Fixed project mismatch and missing task/project share an unavailable response.
- Shared strict task projection parsing, history arithmetic/identity consistency,
  first-page/latest consistency and exact sent-request snapshot binding.
- Independent history pagination: 20 rows by default, without changing the task
  list URL/page. A different task or close/reopen starts at page one.
- Same-key refresh retains validated content with `aria-busy`; old responses are
  discarded, errors hide detail content, and retries are explicit GETs only.
  Background polls do not cancel slow reads or replay failed reads.
- Astryx controls and original Inspector layout remain. Keyboard pagination
  restores an enabled neighbor or Retry, while preserving user-moved focus.

Desktop/mobile container changes remount the Inspector. The selected task
survives, but its history page restarts at one; persistent cross-breakpoint
history paging is not claimed.

## Final Evidence

| Artifact | Result | PNG |
| --- | --- | ---: |
| `frontend-tests.json` | 943 tests, 39 files passed | - |
| `python-tests.xml` | 562 tests passed, zero failures/errors | - |
| `build.log` | TypeScript and production Vite build passed | - |
| `detail/verification.json` | 40 intercepted detail/keyboard checks passed | 9 |
| `live/verification.json` | 6 actual HTTP/API/SQLite detail checks passed | 2 |
| `query-regression/verification.json` | 35 existing bounded-query checks passed | 6 |
| `full/verification.json` | 58 comprehensive workbench checks passed | 60 |

77 final production screenshots, no page errors. Detail and query suites have
zero business writes. The actual detail suite performs only the public fixture
login, with tasks/Runs unchanged before/after inspection. The comprehensive
suite's consented model/Run/control calls use FakeProvider/MockTransport; no real
Provider, credentials or production data were used.

The detail suite covers exact 20/20/5 pages from 45 Runs, stale A/B responses,
close/reopen, A-page-two to B to A, fixed project scope, true empty, 403/404,
malformed 2xx, HTML 401, legacy capability, same-key refresh and an eight-second
read crossing actual Bootstrap polling. A failed 403 remains failed after an
actual background poll; explicit retry is one GET.

Keyboard checks cover Enter paging, last-page fallback to an enabled button,
page-read error focus on Retry, successful retry, and user focus moved to Search
during either a successful or failed read. Desktop English and 390px Chinese
dark mode are included; geometry assertions verify visible history pagination.

The final live suite uses `/tmp/mybot-astryx-workbench.PV7p9d`, seeded with two
tasks and 45 terminal Runs. The seed script requires the exact disposable marker,
expected schema, empty business tables and nonsymlink fixture paths. It creates
no models or active Runs. Exact first/second/third pages agree with seeded facts,
including independent task-list/history pages and mobile remount behavior.
The final full suite uses the separate fresh fixture
`/tmp/mybot-astryx-workbench.qFmVX9`.

Screenshots: [desktop history page 2](detail/desktop-page-2.png),
[Chinese mobile history page 2](detail/mobile-page-2.png),
[keyboard page error](detail/desktop-page-error.png),
[real API history](live/actual-history-page2.png).

## Failures Preserved

- Review found that A-page-two to B to A could reuse A's old page. Inspector
  identity is now keyed by workspace/scope/task; a real browser regression proves
  the return to page one.
- `failures/keyboard/` preserves the failed last-page focus test. The installed
  Astryx Button can use `aria-disabled`, so native `:disabled` alone selected
  an unavailable Next. The fix excludes both and records the originating control;
  the original focus assertion now passes.
- `failures/full/` preserves the comprehensive reload failure: its row count ran
  before the bounded server query completed. The script now waits for the exact
  target task and keeps the original count assertion. New asynchronous Inspector
  checks likewise wait for the exact latest-Run link before checking both rows.
- Three unrelated comprehensive recovery/form mocks explicitly opt out of both
  new read capabilities because they only implement the legacy API. Those mocked
  checks do not count as new detail-API coverage.
- Initial 33/35-detail reports and earlier live/query runs remain in `/tmp`; they
  are not the final build's results. Backend development also corrected two test
  helper mistakes rather than weakening production transaction guarantees.

Existing >500KB optional-preview chunks and Starlette/httpx warnings remain.
Chrome viewports are not physical-device, Safari, actual IME or user visual approval.

## Reproduce

At the repository root:

```bash
.venv/bin/python -m pytest -q tests/test_task_detail.py tests/test_task_query.py
.venv/bin/python -m pytest -q
```

Under `frontend/`, use `pnpm exec vitest run` and `pnpm build`. With the existing
Playwright/Chrome and an isolated production preview:

```bash
MYBOT_BROWSER_SYNTHETIC=1 \
MYBOT_FRONTEND_URL=http://127.0.0.1:5176/ \
TASK_DETAIL_EVIDENCE_DIR=/tmp/mybot-task-detail \
node scripts/verify-task-detail.mjs
```

For the live suite, follow `frontend/README.md` to start a fresh empty disposable
`tests/browser_server.py` fixture. Seed that explicit generated directory:

```bash
.venv/bin/python tests/seed_task_detail_fixture.py /tmp/mybot-astryx-workbench.XXXXXX
```

Replace the example path with the actual fresh fixture directory. The seed
refuses a nonempty or unrecognized database. Then under `frontend/`:

```bash
MYBOT_BROWSER_FIXTURE=1 \
MYBOT_FRONTEND_URL=http://127.0.0.1:5176/ \
TASK_DETAIL_LIVE_EVIDENCE_DIR=/tmp/mybot-task-detail-live \
node scripts/verify-task-detail-live.mjs
```

Use another newly generated empty fixture for `verify-workbench.mjs`. Never point
mutation suites or the seed script at the user's backend/data.

## Rollout And Next Work

Disposable 4187/5176 services are stopped. The previously stopped 5173 development
frontend was started and returned 200. Main backend 4180 remains PID 2064113 and
advertises neither `task_query` nor `task_detail`; that entry therefore uses
legacy reads. No production backend restart, data write or deployment occurred.
Commit/push is not feature activation.

Bootstrap, global Quick find/counts, Board/Run history and other full-data consumers
remain to migrate. This slice does not reduce initial transfer or certify overall
performance. IZ-07.3b starts with global counts/search/reference contracts, followed
by remaining consumers, reduced Bootstrap negotiation and measured invalidation/
transfer behavior. IZ-07.3/04 and the original 119/9/110 ledger are not closed.

Contract: [ADR-0013](../../../docs/decisions/ADR-0013-on-demand-task-detail.md).
