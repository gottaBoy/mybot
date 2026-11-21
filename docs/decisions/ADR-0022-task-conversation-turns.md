# ADR-0022: Persistent Task Messages And Next Runs

- Date: 2026-11-21, Asia/Singapore
- Status: Accepted; first slice implemented, verified and locally activated
- Product: Persistent Task conversation, first slice

## Product Contract

Task workspace adds a Conversation view. Users save immutable supplemental
messages, inspect real linked Run outcomes and explicitly prepare a next Run.
Saving a message does not read files, call a model or create a Run.
Only the selected message is added to the original Task context for that Run;
previous conversation messages and model outputs are not automatically resent.
Show this scope in confirmation. Original Task and old Run snapshots stay unchanged.
This is persistent Task continuation, not a general autonomous chat agent.

## Storage And HTTP

Add `task_turns` with id,task_id,request_id unique,content,created_at,state
(saved/prepared/applied),candidate nullable JSON,run_id nullable.
Content1..8000 Unicode codepoints, trimmed/nonblank, valid UTF-8.
Request_id is a strict8..100 ASCII token; the exact create candidate is idempotent,
same ID/different Task/content conflicts. No message edit/delete in this slice.

Explicit Bootstrap `task_conversation: true`. Auth/CSRF use existing middleware.
Endpoints below have strict parameters/bodies and no hidden Provider work:

- GET `/api/tasks/{id}/turns?page=1`: fixed20, newest-created/source order; exact
  envelope schema_version1,unit task_turns,task_id,items,prepared,total,requested_page,page,
  page_size20,total_pages,has_more,order `"turns-created-v1"`.
  prepared is null or the one prepared TaskTurn, independently hydrated outside
  the current page in the same read snapshot; at most21 DTOs, no N+1 HTTP.
- POST same path `{request_id,content}` saves only.
- GET `/api/tasks/{id}/turns/requests/{request_id}`: exact create receipt or404.
- GET `/api/tasks/{id}/turns/{turn_id}`: exact current turn receipt.
- POST `.../{turn_id}/preview`: explicit file snapshot with selected message.
- POST `.../{turn_id}/prepare`: RunCreate resource fields plus context_hash,
  excluding consent/request_id. Registers exact immutable candidate without
  execution. Refresh files and verify hash; validate models and existing key
  availability rules. Repeated exact preparation returns same candidate;
  changed candidate conflicts. One prepared turn per Task; another preparation
  and ordinary Run creation/recovery cannot bypass it.
- POST `.../{turn_id}/execute` `{candidate_hash,consent:true}` atomically queues
  exactly one Run with request_id=turn.request_id and links it, marking applied.
  No model request in this HTTP transaction; existing Worker executes queued Run.
  Applied repeats return the same receipt; mismatched candidate conflicts.

Turn public DTO exact:
`{id,task_id,request_id,content,created_at,state,run_id,candidate}`.
candidate is null or `{candidate_hash,config,snapshot}`. config contains only
the existing three model bindings,max_calls,parallel,minutes,max_output_tokens.
snapshot is the existing explicit Snapshot plus `supplement` (id/content) and
access/tools fields; never expose stored model keys/credentials.
The prepared stored snapshot fixes the original goal/acceptance/notes/file text
and message. Hash includes message identity/content. Goal presented to the
Harness includes original goal plus clearly labeled selected supplemental text.

Create/prepare/execute are transactional with events and exact duplicate checks;
GET pages/receipts use read-only snapshots and close connections. Verify active
Task Run rules. Prepared state is a durable unresolved candidate: no abandoning/
replacing/bypassing with another request ID. It remains visible after reload.
Execute response loss is reconciled by GET on that exact turn, not inferred from
a child Run or Task status. Applied means queued/linked, not model success/cost.

## Client And UI

Project wrappers/Astryx, one Task tree and zh/en. Add taskTab conversation to
strict URL helper. A bounded message timeline shows exact saved/prepared/applied
state and linked Run. Do not fabricate an assistant response from run success;
link to real Agent/artifact views.

Composer local draft is separate from saved messages and execution consent.
Protect dirty navigation through the shared guard, never localStorage.
Save has a stable request ID; on response loss lock editing/sending and offer
GET receipt reconciliation for that ID. Explicit404 permits retrying the same
immutable candidate/ID; no automatic POST retry.

Selecting a saved message explicitly previews context then reuses existing
resource wizard. Final consent first registers preparation, then executes the
exact returned candidate. After preparation resources/snapshot are locked.
If prepare/execute outcome is uncertain, keep the candidate and reconcile by
GET only; never auto-execute on reconcile. Prepared candidates reopen with
their persisted config/snapshot and fresh unchecked consent, even after reload.
Other Arrange entry is disabled while a prepared turn exists; backend enforces it.

New linked Run stays in the Task Agent view. GET refresh/read errors do not
become zero/empty, advertised failures do not fall back. Standard15s read abort,
stale identity protection, ready-only polling,401 cleanup. Mutations have
independent locks/receipts, no generic read retry. Main-service activation only
after idle/backup checks and original-record comparison; no automatic real model.

## Scope And Evidence

No workflow editor, new execution permissions, remote device controls, connectors,
real Provider tests, credential access or dependency upgrades. Earlier messages
are not implicit LLM memory. Bounded transcript and exact next-Run linkage are
the delivered slice. Original119 ledger unchanged.

## Verification And Activation

1813 frontend tests,1055 Python tests,typecheck and production build passed.
Final production browser:24 synthetic checks,5 actual SQLite/FakeProvider checks,
58 existing workbench checks; primary5173/4180 GET-only desktop/mobile6 checks.
91 final fixture PNGs, no final pageerrors; failures and script timing corrections
are preserved in `frontend/evidence/task-conversation-2026-11-21/README.md`.

Primary4180 was idle and identity-bound, backed up consistently and rehearsed
through Store on a private copy. Original table/column row digests were unchanged
before/after migration, restart and primary browser reads. New PID234937 advertises
task_conversation; original1Project/1Task/6Runs remain,task_turns starts empty.
No real Provider requests, model tests, credential-store reads or external deployment.

Reload save404 without original in-memory content retains the same unresolved
request marker; it does not prove an in-flight save terminated. This slice has
no abandon/replace protocol for prepared turns and no fabricated reset receipt.
Those recovery limitations remain explicit follow-up work.
