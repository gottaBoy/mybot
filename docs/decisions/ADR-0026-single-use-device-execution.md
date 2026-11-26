# ADR-0026: Single-Use Execution Delegation To A Paired Device

- Date: 2026-11-25, America/New_York
- Status: Accepted; bounded delegation verified and locally activated
- Product: D3b exact prepared-next-Run delegation

An owner may delegate one already prepared immutable TaskTurn candidate to one
active paired device for at most ten minutes. Pairing scopes remain exactly
task_read/message_save. A separate grant is an exact-object authorization, not
general Run control, model/file/config access, or a reusable execution lease.

Owner confirms the Device/Task/Turn/candidate hash and fixed model/resource/source
summary. Granting reads only the persisted candidate and never previews files,
creates a Run or calls a provider. The paired device reads that summary and must
independently confirm execution. The summary omits source bodies, paths,
credentials, endpoints and key environment names. It discloses model names,
identifiers, kinds, resource limits, source counts/bytes, context hash, workflow
version and the exact selected message. Owner prepares with the existing resource
wizard; selected TaskTurn messages remain the only supplemental input.

Creation and revocation use stable request IDs, canonical command hashes and
immutable operation receipts. Grant creation binds Device revision and exact
TaskTurn/candidate identity. At most one live unused grant per Device or Turn.
Expiry is bounded by both ten minutes and Device expiry. Revocation prevents
future execution; it does not cancel a Run already queued.

Execution checks active Device cookie and X-Workbench-Device-Id, grant recipient,
expiry/revocation, exact prepared candidate, model configuration and existing
Task execution conflicts inside the same BEGIN IMMEDIATE transaction that
queues the Run, applies the TaskTurn and consumes the grant. Reuse after success
returns the same grant/Run. Owner and device races can create only one Run for
that TaskTurn. Owner execution first marks an unused grant superseded on read;
it must not be presented as a device execution receipt.

Grant states are authorized/applied/revoked/expired/superseded. Applied is durable
and means queued once, not provider success or known settled cost. Audit events
name device/grant/Task/Turn and use the device actor for delegated queue events.
Device revocation blocks grant reads and future execution. Owner retains receipts.

Owner management lives in the existing device directory. Paired controls appear
only with explicit execution_delegation capability, use the existing Astryx
wrappers/tokens and never mount owner Bootstrap. Unknown create/revoke reconciles
the original operation GET; unknown execute preserves the exact grant ID in the
managed URL and blocks replacement/navigation. After reload, GET-only checking
does not reissue POST or infer completion from a latest Run. A pending GET404
does not prove that an in-flight write terminated. Context-changing refresh and
expiry invalidate consent; theme or navigation never creates an execution authorization.

Two new additive tables store grants and grant operation receipts; original
TaskTurn/Run tables retain their schema. Extract a shared transaction-level
TaskTurn execution helper rather than duplicate execution checks. Verify
isolation, races, expiry, revoke, exact receipts, restart/unknown outcomes and
desktop/mobile UI with only FakeProvider fixtures. Local activation follows
backup/rehearsal/original-row checks separately.

Not included: general pause/cancel/recovery/artifact decisions, remote process
migration, team identities, cross-device draft migration, paid acceptance runs,
trusted HTTPS setup or physical-device certification. Original119/9/110 ledger
counts remain unchanged.

## API And Evidence

- Owner GET `/api/devices/{device_id}/execution`: exact Device, persisted prepared
  summary and latest grant for that Device. No file preview or provider call.
- Owner POST `/api/devices/{device_id}/execution-grants`: request_id,turn_id,
  candidate_hash,expected_device_revision:1,consent:true.
- Owner POST `/api/devices/{device_id}/execution-grants/{grant_id}/revoke`:
  request_id,expected_revision:1,consent:true.
- Owner GET `/api/devices/{device_id}/execution-operations/{request_id}`:
  exact immutable operation receipt, not a fresh resource observation.
- Device GET `/api/device/execution-grants` or `/{grant_id}`: current or exact
  single grant envelope bound to Device/Task. Both require Device identity header.
- Device POST `/api/device/execution-grants/{grant_id}/execute`:
  candidate_hash,consent:true; the grant ID is the durable execution identity.

Bootstrap advertises device_execution_delegation; paired Task advertises
execution_delegation. Missing/false does not display controls or infer a grant.
Malformed/duplicate pending URL fields fail closed and cannot mix message,
pairing and execution pending operations.

2147 frontend tests/72files,1208 Python tests and typecheck/production build passed.
Includes48 new frontend and17 new backend cases; existing httpx/chunk warnings remain.
Frontend contract/view tests, backend authorization/race/restart tests and a
production browser fixture cover the exact delegation. The actual resource
wizard's prepare-only path was tested with no Run, then two independent browser
contexts completed one FakeProvider Run. Lost grant and execute responses were
reconciled after reload without repeated POST. UI revoke prevents a stale device
confirmation. Source bodies/paths/model credentials remain absent from summary.
The selected Codex settings retain their known single-channel/token-ceiling limits.

Nine scoped production checks/12 screenshots,58 existing workbench checks/61
screenshots and8 primary GET-only checks passed. Both surfaces use
Neutral/Zira/Y2K light desktop English and dark390Chinese. No final pageerrors
or external HTTP. These are Chrome viewport checks, not physical-device or
Safari acceptance. Exact final unit/build output is archived with the evidence.

Idle primary4180 was consistently backed up, rehearsed with Store on a private
copy and compared by original columns/row digests, then gracefully replaced from
PID1303596 to425660 with the same command/cwd/inherited environment. Original rows
match again after browser verification; both new tables remain empty. Primary5173
is available. No primary pairing/message/grant/model execution was performed.
Private backup: `.runtime/backups/before-devices-20261125T121621Z/`.
Evidence: `frontend/evidence/device-execution-2026-11-25/README.md`.
