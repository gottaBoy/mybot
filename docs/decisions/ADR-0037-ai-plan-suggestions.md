# ADR-0037: AI Plan Suggestions With Human Publication

- Date: 2026-11-28
- Status: Accepted; implementation and focused verification complete
- Scope: one-call plan suggestions for the existing bounded Task plan editor

## Decision

AI decomposition is an explicit, bounded suggestion flow. The user selects one
configured model, an optional subset of the Task's explicit files, an output
limit and a call timeout. Preview and preparation freeze the Task snapshot,
selected file contents, model identity and current plan scope. Preparation makes
no model call and creates no Run.

Execution requires a second explicit consent and creates exactly one
`plan-suggestion-v1` Run with one Planning Agent and one provider Call. The
provider must return strict JSON containing only a summary and the existing
2–8 item `PlanDefinition`. Server validation enforces the same key, DAG, text
size and file-scope rules as manual plan publication. Invalid or unknown
outcomes remain visible under the original request ID and are never retried
with a replacement ID.

The result is a `plan_suggestion` Artifact with source, model, budget,
candidate and content hashes. It is not a report, cannot receive a report
decision, cannot satisfy a prerequisite and is excluded from Task latest-run,
Task status/count and dependency projections. Full Run detail retains the
separate Run for audit, while ordinary Task projections continue to describe
real execution Runs.

“Use as plan draft” copies the validated definition into the existing
`TaskPlanEditor` local draft. The user must still edit or accept the candidate,
run the normal plan preview, pass the existing CAS/structure checks and
explicitly publish. No Task, child Task, plan version or normal completion
evidence is created by AI suggestion execution.

## Persistence and recovery

`plan_suggestion_jobs` is an additive table with exact request ID, candidate
and input hashes, frozen candidate, state, Run and Artifact references. States
are `prepared`, `applying`, `applied`, `discarded`, `unknown` and `rejected`.
Prepared and unknown jobs participate in structural locks. Process recovery
marks an interrupted applying job `unknown`. GET of the original request is
the only reconciliation path; 404 does not authorize a new POST.

The Run schema has an additive `run_kind` (`execution` or `plan_suggestion`)
with legacy rows defaulting to `execution`. Existing execution evidence,
reports, plan versions and Task data are not rewritten.

## Verification

Focused tests cover strict configuration and file scope, read-only preview,
request replay and candidate identity, preparation/discard locks, frozen
source contents, one-call strict output, artifact provenance, no Task creation,
and execution/report projection separation. Frontend typecheck covers the
lazy dialog, URL request marker, unknown reconciliation and draft import path.
Fixture/model responses remain deterministic test data; no paid provider call or
automatic publication is evidence of product completion.
