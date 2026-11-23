# ADR-0024: Task-Scoped Paired Device Continuation

- Date: 2026-11-23, Asia/Singapore
- Status: Accepted; scoped first slice verified and locally activated
- Product: D1/D2 and bounded D3/D4/D5 first slice

## Authority And Scope

One existing workspace owner authorizes each paired browser for one exact Task.
This is not a human identity/membership directory or a remote execution node.
Fixed scopes `["task_read","message_save"]`: read that Task's goal/acceptance,
bounded messages/latest Run/report, and save immutable supplemental requirements.
No general Bootstrap, project/model/file/config reads, model calls, preview,
Run creation/control/recovery, workflow writes or artifact decisions.
Semantic execution stays on the existing owner-authorized workbench.
No GUI/PTY input or lease is introduced, so do not claim exclusive control.

Existing local-owner and token authentication remains. A present device cookie,
valid or invalid/revoked, never falls back to local loopback owner or owner cookie.
Owner token login explicitly clears device cookie. Public pair/session routes do
not bypass Host/origin/CSRF/body limits or existing remote token-mode prerequisite.
Remote production needs an explicitly configured trusted HTTPS deployment;
this slice does not expose ports or configure TLS, Headscale or a tunnel.

## Pairing And Credentials

Owner explicitly chooses Task and device invitation label, then confirms grant.
Browser generates32 random bytes base64url secret; owner sends once:
POST `/api/devices/pairings`
`{request_id,task_id,label,pair_secret,consent:true}`.
Pairing ID=request_id, one-use,600-second expiry. Only SHA256(secret) is stored.
Owner displays a combined `pairing_id.pair_secret` code in memory with explicit
copy command. Never put it in URL/storage/logs/operations/events/screenshots.
UI can show generic `#pair` URL separately; no secret embedded in links.

Companion `#pair` enters code and device_name. It generates its own32-byte
device_secret in memory and POSTs `/api/device/claim`
`{request_id,pairing_id,pair_secret,device_name,device_secret}`.
One transaction consumes invitation, persists Device and an exact claim identity,
returns Device DTO and sets `workbench_device=device_secret` HttpOnly SameSiteStrict,
Secure follows current deployment. Only token hash in DB, lifetime30days.
Exact claim retry with original command reissues that same cookie; different
candidate/ID cannot claim the consumed invitation. Rate-limit invalid claims.
Never return device_secret in JSON or store it in JS preference/session storage.

Lost claim response: query GET `/api/device/session`; match claim_request_id and
pairing_id before accepting. If cookie absent, user may explicitly retry identical
in-memory command; no automatic POST. After reload without original secrets, a
consumed pairing cannot be silently replaced. Owner revokes/reissues if necessary.
DELETE-like local leave is explicit POST `/api/device/logout` `{}`; it clears cookie
but does not claim server revocation or undo previously saved messages.

Device DTO exact:
`{id,name,task_id,pairing_id,claim_request_id,scopes,created_at,expires_at,
revoked_at,revision}`. scopes fixed above; revision1, revoke→2. No online indicator.
Session envelope `{schema_version:1,device:Device|null}`; unavailable/expired/revoked
session returns null. Reads never update heartbeat/presence or business events.

Pairing DTO exact:
`{id,task_id,label,created_at,expires_at,state,device_id}` with state
`available|claimed|expired`, derived on read; device_id nullable.

## Owner Management And Receipts

GET `/api/devices?page=1`: exact bounded20 envelope
`{schema_version:1,unit:"devices",items,total,requested_page,page,page_size:20,
total_pages,has_more}`; stable newest order, includes revoked records.
GET `/api/devices/pairings/{id}` reads current pairing.
POST `/api/devices/{id}/revoke`
`{request_id,expected_revision,consent:true}` atomically revokes future reads/writes.
Prior saved requirements remain; it does not cancel in-flight models/undo effects.
GET `/api/devices/operations/{request_id}` exact receipt.
Save pairing/revoke receipts:
`{request_id,kind:"pair"|"revoke",candidate_hash,state:"applied",result}`.
Hash=SHA256(canonical command including kind, with pair_secret replaced by its
SHA256 hex); exact retry returns original receipt, conflicting request ID409.
No secrets in receipt. Pair creation receipt after reload cannot recover raw code;
create a new invitation deliberately if it is lost, never display invented code.
Unknown management commands lock original candidate and use GET receipt only.
Missing receipt permits explicit same-command/ID retry only while original candidate
remains in memory. Reload404 retains unresolved marker without a new request.

New tables contain pairings/devices/device_operations/device_messages; no existing
business row/column backfill. Claim expiry and revoke checks for scoped message save
must share its write transaction, not be a stale middleware lease.

## Scoped Task Snapshot, Events And Messages

GET `/api/device/task`: same readonly snapshot validates session and returns:
`{schema_version:1,device_id,task:{id,title,goal,acceptance},latest_run:RunRef|null,
messages:{items:Message[],total},report:Report|null,cursor}`.
RunRef exact `{id,task_id,status,created_at}`.
Message exact `{id,request_id,content,created_at,state,run_id}`; latest20, true total,
no candidate/models/file snapshot. It is bounded newest messages, not whole history.
Report exact `{id,run_id,title,content,decision,truncated}`; latest report on latest
Run only, content at most20000 codepoints and explicit truncation.
No project notes/file text/model endpoints/credentials in paired DTOs.

GET `/api/device/events?after=<nonnegative safeinteger>` returns same Task-filtered
snapshot envelope `{schema_version:1,device_id,task_id,after,items,next_cursor,
watermark,has_more}`. At most50 events ordered by seq; item exact
`{seq,id,run_id,kind,created_at}` (no payload). Filter by joined Run.task_id,
Task entity ID or exact event.payload.task_id. Watermark is highest matching seq.
after>watermark rejects409; client rebuilds snapshot by GET, not executing anything.
next_cursor=last returned seq when more, otherwise watermark. Never expose other
Task events, full global sequence feed, payload or fake progress.

POST `/api/device/messages` `{request_id,content}`:
validate active session/grant/Task inside same write transaction and use existing
immutable TaskTurn save semantics. Device→message mapping binds receipt ownership;
another device's request ID conflicts. Return exact Message, no candidate.
GET `/api/device/messages/requests/{request_id}` returns its exact saved Message or404.
Both message POST and receipt GET require `X-Workbench-Device-Id` with the device
the user is currently viewing. Compare it to the cookie's active Device inside
the transaction/read snapshot; mismatch409 `device_identity_changed`.
Another same-origin tab can replace a cookie, but must not route an old Task draft
into a newly paired Task. Client clears old private context and rereads identity,
without carrying/replaying that draft into the replacement scope.
Saving never previews files, creates a Run or calls Provider. Owner sees the same
persisted Task conversation. Unknown send preserves sameID/text,15s timeout;
GET-only reconcile, no automatic retry.401 clears private projections and actions.

## UI And Delivery

Astryx one component tree/multiple styles/zh-en. Owner `#devices`: explicit Task
candidate via entered Task ID or launch from Task, grant confirmation, in-memory code,
bounded devices with scoped Task/revocation and exact receipt recovery.
App `#pair` bypasses owner Bootstrap and loads a dedicated PairPortal:
code/name form or authenticated scoped Task view, real report/latest status and
supplement composer. Pair session never renders owner controls or fake devices.
Explicit refresh and incremental event polling show failure/stale vs revoked;
reconnect queries snapshot/receipt only. Local drafts protected by shared guard,
never sent by navigation/theme/poll. No business content in preference storage.

D1/D2 delivered only after exact identities/revoke/duplicate/expiry/rate tests.
D3 first slice is enforced observer+message boundary, not execution control.
D4 bounded cursor and receipt restore, not migrating processes/workspaces.
D5 use two isolated authenticated browser contexts (desktop/mobile) and real
SQLite/FakeProvider fixtures; no real model or primary mutation for testing.
Remote HTTPS and physical devices remain separate deployment/acceptance work.
Local activation uses idle/consistent backup/rehearsal/original-row comparison.
Original119/9/110 ledger stays unchanged. Record source and tested evidence separately.

## Verification

2052 frontend tests/68files,1178 Python tests,typecheck/productionbuild passed.
13 scoped-device production checks,58 existing workbench checks and6 primary
GET-only checks passed;76 finalfixturePNG,12 style/mode/surface combinations with
no document overflow, finalpageerrors/externalHTTP0.
Actual two-browser test lost pair creation/claim/message/revoke responses after
commit and reconciled original receipts without repeat POST. Scope denial,
FakeProvider Run/report observation, manual GET reconnect and revoke cleanup pass.
DB/cookie/time/atomicity/cross-tab identity tests remain distinct from browser evidence.

Primary4180 idle/consistentbackup/private Store rehearsal/original-row comparison
preceded activation PID1104938. Old business rows remain unchanged after browser,
all4 device tables empty. No primary pairing/message/Run or realProvider call.
Evidence: `frontend/evidence/devices-2026-11-23/README.md`.

D3 delegated execution/control,D4 broader workspace continuity andD5 remoteHTTPS/
physical-device acceptance remain open. Local trust is still localhost-owner;
clearing a device cookie locally does not establish multi-user isolation.
