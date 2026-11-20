# Inbox Verification And Product Priority Change

Started2026-11-20, completed2026-11-21 Asia/Singapore (user date November20,
America/New_York). Baseline `dd6b34c`.
Contract: [ADR-0020](../../../docs/decisions/ADR-0020-bounded-inbox.md).
Next priorities: [product goals](../../../docs/PRODUCT_GOALS_CURRENT.md).

## Final Results

| Evidence | Result | Scope |
| --- | --- | --- |
| `frontend-tests.log` | 1605 passed,56 files | 21 new Inbox UI and44 adapter/URL tests |
| `python-contract-tests.log` | 156 passed,1 warning | Existing Task-query/detail contracts; no Python changes, full996 suite not rerun |
| `production-build.log` | TypeScript/production build passed | Existing chunk-size warning retained |
| `query/verification.json` | 59 checks,14 PNG | Synthetic endpoints, no writes/external requests/page errors |
| `actual/verification.json` | 8 checks,4 PNG | Real disposable HTTP/API/SQLite; only public fixture login POST |
| `workbench/verification.json` | 58 checks,60 PNG | Fresh disposable FakeProvider/MockTransport regression |

**78 final screenshots**, no page errors. Failed attempts are separate. Three
styles/both modes, reduced motion, Chinese/English and390px mobile are covered.
Chrome viewports and composing events do not certify real devices/IMEs or user
visual acceptance.

Browser suites used the stable production build; later client formatting and44
tests changed no product behavior. The final build passed with the same app/
WorkspacePages JS and CSS asset fingerprints as the tested build; source-map
sizes differ. No browser rerun is claimed for source-map-only differences.

## Product Change

Inbox now reuses existing `task_query` and independently `task_detail` capabilities.
No new Python API, schema or capability was introduced.

- Lists query pending/attention Task-latest states, display exact server rows,
  real total,20/50/100 capacity and one footer. No client sort/filter/slice.
  Recovered Tasks are excluded even when they have historical failed Runs.
- Draft text waits for Search/non-composing Enter. Immediate type scope retains
  that draft. URL q/inboxType/page/pageSize restore via reload/Back/Forward.
  Unsupported JQL/project/state/group conditions fail closed; invalid type remains
  visible until Clear. Task/Run/Board presentation sorting is independent.
- Only a presented selection reads detail. Desktop can select the first item;
  mobile waits for an explicit click and mounts one Dialog body. Missing detail
  capability uses the admitted full list snapshot, while advertised detail errors
  never fall back. Remote summaries use goals/status, not stale Bootstrap errors.
- Same-key refresh retains busy data and blocks current/stale actions; changed
  keys hide old results. Explicit selected IDs removed from a page show unavailable,
  not another Task. A fresh detail outside Inbox is not actionable and offers GET
  refresh. Exact full Task/Run identities feed existing actions.
- Late list/detail GETs are discarded. An8s request survives real6s polling;
  failed reads do not auto-retry. Non-JSON401 clears private data. Model requests
  and mutations do not inherit read retry.
- List/detail regions scroll locally; footer stays visible, native/ARIA-disabled
  pager actions are excluded from focus restoration, user-moved focus is retained,
  and mobile Escape returns to the visible trigger.

Actual fixture `/tmp/mybot-astryx-workbench.OTbdY6` was seeded with45 Projects/
45 Tasks/88 terminal Runs/0 models. Inbox has44 Tasks:43 attention+1 pending.
The recovered Task with45 historical attempts is excluded. Exact pages, full
acceptance, latestRun link and Chinese mobile selection were verified. Original
Projects/Tasks/Runs/models were compared before and after and unchanged.
No preview, model, review or execution POST was sent.

Comprehensive fixture `/tmp/mybot-astryx-workbench.MkX2k7` was fresh and used only
FakeProvider/MockTransport for its existing explicit consent, review and recovery
scenarios. It was not the primary database or a paid Provider.

## Earlier Attempts

- `failures/capability-transition`: the script changed mocked Bootstrap capability,
  then navigated before reloading it. The mounted app correctly still used the
  admitted old capability. Test now reloads the capability before asserting no GET.
- `failures/mobile-refresh-control`: mobile has no visible global Refresh control.
  Test now uses actual Bootstrap polling for removal revalidation; desktop retains
  the visible Refresh check. No product failure is claimed for that assumption.
- Client Agent was interrupted by user steering, then resumed to finish44 tests.
  Its stable product files were preserved; no duplicate implementation was created.

## User Feedback And Next Work

The user reported little visible change and asked for goals/tasks. Recent query
migrations mainly improved data foundations and remained unactivated on the
primary backend. This is not evidence that the complete Agent workbench exists.

The next delivery is now the visible goal/task/Agent/outcome workflow, including
aligning the local entry with an accepted version. Persistent conversation,
fixed Workflow versions, multi-device continuation and connectors follow.
Overview/hierarchy/documents projection work stays tracked but is no longer the
automatic next slice. These new product tasks are documented, not implemented
by this Inbox change. Original119/9/110 ledger remains unchanged.

## Reproduction

Use a fresh disposable `/tmp/mybot-astryx-workbench.*` fixture created by
`tests/browser_server.py`, on4187 with public token `astryx-browser-fixture`.
Seed only the actual fixture using `tests/seed_project_references_fixture.py`;
use a separate fresh unseeded fixture for the comprehensive suite.

```sh
.venv/bin/python -m pytest -q tests/test_task_query.py tests/test_task_detail.py
cd frontend
pnpm test
pnpm build
MYBOT_BACKEND_URL=http://127.0.0.1:4187 pnpm preview --host 127.0.0.1 --port 5176
MYBOT_BROWSER_SYNTHETIC=1 TASK_INBOX_EVIDENCE_DIR=/tmp/mybot-inbox-check node scripts/verify-inbox.mjs
MYBOT_BROWSER_FIXTURE=1 TASK_INBOX_ACTUAL_EVIDENCE_DIR=/tmp/mybot-inbox-actual-check node scripts/verify-inbox-actual.mjs
MYBOT_BROWSER_FIXTURE=1 PLAYWRIGHT_MODULE=/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs BROWSER_EXECUTABLE=/usr/bin/google-chrome WORKBENCH_EVIDENCE_DIR=/tmp/mybot-inbox-workbench-check node scripts/verify-workbench.mjs
```

The synthetic script accepts `TASK_INBOX_EVIDENCE_DIR`; all scripts accept
MYBOT_FRONTEND_URL/PLAYWRIGHT_MODULE/BROWSER_EXECUTABLE. No new dependencies.

## Activation And Limits

Primary4180 remains PID2064113, without task_query/task_detail capabilities; it was
not restarted. Development5173 returns200 and keeps the legacy capability path.
Temporary4187/5176 were stopped. No credentials, primary DB writes, real Provider
calls, sibling changes, upgrades or deployment. Existing Starlette/httpx and
large-chunk warnings remain.

Bootstrap is still full. This slice is not total transfer/performance evidence,
Workflow execution, persistent conversation or Cindy-style handoff.
