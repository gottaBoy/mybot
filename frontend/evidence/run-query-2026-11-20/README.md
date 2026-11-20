# Run history query verification

Date: 2026-11-20, Asia/Singapore. Slice: IZ-07.3c2a. Baseline: `5710f3d`.
Contract: [ADR-0018](../../../docs/decisions/ADR-0018-bounded-run-history.md).

## Final Evidence

| Evidence | Result | Source and limits |
| --- | --- | --- |
| `frontend-tests.log` | 1415 tests, 51 files passed | Includes 101 new Run client/sort/table/URL cases; hook lifecycle is browser evidence below |
| Python full suite | 906 passed, 1 warning | `.venv/bin/python -m pytest -q`; 119 new backend cases; Starlette/httpx deprecation retained |
| `production-build.log` | TypeScript and production build passed | Existing chunks above 500 kB warning retained |
| `query/verification.json` | 48 checks, 14 PNG, no page errors | Synthetic intercepted GET endpoints, poisoned legacy Bootstrap, no writes or external HTTP |
| `actual/verification.json` | 9 checks, 6 PNG, no page errors | Real disposable HTTP/API/SQLite and final production UI; only public fixture login POST |
| `workbench/verification.json` | 58 checks, 60 PNG, no page errors | Fresh disposable fixture; FakeProvider and MockTransport only; authorized fixture mutations |

The three final reports contain **80 screenshots**. Failed/intermediate screenshots
are separate and do not contribute to that count. Review included the desktop
and 390px Chinese mobile Run view. Browser geometry is Chrome viewport evidence,
not physical phone/tablet/IME certification or final user visual acceptance.

## What Was Verified

- Explicit `run_query: true` selects the endpoint; missing/false retains legacy.
  An advertised 403/404/503, malformed 2xx or non-JSON 401 never substitutes local
  rows. Failed counts are unknown, not fabricated zeros.
- The table consumes the exact server page without client sorting, slicing or
  text re-filtering. Synthetic Unicode ordering differs deliberately from browser
  collation; an authoritative text match need not match a browser lowercasing rule.
  The synthetic legacy counters deliberately describe poisoned Bootstrap data;
  their values are not an all-consumer migration claim.
- 20/50/100 capacities, true total, page/back/forward/reload, global ARIA indices,
  clamped presentation of requested page99 and single footer are real controls.
  `runOrder` changes independently of Task sorts, invalid values fail closed,
  and supported JQL SUMMARY ordering takes precedence.
- Query drafts and composing Enter send no GET; ordinary Enter commits. Fixed
  project and each Run's own state filter apply; pending tasks yield zero Runs.
  Old responses are discarded. Same-key refresh retains busy rows and blocks
  activation. An 8-second query survives real 6-second Bootstrap polling; polling
  does not replay a 403. Explicit retry is one read request, not a mutation retry.
- Pager focus moves away from disabled final Next, read failure offers Retry,
  and user-moved focus is not stolen. Column visibility and rendered compact row
  geometry survive page remount. These preferences are in memory, not saved views
  or durable reload state. Page-size selection has no separate focus-recovery promise.
- Three styles across both modes, Chinese mobile, reduced motion, appearance
  changes preserving draft/results and no document horizontal overflow were tested.

The final actual fixture `/tmp/mybot-astryx-workbench.cYS5vD` was seeded only by
`tests/seed_project_references_fixture.py`: 45 Projects, 45 Tasks, 88 terminal Runs,
zero models. Project000 has 45 Runs, including 15 failed Runs, while the latest
Run of its recovered task is successful. API and UI preserve both denominators.
All original Projects/Tasks/Runs/models were compared before/after and unchanged.
The final comprehensive fixture was fresh `/tmp/mybot-astryx-workbench.qExepv`;
it performed the existing explicit fixture-only model/recovery/form scenarios,
not real Provider requests. Tokens in those scripts are public test fixture data.

## Failures And Changes

- `failures/jql-wire`: the script initially expected effective JQL sort on the
  request wire. The request preserves explicit candidate sorting; the response
  binds effective JQL ordering. The assertion was corrected.
- `failures/jql-header`: JQL locks sorting and therefore removes sort buttons;
  the script now checks effective rows and locked headers instead of expecting
  an ARIA sort marker on a disabled sort surface.
- `failures/reused-candidate`: the script reused an already committed candidate,
  so Search correctly made no new request. A distinct candidate now tests invalid 2xx.
- `failures/async-sort`: an existing comprehensive test assumed sorting completed
  synchronously. It now waits for the same ascending-header assertion after the
  real server read. All original model, budget, review and recovery checks remain.
- Code review found that a page loading remount could reset table preferences.
  Preferences now live in the parent, with two additional component tests and a
  browser geometry/column check. Final tests and all three browser suites were
  run against the final production build after that change.
- An initial comprehensive invocation lacked `PLAYWRIGHT_MODULE` and stopped
  before opening a browser; the corrected command used the installed local tool.
  No dependency was installed.

## Reproduction

Use an empty, explicitly disposable fixture. Never point these scripts at the
user database. Start `tests/browser_server.py` on 4187 with the public
`astryx-browser-fixture` token; seed only the actual-API fixture. Use a different
fresh empty fixture for the comprehensive suite.

```sh
.venv/bin/python -m pytest -q
cd frontend
pnpm test
pnpm build
MYBOT_BACKEND_URL=http://127.0.0.1:4187 pnpm preview --host 127.0.0.1 --port 5176
MYBOT_BROWSER_SYNTHETIC=1 MYBOT_FRONTEND_URL=http://127.0.0.1:5176/ node scripts/verify-run-query.mjs
MYBOT_BROWSER_FIXTURE=1 MYBOT_FRONTEND_URL=http://127.0.0.1:5176/ node scripts/verify-run-query-actual.mjs
MYBOT_BROWSER_FIXTURE=1 MYBOT_FRONTEND_URL=http://127.0.0.1:5176/ PLAYWRIGHT_MODULE=/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs BROWSER_EXECUTABLE=/usr/bin/google-chrome node scripts/verify-workbench.mjs
```

The two new scripts also accept `PLAYWRIGHT_MODULE`/`BROWSER_EXECUTABLE`;
output directories use `RUN_QUERY_EVIDENCE_DIR` and `RUN_QUERY_ACTUAL_EVIDENCE_DIR`.
The full suite uses `WORKBENCH_EVIDENCE_DIR`.

## Remaining Boundaries

Primary backend4180 remains PID2064113 and does not advertise this capability;
it was not restarted. Development5173 continues its legacy capability path.
Temporary4187/5176 were stopped after verification. No credentials, primary DB
writes, real Provider calls, sibling modifications, upgrades or deployment.

Bootstrap remains full. Board, Inbox, overview, hierarchy, documents and remaining
Project consumers still need independent bounded projections before negotiated
Bootstrap reduction, invalidation and transfer/scale measurements. This is not
whole-app performance evidence. The original119/9/110 ledger is unchanged.
