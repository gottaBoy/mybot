# ADR-0036: Bounded Nested Task Plans

- Date: 2026-11-27
- Status: Accepted; verified and locally activated
- Scope: explicit nested decomposition, inherited admission and reviewed integration

ADR-0030/0032 delivered real child Tasks and immutable plan revisions. A member
Task can now own a bounded child plan without changing its original Task row.
This is explicit metadata publication, not automatic AI decomposition,
cross-level dependency editing or an execution scheduler.

## Bounds And Identity

The explicit `nested_task_plans` capability admits the new contract. A current
tree has at most two edges from root to leaf and73 real Tasks including its
root: one root, up to eight children and up to64 grandchildren. Each plan keeps
the existing2-8 item limit, sibling-only acyclic dependency keys, explicit file
subset and immutable version limits. A grandchild cannot own another plan.
Historical retired Tasks are not part of this current-tree denominator.

Membership remains historical. Current membership must hold through every
ancestor, in the same Project, without cycles or inconsistent bindings.
Replacing or removing a container retires its entire current subtree for new
execution. Old Task rows, Run contexts, reports, operation receipts and plan
versions remain readable. Supplemental messages do not execute work.
An unchanged container retains its child plan. A replacement Task does not
inherit or resurrect the old container's child plan or Task IDs.

The first nested publication records a permanent root marker. Current reads for
that marked tree use schema3 even after later revisions remove its nested
branch. Flat trees without that marker retain exact schema1/2 behavior.
Old immutable create/revision receipts and historical version representations
are not rewritten or upgraded.

## Admission And Completion

Treat execution admission and completed prerequisite evidence separately.
A child inherits the currentness and sibling prerequisite conditions along
its complete ancestor path. It does not inherit an ancestor's requirement
that the ancestor's own children finish first. Otherwise a container would
wait for its children while those children wait for the container.

A leaf prerequisite keeps the existing latest-successful-Run and reviewed
report criterion. A container prerequisite adds children-first integration:

1. All current direct children must satisfy their own completion criterion.
2. The container may then start its own explicit integration Run. Admission
   records `own_plan.completion_scope_hash` for the exact current child evidence
   and immutable own-plan head.
3. The latest integration Run must succeed and its reports receive explicit
   human acceptance under the existing report criterion.
4. That Run's recorded completion scope must still match the current scope
   before an upper-level dependent can use the container as accepted evidence.

This applies recursively within the depth bound. A former accepted container
Run created before nesting cannot certify the new child plan. A new child Run,
changed report acceptance or child-plan revision can change the completion
scope. While that current scope differs from the recorded one, a new integration
Run and human acceptance are required; the old Run/report remains unchanged.
Scope comparison uses current evidence, not a permanent withdrawal journal.
Restoring the exact same accepted child evidence restores the same scope.
A reordered outer plan that reuses an unchanged container does not itself
invent a new child completion scope.

These facts are completion evidence for prerequisites, not a new persisted
Task-completed status. No Task status or Run is automatically advanced.
Preparing a container is blocked while its children are incomplete. Ordinary
research, TaskTurn, coding, recovery, resume, worker claim and paired-device
grant consumption must all consult the same current gate. Fresh checks do not
rewrite queued context; claim/resume evidence is recorded separately.
An old integration Run cannot resume or reuse successful outputs under a
different child completion scope. A scope change requires a fresh integration
Run rather than relabeling copied outputs or accepted report decisions with
the new scope.

No child report body, descendant code or earlier conversation is implicitly
added to model input. Nested planning does not read project files, call a model,
start a Run, accept an Artifact or grant execution consent.

Keep the existing direct-dependency meaning. With root siblings `X -> A -> B`,
withdrawing `X` after a current `A` integration has been accepted blocks future
execution of `A` and its descendants. It does not automatically withdraw the
historically accepted `A` report or add `X` as a prerequisite of `B`.
`B` must explicitly depend on `X` if both reports are required. This differs
from a changed child completion scope, which makes `A` integration stale and
therefore immediately blocks `B` until a fresh integration is accepted.

## Publication, CAS And Unknown Outcomes

Nested creation and revision require the entire current root tree to be idle.
Authoritative blockers include unfinished Runs, prepared TaskTurn/coding,
unresolved recovery and unconsumed active device execution grants. This also
covers unchanged siblings whose admission may change when a child plan changes.
Publication never silently cancels an active operation or model request.

A preview binds the target Task snapshot, definition, ancestor lineage,
current tree plan heads, tree size, descendant retirement impact, all current
blockers and the applicable plan baseline. Publication recomputes these facts
inside the same immediate transaction and requires the exact preview hash.
Revision additionally requires its existing expected version and plan hash.
Concurrent nested/ancestor edits cannot publish against different tree heads;
a conflict preserves the editor candidate for explicit reinspection.

Original request IDs and immutable operation receipts remain authoritative.
Exact same-input replay returns the original receipt before fresh CAS or
blocker checks. Response loss retains `taskPlanRequest` and uses GET-only
reconciliation of that original operation. A404 does not prove that an
in-flight POST terminated and does not authorize a replacement ID or retry.

## Prepared Candidate Discard

Child evidence can change after a TaskTurn has been prepared, making its exact
completion scope stale while the prepared marker still blocks a replacement.
The explicit `task_turn_discard` capability adds only an owner-confirmed
transition for a known prepared TaskTurn. POST
`/api/tasks/{task}/turns/{turn}/discard` requires its exact `candidate_hash`
and explicit consent. It starts no Run, reads no files and makes no model call.

The immutable message, candidate, request ID and original evidence remain
available. Two nullable additive columns, `discarded_at` and
`discarded_candidate`, retain the transition and the exact original candidate.
Discard atomically archives that candidate, clears the old candidate column
and records `saved`, satisfying the existing state/candidate CHECK.
Public state is `discarded`, and its public candidate is the exact archived
candidate. Same-input preparation replay can return this terminal state;
it cannot prepare or execute the Turn again. Preview and execution reject
discarded Turns, and an applied Turn cannot be discarded.
The change does not normalize historical rows or rewrite old receipts.
An unconsumed grant for a discarded Turn is no longer executable or presented
as current authorization.

Unknown preparation/execution outcomes must first reconcile the original
TaskTurn by GET. A timeout or404 is not permission to discard or abandon an
in-flight write. Discard and execution share the existing immediate transaction:
one legal transition wins and the other observes the confirmed state.
An uncertain discard result likewise reconciles the same Turn rather than
inventing a replacement identity. This is not a generic abandon operation for
unknown recovery, coding or device requests.

## Current Read And UI

Schema3 distinguishes immediate parent and own plan in the same Task view.
It identifies the root, depth, inherited external scopes, current/retired
membership, own-plan child completion, integration scope and overall execution
readiness. Current evidence and immutable history remain separate.
External prerequisite failure, child completion pending, integration stale,
review pending and retired membership must not be shown as successful work.

The existing project-owned Astryx surfaces provide parent navigation, the own
plan editor, dependency feedback and report review. They must preserve dirty
drafts through refresh and appearance changes, keep query/history state
independent and reject schema3 without its explicit capability.
The depth and current-tree limits are enforced at the API boundary as well as
in the presented controls. No page clone, automatic Run chain or paid call is
introduced by the nested presentation.

## Verification Plan

Use a disposable tree with root siblings `X -> A -> B`, and `A1 -> A2`
inside `A`. Before `X` is accepted, `A1` must be blocked despite having no local
prerequisite. Successful unreviewed `A1` must block `A2`; accepted `A1` admits
`A2`. Successful unreviewed children block container integration. Accepted
children admit an explicit fresh `A` integration Run; accepted integration
then admits `B`. Withdrawal/new child evidence must invalidate the appropriate
future admission while preserving earlier Run contexts and accepted reports.

Final verification:1565 Python tests with required Pi runtime,2526 frontend
tests across87 files, TypeScript and production build passed.82 structural
regressions,17 prepared-discard checks and112 focused execution/device/recovery
checks passed;311 affected query/saved-view regressions passed after resolving
a helper-name collision. Browser:9 nested/6 discard/58 general/8 primary
GET-only checks,81 final fixture PNG. The real fixture used6 Tasks,5 Runs and20
FakeProvider calls; model text is fixture data, while HTTP/SQLite/worker gates
and report decisions are actual behavior. Primary original records remain
unchanged after activation and read-only verification.
[Delivery evidence](../../frontend/evidence/nested-plans-2026-11-27/README.md).

Verify depth/cardinality rejection, current/retired ancestor paths, replacement
of a container and its descendants, all whole-tree blockers, sibling reuse,
CAS races, scope changes before worker claim/resume, malformed metadata and
exact old/new operation replay. Include coding, TaskTurn and device paths
without broadening their existing consent, file or execution capabilities.
Missing nested markers, incomplete definition/binding mappings, inconsistent
membership ownership and corrupt current-tree bounds must fail closed rather
than downgrade to the flat contract or remove a prerequisite.

The dedicated fixture injects deterministic FakeProvider text only. Browser
actions create actual Tasks/plans, execute actual application Runs and make
explicit human report decisions through HTTP and SQLite. Its status endpoint
is read-only; it cannot seed plan state or accept reports. Initial fixture
materialization touches only a fresh private temporary workspace, and its
source hashes must remain unchanged during acceptance. No primary database,
original repository source write or real paid provider call belongs to this
verification.

Pending: final automated results, browser evidence, independent review and any
explicit local activation are recorded by the integration owner after checks.
Source implementation, isolated acceptance and primary activation are separate
facts. Existing119/9/110 delivery-ledger counts remain unchanged.
