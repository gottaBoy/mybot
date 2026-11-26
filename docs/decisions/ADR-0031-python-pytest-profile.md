# ADR-0031: Fixed Python Pytest Profile

- Date: 2026-11-26, Asia/Singapore
- Status: Accepted; verified and locally activated on 2026-11-27
- Scope: one additional confined Python test profile for isolated coding

ADR-0027 supports explicit immutable unittest files in a private code copy.
ADR-0029 can continue that code from a trusted checkpoint. Add a fixed
`python-pytest` profile for ordinary test functions, in-process fixtures,
parametrization and assertions. This does not authorize arbitrary test commands,
project runtime installation, shell access, original-project writes or deployment.
Model generation remains explicitly started and separately consented.

## Configuration And Identity

Optional coding configuration:

```json
{
  "profile": "python-pytest"
}
```

Admit only `python-unittest` and `python-pytest`. Omission preserves the legacy
unittest behavior and serialized configuration: do not insert a default field
into an old candidate, receipt, Run context or checkpoint source. An explicit
`python-unittest` field is admitted as an explicit command input; omission is not
rewritten into that input during replay.

The frozen snapshot always records the effective profile. It must equal the
explicit configuration profile or `python-unittest` when the field is absent.
The full configuration and snapshot remain in `candidate_hash`; preparation's
`input_hash` retains the exact admitted input under the existing coding contract.
Changing the profile invalidates preview and execution consent. Unknown profiles,
null, type coercions, unknown keys and configuration/snapshot mismatches fail.

Current reads and exact request reconciliation return the original serialized
candidate. They do not re-hash a normalized candidate or infer a new profile.
Existing request IDs retain their same-input replay behavior. No database
migration or backfill of historic coding records is required.

## Runtime Admission And Confinement

Use the existing Python interpreter, `-I`/`-B`, clean environment, finite wall
time/output, resource limits, process-group cleanup, Linux Landlock and
libseccomp. Apply confinement before importing selected source or tests. The
profile cannot write copied files, read the host project or credentials, create
external processes, use networking or change host metadata. Unsupported
confinement fails closed; there is no unrestricted fallback.

Pytest must already be installed in that interpreter. The application never
installs it or resolves dependencies for a Task. Import or package presence is
not execution evidence: an available profile needs a real confined smoke test
plus the existing negative confinement probes. Preview, preparation, execution
and worker start use the effective selected profile. A legacy prepared candidate
must not become dependent on pytest availability.

The fixed pytest invocation admits only the explicitly selected immutable `.py`
test files and trusted runner arguments. It ignores repository configuration,
`conftest.py`, pytest entry-point autoload, environment plugin declarations and
test-module plugin declarations. It disables the cache and on-disk assertion
rewrite artifacts. There is no implicit directory discovery, user-supplied
argument string, test-command editor or plugin installation. Imports needed by
selected tests may use the explicitly copied source and already installed Python
runtime; they do not expand the filesystem or process authority.

Fixtures and parametrization run in that same confined process. Fixtures needing
filesystem writes, subprocesses, networking or a repository plugin remain
unsupported and fail explicitly. This is a bounded local process runner, not a
VM, general pytest compatibility promise or proof against all kernel and
in-process attacks.

## Actual Test Evidence

Each baseline and revision stores a `test_result` Artifact containing its actual
profile, fixed argv, exit code, duration, bounded output, timeout/truncation
flags, round and explicit test-file list. Its structured receipt uses the existing
five fields: `tests_run`, `failures`, `errors`, `skipped` and `success`. Preserve
the exact profile and receipt when displaying, exporting or feeding failure
evidence to the next consented model call.

Admission rejects malformed, duplicate, inconsistent or missing runner receipts.
Counts are finite nonnegative integers and agree with the enclosing test result;
the parent process also requires a successful exit without timeout or truncation.
Collection and fixture setup/teardown failures are test errors, not omitted
work. The profile must observe at least one actual passing test call before it
can succeed. Zero selected/collected tests, all skipped or all expected failures
do not establish verification. Expected failures do not count as passes, and an
unexpected pass cannot silently establish success.

Test source, assertion messages, stdout and model output remain untrusted.
The receipt is produced by the fixed runner for the selected execution; it is
not an independent cryptographic attestation against arbitrary Python running
inside that process. A model's report, accepted Artifact or prior passing
checkpoint cannot replace this Run's actual tests. The first baseline must
execute on the current frozen starting files before a model call; continuation
inherits code, not a successful test result.

## Continuation And Product Behavior

Keep ADR-0029 checkpoint schema, artifact digest, complete file records, original
fingerprint and writable-scope checks. A prior checkpoint's original
`candidate_hash` must still verify without adding a missing profile field.
The new coding candidate selects its own effective profile, binds it in its
snapshot and reruns a baseline over the inherited code and immutable tests.
Switching test profiles neither rewrites the source Run nor certifies the old
checkpoint under the new test runtime.

The existing owner implementation dialog adds one profile selector. Defaults
retain unittest; changing it clears preview and consent. Prepared candidates
reopen with their frozen profile. Missing capability or profile readiness must
not silently fall back to unittest. Exact unknown-request GET reconciliation,
Task dependency admission, request mutual exclusion, cancellation and explicit
discard retain their existing contracts. Devices gain no test or coding scope.

Run context and test-result views name the recorded profile. Historical
unittest records remain readable. The product does not claim that every pytest
fixture, external plugin or repository configuration is supported.

## Verification And Delivery

Before completion, verify real confined pytest execution for functions,
in-process fixtures, parametrization and assertions; failing baseline,
implementation and passing immutable tests; missing pytest; disabled repository
config/conftest/plugins/cache; collection/setup/teardown errors; empty, all-skip,
xfail/xpass; malformed evidence; time/output limits; and the same confinement
negative probes. Preserve legacy candidate hashes, request replay and checkpoint
continuation, including profile changes and snapshot mismatch rejection.

Browser verification must cover the profile choice, invalidated preview/consent,
prepared reopen, exact result profile, desktop/mobile, locales, themes and
existing coding continuation. Acceptance may inject model JSON responses, but
must distinguish those fixtures from actual copied-file changes, subprocess
tests, confinement, HTTP and persisted records. No automatic real Provider call.

Final results:1312 Python and2309 frontend tests passed, typecheck/production build
passed;24 pytest and63 legacy/dependency focused checks passed. Browser:10 pytest,
58 full workbench and8 primary GET-only checks;76 final fixture screenshots.
Four immutable pytest cases demonstrate2 baseline failures ->1 after a partial
fix ->0 after the second injected response. Original files remain unchanged;
downloaded patch passes check without application. Interrupted evidence stays separate.

Primary4180 was idled/backed up/rehearsed/compared and restarted from PID84755 to
378077 with the same command/cwd/inherited environment. Primary5173 exposes the
selector; original rows compare equal after read-only checks.
[Delivery evidence and limits](../../frontend/evidence/coding-pytest-2026-11-27/README.md).
The historical119/9/110 ledger is unchanged.
