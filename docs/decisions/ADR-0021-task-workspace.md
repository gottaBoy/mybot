# ADR-0021: Goal, Task, Agent And Outcome Workspace

- Date: 2026-11-21, Asia/Singapore
- Status: Accepted; initial workspace delivered and locally activated
- Work Items: PRODUCT_GOALS_CURRENT T0–T6
- Follows: ADR-0020

## User Outcome

A stable `#task/<encoded-id>` route is the Task's working context. Creating a Task
lands here without an automatic context preview or model request. Existing Task
list, command search, Inspector and Inbox offer an explicit Task workspace link.
Existing Run links and query/selection behavior remain available.

The same Astryx business tree shows three real views: goal/acceptance, Agent work,
and artifact review. Project goal, Task goal, acceptance and explicit files are
separate. Primary action enters existing resource/context confirmation; no new
execution ceiling. Missing models remain explicit, not defaulted or fabricated.

## Read Contract

Reuse explicit `task_detail` and bounded Task-history DTO for Task data/history.
Missing/false capability uses the full legacy Bootstrap Task, real Project and
history; missing objects stay missing. Advertised failures never fall back.
Full Project goal comes from independent `project_detail` when advertised,
otherwise its real Bootstrap Project. Minimal project references cannot fill it.
Read by exact ID; changing ID hides obsolete values. Use15s timeout, cancellation,
late-response protection, ready-only poll and explicit GET retry. 401 clears private.

History pages use20 items, separate local state. Changing Task resets history.
Task completion is latest Run state, not human acceptance or historic failures.
An execution selection may use a history Run or latest Run. `taskTab` is
goal/work/review (default goal); `taskRun` is an optional exact Run ID. Invalid
tab/ID fails explicitly, with a clear action. Navigation uses the canonical guard.

The existing RunWorkspace is reused, lazily, in work/review views. Add a compact
embedded heading and initial work/artifacts tab; preserve all existing controls,
budget, recovery, transcript, usage and review behavior. Bind each fetched Run
to expected Task ID before displaying/actions; a mismatched Run must fail closed.
Do not fetch an unrelated Run merely to obtain an apparent valid task.
Task read failure prevents mounting the Run workspace.

No second execution authority, fake Agent roster, animated progress or duplicate
artifact write implementation. Run links can still open the standalone Run page.
Selected Run/artifact writes keep existing exact request/consent/outcome behavior.

## Presentation And Actions

Task header names the real Task and Project; goal view contains the two goal
scopes, acceptance, selected files and real latest/history Run facts.
Work/review show the actual persisted Run using existing components. A no-Run
state offers resource preparation, not a disabled mock graph.

Task creation now calls a navigation callback, not `prepare(task)` automatically.
Explicit Arrange execution calls the same preview/form flow. Successful Run
creation from a Task route stays in that Task's work view with exact new Run ID.
Other existing entry behavior remains. Recovery can keep standalone links.

Initial errors, refreshing/busy, forbidden, missing, unavailable and true no-Run
states stay distinct. Retained busy snapshots cannot start preparations or domain
actions. Theme/mode/language changes preserve Task and selected view.
One page/component tree, project wrappers, semantic tokens, no dependency upgrade.
Three styles/both modes, desktop/mobile, keyboard, long localization and reduced
motion require runtime evidence.

## Local Activation

T0 audits current4180 identity/configuration, read-only activity and SQLite records.
Prepare a private consistent backup and rollback plan before controlled activation;
never interrupt active/queued Runs or tests, or start an extra competing Worker.
Preserve original environment without printing credential values. No fixture script
may target primary4180. User's request to implement T0–T6 authorizes this local
alignment only when the activity/backup checks are satisfied. Any changed condition
blocks activation while independent product work can continue.

Activation verifies original records before/after, unchanged auth/workspace,
new read capabilities and read-only desktop/mobile access. No real Provider call,
automatic Task/model mutation, remote deployment or privilege expansion.

## Remaining Product Work

Persistent conversations, editable/versioned Workflow definitions, device identity/
control leases/handoff and Feishu/Yuque/mail/DingTalk/WeChat remain separate tasks.
This workspace makes existing goal→execution→outcome capabilities accessible; it
does not claim those later capabilities. Original119 ledger is unchanged.

## Evidence

1683 frontend tests/58 files,996 Python tests, TypeScript and production build
passed. Final production browser:37 workspace checks and58 comprehensive checks
(73 PNG), including real disposable Task creation→consent/budget→FakeProvider Run
inside the Task→artifact acceptance. Primary local activation adds6 read-only
desktop/mobile checks, with original records unchanged and no model requests.
Primary4180 nowPID3356362;5173 uses the new capabilities. Private consistent
backups precede activation. See `frontend/evidence/task-workspace-2026-11-21/README.md`
for exact failures, fixes, activation and physical-device limits.
