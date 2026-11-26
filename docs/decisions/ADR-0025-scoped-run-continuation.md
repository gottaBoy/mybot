# ADR-0025: Scoped Run History And Explicit Workspace Continuation

- Date: 2026-11-24
- Status: Accepted; bounded slice verified and locally activated
- Product: D4b bounded read-position continuation

Extend ADR-0024's `task_read` projection to bounded historical Run references and
one selected Run's bounded report. No execution grant, new write or schema migration.
The existing `task_read,message_save` scopes remain exact.

Bootstrap advertises `device_run_history: true`; paired Task DTO may contain
`run_history: true`. Missing/false preserves the existing portal; advertised failures
never fall back to latest Run/report or owner Bootstrap.

- GET `/api/device/runs?page=1`: fixed20 newest-created, rowid ASC ties, clamped
  page, exact `{schema_version:1,device_id,task_id,items,total,requested_page,page,
  page_size:20,total_pages,has_more}`. References retain `{id,task_id,status,created_at}`.
- GET `/api/device/runs/{id}`: exact `{schema_version:1,device_id,task_id,run,report}`.
  Report uses ADR-0024's existing20000-codepoint bound/truncation/decision contract.
  An exact historical Run without report returns report:null, not latest report.
- Both require active cookie plus `X-Workbench-Device-Id`, checked in the same
  query-only snapshot. Missing/cross-Task Run404; revoked/expired401; changed identity409.
  No config, file context, transcript, agent controls or model metadata.

Owner Task workspace explicitly copies a nonsensitive `#pair?task=...&view=...&run=...`
location. This link requires independently paired authorization; it contains no
pairing code, draft, selected-message text, model authorization or write candidate.
The paired portal URL also owns historyPage. Exact Task mismatches block private
content/actions; malformed/duplicate fields fail closed.

Use canonical navigation admission for URL changes/back/forward. Same-Task presentation
changes retain composer memory, appearance and pending markers. Unknown sends prevent
new navigation that would lose their reconciliation context. Reload preserves only
the original request ID and read position, never invents the missing original text.
Selected Run identity remains explicit when a newer Run appears or history pages move.
No selected Run substitution after missing/error. Only presented history consumers mount.

Reads are cancelable, bounded15s, bind exact Device/Task/Run/page and discard obsolete
responses. Hard authorization/identity errors clear private portal state; transient
history/detail failure hides uncertain results with explicit retry, never success-empty.
Polling refreshes validated selected Run without changing the selection.

Validate API isolation/identity/query-only/bounds, client DTO/request binding,
navigation/dirty/unknown behavior, desktop/mobile and themes in isolated fixtures.
Record local activation separately. D3b execution delegation, D4b cross-device durable
draft/pending-candidate migration, D5b HTTPS/physical devices remain open.

## Verification And Activation

1191 Python tests and2099 frontend tests/70files, typecheck and production build
passed. Includes13 new backend and47 new frontend cases. Existing Starlette/httpx
deprecation and large bundle warnings remain; no dependency upgrade.

10 production scoped-history browser checks and58 existing workbench checks passed
on separate disposable fixtures, with67 final PNGs and no pageerrors. The history
fixture checks exact old/off-page report, pagination/reload/managed traversal,
same-Task draft/unknown-save handling, wrong Task/missing Run/503, scope isolation
and revoke cleanup. Neutral/Zira/Y2K light1440English/dark390Chinese screenshots
were inspected. These are browser viewports, not physical devices or Safari.

Primary4180 was idle, consistently backed up and rehearsed on a private copy.
Original rows were compared before stop/after start; same command/cwd/environment
restarted as PID1303596 with `device_run_history:true`. Primary5173 was restored.
Six GET-only desktop/mobile checks passed; original-row digests compared equal
again after browser verification. All4 device tables remain empty; no primary
pairing/message/model execution or schema migration.

Evidence: `frontend/evidence/device-history-2026-11-24/README.md`, including
retained script/fixture failures and a sanitized local summary. Private backup:
`.runtime/backups/before-devices-20261124T170717Z/`. Local activation is not remote
deployment, execution delegation or server-persisted cross-device draft continuity.
