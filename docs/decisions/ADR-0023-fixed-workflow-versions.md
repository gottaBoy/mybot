# ADR-0023: Fixed Workflow Drafts, Versions And Run Snapshots

- Date: 2026-11-21, Asia/Singapore
- Status: Accepted; fixed-workflow first slice verified and locally activated on 2026-11-23
- Product work: W1–W5

## Scope

Implement one workspace-owned `local-research` workflow for the existing
read-only LocalSuperagentHarness. Planning/coordinator, Research/researcher and
Synthesis/reviewer are fixed, ordered model stages. Human artifact review is
separate. No arbitrary DAG, executable plugin, shell, deployment or new Provider.

Definition exact schema:

```json
{
  "schema_version": 1,
  "name": "Local research",
  "harness": "local-superagent",
  "stages": [
    {"id":"planning","role":"coordinator","model_id":null,"instructions":""},
    {"id":"research","role":"researcher","model_id":null,"instructions":""},
    {"id":"synthesis","role":"reviewer","model_id":null,"instructions":""}
  ],
  "limits": {
    "max_calls":4,"parallel":2,"minutes":10,"max_output_tokens":1800,
    "research_tasks":2
  },
  "review": "human"
}
```

Strict unknown-key rejection, stage IDs/order/roles and review mode immutable;
name1..80, instructions0..2000 Unicode codepoints; model IDs strict identifiers,
nullable in drafts only. Existing resource ranges plus research_tasks1..2.
Publication requires current configured models and available credentials under
existing rules, not a connection test or permission grant.
Stage input/output contracts are fixed: Task context→research plan,
Task context+plan→research reports, Task context+reports→report artifact.
Custom stage instructions supplement the existing read-only/output contracts.
Research task limit and instructions must affect the actual Harness.

## Persistence And API

Three new tables: workspace draft, immutable versions, immutable mutation receipts.
Initialize only a default draft, no automatic published version or events that
rewrite historical facts. Original tables/columns/rows remain unchanged on migration.

Explicit Bootstrap `workflow_versions: true`. Fixed path
`/api/workflows/local-research`:

- GET root: exact bundle `{schema_version:1,workflow_id,revision,definition,
  definition_hash,updated_at,published}`; published is null or latest Version DTO.
- GET `/versions?page=1`: bounded20 versions, newest first, exact envelope
  `{schema_version:1,workflow_id,items,total,requested_page,page,page_size:20,
  total_pages,has_more}`.
- GET `/versions/{version}`: exact immutable Version DTO.
- POST `/draft`: `{request_id,expected_revision,definition}`; CAS save.
- GET `/impact?revision=...&definition_hash=...`: exact saved candidate validation
  and impact `{workflow_id,revision,definition_hash,impact_hash,model_ids,
  active_runs,historical_runs,published_version}`. Validate models without calls.
  Hash binds draft, dependency identities and the reported impact.
- POST `/publish`: `{request_id,expected_revision,definition_hash,impact_hash,
  consent:true}`; recompute impact within write transaction, reject drift409.
- GET `/operations/{request_id}`: exact mutation receipt or404.

Version DTO: `{workflow_id,version,definition_hash,definition,created_at}`.
Receipt DTO: `{request_id,kind:"save"|"publish",candidate_hash,state:"applied",
result}`; save result is a bundle, publish result is a Version DTO.
Same request ID/exact command returns original receipt, changed input conflicts.
Current resource reads are not exact mutation receipts. Same published content
does not manufacture another content version. No generic mutation retry.
Unknown transport/invalid receipts lock the candidate and offer exact GET only;
explicit missing permits same in-memory command/ID retry, never a new candidate.
URL may retain only unresolved request ID for reload reconciliation.

## Run Binding

Ordinary RunCreate and TaskTurnPrepare accept optional nullable workflow_version,
outside the existing seven resource fields. A selected version is immutable and
must match those resource bindings/limits. Server saves full WorkflowSnapshot:
`{workflow_id:"local-research",version:number|null,definition_hash,definition}`.
Null version is a materialized built-in definition using actual Run resources;
it is not a published version. Every new Run obtains a snapshot. Existing Runs
without a snapshot remain explicitly “not recorded”; do not backfill a claim.

TaskTurn public candidate snapshot may contain optional workflow metadata; strict
clients admit legacy absence and validate new metadata when present. Preparation
hash includes full workflow snapshot. Pending preparation reconciliation binds
requested workflow_version as well as resources/context hash. File context hash
continues to identify the explicit files/Task/supplement; workflow selection is an
additional exact immutable identifier in the execution command.

Normal and Task-message confirmation may select a published version, lock/apply its
models and resources, and require fresh consent after selection. Built-in mode
keeps existing per-Run resource editing. Prepared turns retain their frozen workflow.
Retries/resume retain original workflow snapshot, with existing explicitly
confirmed recovery-resource overrides shown as Run resources, not rewritten defaults.

## Frontend And Delivery

One Astryx-owned `#workflows` page: saved draft/revision, fixed stage diagram and
properties, resource controls, Save, validated publication confirmation and bounded
history. No fake canvas nodes or business actions. Keep local dirty draft separate
from read baseline; refresh/theme/language never overwrite it.409 preserves input,
explicit reload/discard uses shared navigation protection; unknown writes cannot
be bypassed by navigation or new IDs. Hide private state on401/403/404.

Run detail displays actual recorded workflow version/source. Never substitute the
latest version for a historic snapshot. Stage selection and optional history are
local presentation, with one business tree for all styles and locales.

W5 requires contract/unit tests and desktop/mobile production browser checks for
save→validate→publish→explicit Run, conflict, response loss, unknown metadata,
old snapshot preservation and themes. Use isolated FakeProvider only.
Local activation uses fresh identity/idle/consistent backup/rehearsal/original-row
comparison, as previous slices. No credential-store reads or paid model requests.
Original119/9/110 counts stay unchanged. Runtime evidence follows implementation.

## Verification And Local Recovery

Final1958 frontend tests,1132 Python tests,typecheck/build passed.
Production browser21 Workflow checks include older-version paging, ordinary/TaskTurn
execution of selectedv1 after22 publications, exact save/publish receipt recovery,
dirty/global-form protection and three styles/both modes. Existing workbench58
and primaryGET-only6 passed;70 final fixture PNGs, no final pageerrors/externalHTTP.

Review fixed explicitnull snapshot admission, late cancelled responses, publication
definition hashing, selected-version capability loss, save/history race and mobile
hash-column starvation. Source-presence and tested behavior remain separate.

After server restart both primary services were stopped. Idle/worker-lock checks,
consistent stopped backup, private migration rehearsal and original-row digest
comparison preceded restoration of4180 PID3459239 and5173. Original business rows
are unchanged after primary browser checks; new state has only one unbound draft,
no published version or operation. No realProvider/model test or credential-store read.

Evidence and retained test/visual failures:
`frontend/evidence/workflow-versions-2026-11-23/README.md`.
11月22日的8项dev-server检查为历史证据，不代表当前启用或覆盖全部矩阵。
