# ADR-0027: Isolated Code Changes And Real Test Evidence

- Date: 2026-11-25, America/New_York
- Status: Accepted; first bounded coding loop verified and locally activated
- Authorization: user accepted isolated code changes and explicitly allowed tests

Prioritize a usable implementation/validation loop over further device surfaces.
Retain the existing research path and its permissions. Add an owner-only Task
action for a bounded coding Run, with immutable source/model/test configuration,
explicit preparation and execution consent, persistent exact request identity,
real subprocess test evidence and downloadable Diff. No original-workspace write,
commit, merge, installation, deployment, unrestricted shell or device delegation.

The first test profile is Python unittest with explicit immutable test files.
Source files come from the Task's explicitly selected files. Editable paths must
be an explicit non-test subset; no discovery, symlinks, hidden files or secrets.
Model output is strict structured JSON containing complete replacement contents
for admitted editable paths. A trusted writer applies it only to a fresh private
snapshot copy. Mybot adds no model command tool; the existing Codex adapter's
underlying tool-ceiling limitations remain separately unverified. The host runs the fixed
test profile, captures bounded output/exit status/test count, and may feed failure
evidence back for up to three consented model calls. Invalid output, unknown model
outcomes or sandbox failure stop instead of automatically replaying a call.

The local namespace sandbox probe failed in this environment. Use Linux Landlock
and libseccomp only after real positive/negative confinement probes pass:
read-only Python runtime and selected snapshot; no host-project/credential reads,
networking, external process creation or host metadata writes. Resource limits,
clean environment, finite output/wall time and process-group cleanup apply.
Tests cannot mutate the immutable source or tests. Fail closed on unsupported
kernel/library/platform; no unrestricted fallback. This is a constrained local
process runner, not a VM or proof against all kernel/side-channel attacks.

Reuse Run/Agent/Call/Artifact/Event authority and the existing provider adapters.
Code generation remains text-only even for Codex; its read-only adapter is not
silently upgraded. Coding Runs have separate lifecycle capabilities and cannot
enter research retry/resume or consume task/device execution grants. Cancel is
supported; interrupted execution needs an explicit new attempt after cancellation.
Prepared coding candidates block conflicting Task execution until executed or
explicitly discarded. Unknown prepare/execute retains the original ID and uses
GET reconciliation, never an automatic second POST.

Artifacts distinguish proposed patch, each actual test attempt, final report,
provider outcome and human acceptance. A real failing baseline, changed code and
passing immutable tests must be demonstrated. Tests with zero discovered cases,
missing result receipts, timeout or nonzero exit cannot count as passing. A report
or accepted artifact never means original code was applied or committed.

Validate with real isolated Python execution and deterministic injected providers;
no real paid provider is auto-started for acceptance. Record that limitation.
Primary activation is separate and uses consistent backup/private migration
rehearsal/original-row checks. Existing119/9/110 counts remain historical.

## Delivered API And UI

Owner-only Task routes: POST `/coding/preview`, POST `/coding/prepare`,
GET `/coding` for the independently hydrated prepared candidate, GET
`/coding/{request_id}` for the exact receipt, POST `/{request_id}/execute`
and `/discard`. Config binds model_id,writable,tests,max_rounds,test_timeout,
max_output_tokens; prepare adds request_id and preview_hash; execute/discard
bind candidate_hash and explicit consent. Query parameters/unknown fields fail.
API capability isolated_coding is explicit; runtime readiness is verified by the
confinement probe, never inferred from the API flag or installed binaries.

Task's Implement & validate opens one project-owned Astryx dialog. Context/model/
files/limits are reviewed before prepare/execute. Prepared candidates can be
closed and reopened without losing their immutable snapshot; unknown requests
cannot be replaced or discarded. An unchanged form closes without extra consent.
Managed codingRequest and taskSend markers are mutually exclusive. Advertised
prepared-read failure blocks conflicting ordinary execution.

Run view uses actual coding stages and memberships, actual test state, raw Diff
and validated test JSON. It exports .patch/.json artifacts; research controls
cannot pause/resume/retry coding Runs. Human acceptance remains separate from
applying a patch. Existing read-only research and device grants retain their scope.

2197 frontend tests/75files,1229 Python tests,21 focused coding tests and
typecheck/production build passed. The final focused run also checks chronological
stage identity and actual subprocess argv. Existing httpx/chunk warnings remain.
Production coding acceptance copies mybot schemas.py and dependencies, selects
one writable path and four immutable tests: baseline2 failures, first fix1 failure,
second fix4 passes. Original source/tests remain byte-identical. Exported patch
passes git apply --check without applying it. Prepare/execute response loss uses
the original GET and only one Run/two injected model responses.

Browser evidence, final counts and retained failures:
`frontend/evidence/coding-core-2026-11-25/README.md`. Model generation is injected
for acceptance; file changes, unittest processes, confinement and test results are
real. No paid/Codex acceptance call was auto-started. This first slice covers
explicit files and Python unittest, not arbitrary project runtimes or tests.

Idle primary4180 was consistently backed up and Store-rehearsed on a private
copy, then original columns/rows compared before graceful restart from PID425660
to859094 with the same command/cwd/inherited environment, then aligned to940971
using the same safeguards for explicit module filenames. Main5173 exposes the
entry. Eight GET-only desktop/mobile checks passed and original rows compared
equal afterward; coding_jobs remains empty, no primary model/test execution.
Private backups: `.runtime/backups/before-devices-20261125T150027Z/` and final
`.runtime/backups/before-devices-20261125T152945Z/`.
