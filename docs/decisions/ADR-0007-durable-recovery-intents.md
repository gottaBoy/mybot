# ADR-0007: Durable Recovery Intents And Receipts

- Date: 2026-11-15
- Status: Implemented; local FakeProvider integration verified, not enabled on existing port 4180
- Scope: existing single-user, read-only LocalSuperagentHarness

## Context

An idempotent retry API is insufficient when the browser loses its request ID on
reload. Discovering a new child Run or a changed source status is not an exact
receipt. Resume also needs an atomic checkpoint check and command identity.

## Decision

Use a server-persisted intent before granting execution:

1. `POST /runs/{source}/recovery-intents` registers a request ID, operation,
   source fingerprint and resource candidate as `prepared`. No Run is queued,
   no model is called and no execution consent is implied.
2. Explicit execution consent calls the intent's `/execute` endpoint.
   One transaction validates the checkpoint and current model definitions,
   applies queue/resume control and saves an `applied` receipt.
3. GET list and exact-ID routes reconcile the original request across reloads.
   `applied` means control applied, not model success or settled usage/cost.
4. A prepared intent may be explicitly abandoned. Only one unresolved
   `prepared/applying/unknown` intent is allowed per source. Legacy retry/resume
   cannot bypass that lock. Pause/cancel remain independent controls.

The candidate includes model IDs, resources, source snapshot and hashes of model
kind/endpoint/model/key-variable-name. Credentials and source text are not copied
into intent records. Changed dependencies invalidate execution rather than
silently selecting another endpoint.

## State And Failure Semantics

```text
prepared -> applying -> applied | rejected | unknown
prepared -> abandoned
```

`applying` is durably claimed before atomic application. A savepoint prevents a
partial Run insertion/control from surviving a failed application. Restarted
`applying` becomes `unknown`, without automatic replay. Late completion cannot
overwrite a terminal receipt. Unknown intents remain locked pending investigation;
they cannot be abandoned or given a new request ID to bypass the uncertainty.

Repeated execution of the same ID returns its original state. A lost registration
for candidate B must query B, not an earlier abandoned candidate A. A later
legitimate recovery uses a fresh candidate, current checkpoint and fresh consent,
not a replay of an old applied command.

Resume is limited to a paused source with no child, successful prior calls and
sufficient original budget. Original unspecified timeout remains unspecified.
Existing execution records are preserved; new recovery audit events may append.

## Limits And Verification

- One local worker and SQLite transactions, not distributed exactly-once delivery.
- GET history returns the latest 50 with explicit total/truncation metadata.
- Existing schema creation is not a formal database migration system.
- No new shell, code-writing, deployment, tool or external-account authority.
- API failure, model execution failure and post-application UI failure are separate.
- Verify with FakeProvider, response-loss injection, stable-ID reloads, source and
  model changes, concurrency, restart, legacy-entry rejection and rollback.
- Browser history and product appearance remain independent of this command ledger.

## Evidence

On 2026-11-15, all 306 backend tests passed, including 41 new recovery-intent
tests. The frontend receipt contract has 35 passing tests, including truncated
history contradictions. Nine real-local-API/FakeProvider browser checks passed:
replacement registration loss, execution response loss, exact reload receipt,
duplicate execution, original resume resources and repeated explicit resume.
The full 57-check browser suite also passed the updated durable mock contract.
See `frontend/evidence/ui-closeout-2026-11-15/README.md`.
No real provider, production account, deployment or remote usage reconciliation
was exercised.
