# Goal And Task Workspace Delivery

Date:2026-11-21 Asia/Singapore. Baseline:`344d7ba`.
Contract:[ADR-0021](../../../docs/decisions/ADR-0021-task-workspace.md).
This is product task packageT0–T6, not another standalone pagination slice.

## What Users Can Do

Open a Task from global search, its list-row arrow, Inspector or Inbox. New Task
creation lands on that same Task route. The page has three views:

1. Goal & acceptance: real Project goal, Task goal, acceptance, explicit files,
   latest Run and20-item history pages.
2. Agent work: the selected real Run's stages, Agents, calls, transcript and
   existing controls, using the original RunWorkspace.
3. Artifact review: the same RunWorkspace's real artifacts and review commands.

Arrange execution explicitly opens the existing context/model/role/budget form.
Saving a Task does not preview files or start a model. A confirmed Run started
from this page returns to the same Task's Agent view, with its exact new Run ID.
No model configured has a real Configure models entry instead of an actionable
fake execution button.

## Final Evidence

| Report | Result | Source |
| --- | --- | --- |
| `frontend-tests.log` |1683 tests,58 files passed |53 new client/URL,24 new view,1 route case |
| `python-tests.log` |996 tests passed,1 warning |Full existing backend suite; no Python product changes |
| `production-build.log` |TypeScript/production build passed |Existing large-chunk warning retained |
| `workspace/verification.json` |37 checks,12 PNG |Synthetic production browser, explicit fixture writes only |
| `workbench/verification.json` |58 checks,61 PNG |Real disposable HTTP/SQLite with FakeProvider/MockTransport |
| `local-verification.json` |6 checks,no screenshots |Actual primary5173→4180, GET-only desktop/mobile |
| `activation-summary.json` |Idle checks,backup,restart,records unchanged |Sanitized primary-service alignment receipt |

**101 browser checks,73 final PNG**, no final page errors. Failed screenshots are
separate. Production workspace tests cover three styles/both modes, reduced
motion, Chinese390px, long title/file content, actual computed text/font and
first-viewport Project/Task goal positions. The reported workspace background
is transparent; it is not independent page-background-token proof. Earlier theme
evidence remains separate. Physical devices/Safari/real IME and user visual
acceptance are not certified.

Build individual chunks:app168.22kB/gzip55.29,CSS38.91/7.35; lazyTaskWorkspace
14.74/5.55,CSS3.57/0.96; RunWorkspace19.77/7.45. These are per-file budgets,
not measured total initial transfer or a whole-app performance improvement.

## Tested Workflow And Boundaries

- Reuse explicit task_detail and independent project_detail. False/missing uses
  real legacy objects; advertised403/404/malformed responses never borrow old
  Bootstrap Tasks/Project fields. Changed ID/late responses and401 are covered.
- History preserves the server20-item page and full Task identity. Task latest
  state, historical failed attempts, execution completion and human acceptance
  remain different facts. Invalid taskTab/taskRun blocks execution content.
- Embedded Run fetch validates expected Task/Run/Project identity before display.
  A mismatched Run has no Agent/artifact actions. Aborted responses return before
  any identity/state writes. Refresh401/403/404 clears old private Run content and
  controls; transient read errors retain the existing explicit error presentation.
- Arrange uses the exact validated Task; task/project refresh and missing model
  gates prevent it. No automatic context preview or model calls occur on route,
  goal view, creation or appearance switches.
- The synthetic suite explicitly posts one artifact acceptance, two user-clicked
  fixture context previews and one Task creation. It sends no Run/model POST and
  no real Provider request. Final report records each write.
- The comprehensive fresh fixture `/tmp/mybot-astryx-workbench.0h505H`
  created its own Project/Task/model, then followed
  Task goal→Arrange→context→budget3→fresh consent→FakeProvider Run→same Task Agent
  view→artifact acceptance. Calls,artifacts,usage,recovery and old paths retain
  their original assertions. The script now verifies Task navigation rather than
  assuming search still filters a list.
- Mobile synthetic covers goal/work/review, pending-task context preparation and
  permissions. The comprehensive suite also retains its existing mobile Run/
  Inspector checks. A full physical-phone creation/execution loop remains untested.

## Defects Found And Earlier Attempts

- `failures/create-navigation`: saving a Task succeeded, but navigation was blocked
  by that completed form's still-busy guard. The guard now treats only unsaved
  operations as navigation-busy; the operation lock still prevents duplicate submit
  until unmount. Final browser creation and real fixture Task→Run return pass.
- Review found a late aborted Run response could clear state before checking abort;
  the check now precedes all validation/state writes.
- Review found refresh403 retained old Run data/actions. Hard identity/permission/
  missing failures now clear them; desktop and mobile runtime assertions pass.
- `failures/project-refresh`: script expected a Project read on a presentation-only
  hash change; it now explicitly reloads before testing403.
- `failures/create-label`: task field labels include Required, so the script's
  exact locator was wrong; corrected without relaxing the creation assertions.
- `failures/old-search-route`: comprehensive test expected Quick find to filter
  the list. It now checks the selected Task's exact route and goal. All other
  original consent/budget/model/recovery assertions remain.
- An initial unit test similarly asserted the former Task-list search URL; updated
  to exact Task workspace navigation. Final1683 tests pass.

## Primary Local Activation

The user asked to implementT0–T6. Before activation, primaryPID2064113 was
confirmed as this repository's loopback4180 service, original workspace/data/
authentication mode. Environment was kept in memory and passed unchanged;
no credential store or sibling configuration was read or printed.

Read-only checks found1 Project,1 Task,6 terminal Runs,1 model,18 Agents,17 calls,
6 artifacts and157 events; no active/queued Run,Call,model test,applying recovery,
connection check or child executor. A consistent online SQLite backup was made;
current Store initialization was rehearsed on a private copy and every original
table/column row compared by digest. A second idle/identity/data check preceded
SIGTERM; no forced kill or competing Worker.

After graceful stop and lock release, a stopped-consistent backup was made.
The original command/cwd/environment restarted the service as **PID3356362**.
Health,workspace/auth equality and new read capabilities passed. Original records
were unchanged after activation and again after read-only browser checks.

Private rollback data and scripts are Git-ignored:

```text
.runtime/backups/before-task-workspace-20261121T031726Z/
.runtime/operations/align_task_workspace_20261121.py
.runtime/operations/verify_task_workspace_local.mjs
```

Backup directory700, DB/log600. Do not restore over a running Worker. Retain
current data and stop the service before any separately authorized restoration.
These backups preserve data, not an executable copy of the old in-memory code.
Do not rerun the identity-bound activation script; oldPID no longer exists.

Initial local browser check found5173 stopped and exited before reading content;
the dev entry was restored, then6 checks passed. No primary screenshots/DOM/business
text were exported. All non-GET requests were blocked; actual writes/external/
page errors are empty. This is not a real model or human-review mutation test.

## Reproduction

For production fixture tests, use a fresh empty disposable backend on4187 with
public token`astryx-browser-fixture` and preview5176. Never aim the comprehensive
write script at primary4180/5173.

```sh
.venv/bin/python -m pytest -q
cd frontend
pnpm test
pnpm build
MYBOT_BACKEND_URL=http://127.0.0.1:4187 pnpm preview --host 127.0.0.1 --port 5176
MYBOT_BROWSER_SYNTHETIC=1 TASK_WORKSPACE_EVIDENCE_DIR=/tmp/mybot-task-workspace-check node scripts/verify-task-workspace.mjs
MYBOT_BROWSER_FIXTURE=1 PLAYWRIGHT_MODULE=/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs BROWSER_EXECUTABLE=/usr/bin/google-chrome WORKBENCH_EVIDENCE_DIR=/tmp/mybot-task-workspace-workbench-check node scripts/verify-workbench.mjs
```

## Remaining Work

Persistent Task conversation/next-round messages, Workflow definition/version
editing, device identity/control leases/handoff, connectors and true real-device
certification remain separate. Current Task workspace uses the existing fixed
read-only Harness and explicit consent; it does not add Shell/code/deployment
permissions or claim Cindy feature completeness. Original119/9/110 unchanged.
Temporary4187/5176 were stopped;5173 and updated4180 remain running.
