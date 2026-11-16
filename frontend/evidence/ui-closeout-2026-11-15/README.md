# WUI-01/06/11 Local Closeout Evidence

Date: 2026-11-15, Asia/Singapore. This is isolated acceptance evidence, not
production-account, model-quality, visual-approval or physical-device evidence.
The earlier November 14 evidence remains unchanged.

## Results

| Report | Passing checks | Screenshots | Boundary |
| --- | --- | --- | --- |
| [Full workbench](full/verification.json) | 57 | 60 | Disposable local API/FakeProvider plus clearly intercepted contracts |
| [Project scope](projects/project-workspace-verification.json) | 16 | 6 | All API reads fulfilled locally; no real backend ACL verification |
| [Navigation](navigation/verification.json) | 9 scenarios | 9 | Real Chrome history with synthetic read models and save responses |
| [Durable recovery](durable/verification.json) | 9 | 3 | Real local API and SQLite, FakeProvider, deliberate response loss |
| [Frontend units](frontend-tests.json) | 418 | N/A | Vitest |
| [Backend units](python-tests.xml) | 306 | N/A | pytest, one existing Starlette/httpx deprecation warning |

All four browser reports have no page errors. There are 78 screenshots;
assertions overlap across reports and are not 91 distinct product capabilities.
`pnpm build` passed TypeScript and Vite production compilation. Existing
greater-than-500-KB optional/shared chunk warnings remain.

## Verified Behavior

- WUI-01: fixed project routing defeats a conflicting project query parameter;
  task/run denominators remain distinct; query, status, ordering, page and capacity
  restore across refresh and Back/Forward; empty/second projects and mobile
  filter/detail focus use the same scope. View controls intentionally reset page
  to one. Rendered ordering is asserted for Tasks, not invented for Board/Runs.
- WUI-06: registering `prepared` does not queue work. Execution needs fresh consent
  and atomically saves its exact receipt. Lost replacement registration reconciles
  candidate B rather than abandoned A. Lost execution response survives reload;
  repeating the same ID creates no second child or additional provider call.
  Resume preserves unspecified timeout and allows a later explicit fresh recovery.
  Source execution facts and preexisting audit events remain; recovery audit
  events append. Applied control is not model success or settled cost.
- WUI-11: managed entries preserve identity rather than overwriting a blocked
  destination. Cancel/confirm, cumulative Back/Forward, `go(-2)`, interleaved
  native Back, managed reload, ordinary links, busy failure/success, 401 reset
  and unmanaged failure closure passed. Native Navigation state contains only
  the owned stamp, separate from classic History state.

## Reproduction

From the repository root, create a fresh directory for each full acceptance run:

```bash
FIXTURE_DIR=$(mktemp -d /tmp/mybot-astryx-workbench.XXXXXX)
PYTHONPATH=.:tests .venv/bin/python tests/browser_server.py "$FIXTURE_DIR" 4187 astryx-browser-fixture
```

In `frontend/`, build and serve a separate preview:

```bash
pnpm build
MYBOT_BACKEND_URL=http://127.0.0.1:4187 pnpm preview --host 127.0.0.1 --port 5176
```

From the repository root, use independently installed Playwright and Chrome:

```bash
export PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs
export BROWSER_EXECUTABLE=/usr/bin/google-chrome
export MYBOT_FRONTEND_URL=http://127.0.0.1:5176/
MYBOT_BROWSER_FIXTURE=1 WORKBENCH_EVIDENCE_DIR=/tmp/mybot-full-unique \
  node frontend/scripts/verify-workbench.mjs
MYBOT_BROWSER_FIXTURE=1 WORKBENCH_EVIDENCE_DIR=/tmp/mybot-projects-unique \
  node frontend/scripts/verify-project-workspace.mjs
MYBOT_BROWSER_SYNTHETIC=1 NAVIGATION_EVIDENCE_DIR=/tmp/mybot-history-unique \
  node frontend/scripts/verify-navigation-history.mjs
MYBOT_BROWSER_FIXTURE=1 WORKBENCH_EVIDENCE_DIR=/tmp/mybot-recovery-unique \
  node frontend/scripts/verify-durable-recovery.mjs
```

The full script requires an initially empty fixture. Run durable recovery only once per fresh
backend: its intentional FakeProvider failure is one-shot. The full suite does
not consume that marker, so the recorded durable run followed the full suite.
Never run these fixture mutations against the production data directory.

Recorded temporary outputs were:

- `/tmp/mybot-workbench-final-20261115-r1/`
- `/tmp/mybot-project-workspace-20261115-prod-r2/`
- `/tmp/mybot-navigation-history-20261115-prod-r2/`
- `/tmp/mybot-durable-recovery-20261115-final-r1/`

## Limits

Existing services 4180/5173 were not restarted. New model-test and recovery APIs
are not enabled in that existing 4180 process; matching frontend/backend revisions
must be enabled together later. Temporary 4187/5176 were used only for acceptance.
No real provider calls, credential reads, external accounts, production writes,
deployment, commit or push were performed.

Safari/physical devices, no-Navigation-API interleaving, cross-document
cancellation, distributed execution and remote provider usage reconciliation
are unverified. Unknown recovery remains locked; no automatic POST replay or
new-ID bypass is permitted. The original business ledger remains 119 items:
9 complete, 110 not fully complete.
