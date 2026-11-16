# Task-First Workbench Evidence

Date: 2026-11-14, Asia/Singapore.

This is a new iteration after the user rejected the integrated workbench layout.
The older `integration-2026-11-14` evidence remains unchanged. Passing checks do
not mean the user accepted this visual design.

## Result

- Frontend unit tests: 167 passed.
- TypeScript and production build: passed; existing >500 kB chunk warnings remain.
- Product browser script: 36 checks passed, zero page errors.
- Eight styles in both modes: 16 computed-style samples.
- Desktop 1440px and narrow 320/390/768px: no document overflow in checked views.
- One row per task, latest Run status, optional history inspector and correct
  latest-Run links; mobile dialog Escape/focus return checked.
- Synthetic 45-task projection: full-dataset sorting before pagination, shared
  desktop/mobile order, real 20/50 capacities, page reload/back/forward and task-ID
  search. This separate context rejects all API mutations.

All captured product data is an isolated FakeProvider/MockTransport fixture, not
the user's real account or upstream OpenMausBot. No real model calls occurred.
The real 4180/5173 services were left running; disposable 4187/5176 services stopped.

## Reproduce

Use a fresh temporary fixture directory for every complete run:

```bash
mktemp -d /tmp/mybot-astryx-workbench.XXXXXX
PYTHONPATH=.:tests .venv/bin/python tests/browser_server.py <fresh-directory> 4187 astryx-browser-fixture
```

In `frontend/`, build and start an isolated production preview:

```bash
pnpm build --logLevel warn
MYBOT_BACKEND_URL=http://127.0.0.1:4187 pnpm preview --host 127.0.0.1 --port 5176
```

From the repo root, run:

```bash
MYBOT_BROWSER_FIXTURE=1 \
MYBOT_FRONTEND_URL=http://127.0.0.1:5176/ \
WORKBENCH_EVIDENCE_DIR=/tmp/<unique-evidence-directory> \
PLAYWRIGHT_MODULE=/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs \
BROWSER_EXECUTABLE=/usr/bin/google-chrome \
node frontend/scripts/verify-workbench.mjs
```

Local final output: `/tmp/mybot-focused-workbench-20261114-r3/`.
This folder retains `verification.json` and seven selected screenshots; the JSON's
remaining screenshot names refer to that full temporary output.

Earlier attempts are not pass evidence: r1 exposed a refresh-wait race in the test;
r2 exposed an autofocus close-button tooltip consuming Escape. The script now waits
for refreshed data, and dialog close buttons disable only the redundant tooltip,
retaining their accessible names. The complete r3 rerun passed.

Not verified: Safari/physical devices, full JQL/identity/grouping, real model
compatibility or new Agent execution capabilities. Basic search/project/status
and ad-hoc header sorting are still local state; only the documented URL fields
are restored. No performance budget completion or visual acceptance is claimed.
