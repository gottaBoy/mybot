# IZ-07.2 Task Query Client Acceptance

Date: 2026-11-17, Asia/Singapore. Work started on November 16.
This is isolated implementation acceptance, not production activation, a visual
redesign, a performance SLO or completion of the full IZ-07 work package.

## Delivered

- Explicit `capabilities.task_query: true` admission for the task-list view.
  Missing/false keeps the old local projection. An advertised endpoint failing
  does not silently fall back to Bootstrap rows.
- Strict input and response DTOs, request-snapshot binding, exact page arithmetic,
  task/project/Run identities, state/attempt consistency and duplicate rejection.
- Python-compatible query whitespace and code-point project-ID canonicalization.
  A caller mutating its request during `await` cannot change the response binding.
- The server owns text matching and ordering. Astryx passes its rows through,
  retaining header controls and global accessible row coordinates without sorting
  or slicing a returned page again. Browser/Python Unicode equivalence is not assumed.
- Drafts stay local. Enter/Search, URL pages, Back/Forward, fixed project scope and
  SavedView loading use the existing shared admission path.
- Obsolete reads are aborted/discarded. Same-key refresh retains rows and Inspector
  with a busy state; failures hide results and preserve input for explicit GET retry.
- Background Bootstrap polling cannot starve a slow read or automatically retry a
  failed read. Successful ready pages can still be revalidated after a background
  refresh; explicit refresh and post-mutation invalidation have their own revision.

The React 19/Astryx 0.7.13 business tree, single-row query, independent top-level
Quick find, upper-right column controls, themes, locales and density remain intact.
No new component library, copied page tree, credential access or real model call.

## Evidence

| Artifact | Final Result | PNG |
| --- | --- | ---: |
| `frontend-tests.json` | 38 test files, 870 passing tests | - |
| `python-tests.xml` | 499 passing tests, zero failures/errors | - |
| `build.log` | TypeScript and production Vite build passed | - |
| `client/verification.json` | 35 intercepted browser checks | 6 |
| `live/verification.json` | 6 actual isolated HTTP/API/SQLite checks | 2 |
| `advanced/verification.json` | 30 legacy-path advanced-query checks | 24 |
| `full/verification.json` | 58 full-workbench regression checks | 60 |

There are 92 final production screenshots. All final browser evidence listed
above is free of page errors. Client and advanced
suites have no business writes. The real API suite creates only a public fixture
login, two synthetic projects and 53 synthetic tasks; it makes no Run, model-test,
retry, control or Provider request.

The live suite used `/tmp/mybot-astryx-workbench.rkQimc` through production preview
5176 and the disposable 4187 API. Exact first/second page IDs and counts match
actual SQL results, including a global natural multi-sort boundary, fixed project
scope, pending state, literal text and the same rows on a 390px mobile viewport.
The full suite used the separate `/tmp/mybot-astryx-workbench.OaPiOM` fixture with
FakeProvider/MockTransport; its consented test/model/Run actions are fixture facts,
not real model invocations or production writes.

The 35 client checks include an eight-second query spanning an actual six-second
active-Run Bootstrap poll: one task-query GET, no interruption, then ready.
They also observe a real poll after 403 without retrying, followed by exactly one
GET for explicit retry. HTML 401 clears private list/Inspector content and returns
to sign-in. Same-key refresh/Inspector retention is tested on desktop; the existing
mobile header hides its Refresh button, so that claim is not extended to mobile.

Screenshots:
[desktop](live/actual-desktop.png),
[390px Chinese](client/mobile.png),
[Chinese 403](client/mobile-forbidden.png),
[Chinese signed out](client/mobile-signed-out.png).

## Failures And Review

- The first comprehensive regression asserted row count synchronously after a
  now-asynchronous committed query. It now waits for the exact expected task,
  while preserving the count assertion. Three unrelated synthetic recovery/form
  fixtures explicitly keep `task_query: false` because they model the legacy API.
  They do not count as bounded-query coverage.
- Parallel contract review reproduced Python/ECMAScript whitespace differences,
  Unicode-version ordering differences and mutation of a caller's awaited request.
  The client was corrected and regression tests added. The shared 15 collation
  examples are finite tests, not proof of full cross-runtime equivalence.
- Review also found that depending on every Bootstrap object would cancel slow
  queries on each poll and automatically replay failures. Explicit/poll refresh
  causes are now separated and the production browser tests above reproduce the
  timing boundary. A wrapper test also covers server mode with legacy page props.
- A final full-regression attempt found an already-populated disposable fixture.
  The fresh-fixture guard stopped after login. Its
  `failed-fixture-verification.json` is retained separately, not counted as
  passing. A replacement fixture was checked read-only for zero projects/tasks/
  Runs/models before the final successful rerun.
- The two-check preliminary client smoke report remains under
  `docs/evidence/task-query-2026-11-16/client/`, explicitly labeled preliminary.
  Earlier 833/492 and 28/6/30/58 results predate the final review fixes.

Existing >500KB optional-preview chunks and the Starlette/httpx warning remain.
No dependency was upgraded to silence them. Chrome viewport tests do not certify
Safari, physical devices, actual IME input or user approval of the visual design.

## Reproduction And Rollout

Use `.venv/bin/python -m pytest` at the repository root and `pnpm exec vitest run`
plus `pnpm build` under `frontend/`. The client script was run with Node 24.21.0,
existing Playwright and `/usr/bin/google-chrome`:

```bash
MYBOT_BROWSER_SYNTHETIC=1 \
MYBOT_FRONTEND_URL=http://127.0.0.1:5176/ \
TASK_QUERY_CLIENT_EVIDENCE_DIR=/tmp/mybot-task-query-client \
node scripts/verify-task-query-client.mjs
```

For `verify-task-query-live.mjs` and `verify-workbench.mjs`, follow the fresh
FakeProvider/MockTransport fixture instructions in `frontend/README.md`. Use a
different newly generated empty directory for each suite and set
`MYBOT_BROWSER_FIXTURE=1`. Never aim mutation suites at the user's backend.

Bootstrap still transfers full tasks and Runs. Global counts, Quick find,
Board/Run history and Inspector details have not been reduced or independently
paginated: IZ-07.3/04 remain open. No overall transfer/latency improvement is claimed.

The user's 4180/5173 services have not been restarted for this capability; their
task list remains on the old capability-compatible path. Commit/push is not
activation. Later activation requires separate idle-task/configuration/consistent
backup checks. The original ledger remains 119 total, 9 complete, 110 not fully
complete; this client slice does not add Agent execution, connectors or device handoff.
After verification the disposable 4187 API and 5176 preview were stopped. The
original 5173 entry still returned 200 and 4180's new query route still returned
404; no user records were modified or private screenshots collected.

Contract: [ADR-0012](../../../docs/decisions/ADR-0012-task-query-client-admission.md).
