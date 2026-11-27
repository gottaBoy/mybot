# ADR-0035: Confined Node Test Profile

- Date: 2026-11-27, Asia/Singapore
- Status: Accepted; verified and locally activated
- Scope: one fixed `node-test` profile for explicit JavaScript tests

Extend the isolated coding loop with Node's built-in `node:test` and
`node:assert`. Keep the Python unittest/pytest profiles and the same owner
preparation, execution, Call/Artifact, code checkpoint and baseline
reconciliation contracts. This is not an arbitrary Node command, package
installation, browser runtime, TypeScript loader or original-project write.

## Profile And Runtime Identity

Optional coding configuration admits `profile: "node-test"`. The effective
profile is frozen in the snapshot and bound with configuration, model,
selected files, limits and candidate hash. Omitted legacy profile fields remain
omitted; existing hashes, requests, Runs and checkpoints are not normalized or
backfilled. An explicit profile change invalidates preview and consent and
requires a new real baseline.

Selected test paths must end in `.mjs` or `.cjs`. This slice does not admit
`.js`, `.ts`, `.tsx`, a package script, discovery glob or a caller-supplied
argument string. Source dependencies remain the explicit copied file set;
they do not authorize resolving installed project packages or fetching modules.
An explicitly selected `package.json` can retain ordinary Node imports/exports
and module-resolution semantics inside that copy; its scripts are never run.
The same limits of 10 selected files, 32 KiB/file and 64 KiB total apply.

The runner supports exact Node `v24.21.0`, not an unbounded `24.x` range.
The selected executable identity and version are checked before use; bootstrap
checks `process.version` again. Missing or changed runtime/confinement fails
closed and never falls back to Python or an unrestricted Node process.
Explicit `coding_node_test` capability permits the UI selection; package or
binary presence alone is not a passing runtime probe.

The official Node source identity observed for this contract is tag
`v24.21.0` (`f37d7da830134b5314a14ced553273786a2bb4cd`), peeled commit
`955266bfdd854cd280dffd47548673914484e4c0`. A source tag is not proof that a
particular local binary was built from it. Record actual executable identity,
test argv and runtime version separately.

## Two-Stage Confinement

Node creates V8/libuv threads before running user JavaScript. Landlock applied
only by an addon in the main Node thread does not confine already existing
threads on this host's Landlock ABI7. ABI8 thread synchronization is not assumed.
Reducing V8's thread pool or using `--jitless` is not evidence of a single-thread
process or an isolation boundary.

Use a trusted single-thread launcher to apply Landlock before `exec` starts
Node. The runtime's initial and later threads inherit the read-only domain.
The allowlist contains only the private selected-file copy and required trusted
Node/runtime/launcher/addon libraries. It does not expose the original project,
user HOME, credentials or sibling files. The launcher is fixed product code,
not a Task-supplied shell command.

After trusted Node startup and before importing selected source/tests, a
trusted native addon applies seccomp with thread synchronization to every
existing thread. It denies networking, external process creation/execution,
future worker/thread creation, host metadata mutation and the existing
dangerous syscall/IPC boundaries. Failure to synchronize any thread is a
confinement failure. Tests cannot load another native addon to gain a new
interface. Node permission controls may add a second restriction but are not
treated as a sandbox for hostile JavaScript.

Use a clean environment and fixed argv, a trusted empty OpenSSL configuration,
no inherited user startup config/preloads/loaders, `NODE_OPTIONS`, `NODE_PATH`, proxy
or credential variables, no package installation and no test-process isolation
that would spawn children. Native test execution uses a fixed
`run({files: [], setup: trustedImport, isolation: "none", concurrency: false, only: false})`
adapter inside the already confined process. `trustedImport` imports only the
explicit test-file list and records each import rejection independently.
Imported code runs only after both
confinement stages. Timeout, memory/CPU, output, descriptor and file-size limits
and owned process-group cleanup retain the coding-runner requirements.

Real positive and negative probes must establish that ordinary synchronous and
asynchronous filesystem work can read only admitted files, and cannot write
even the snapshot/tests. Async libuv reads/writes, networking, child processes,
worker threads, native addon access and metadata writes must be denied.
A successful sync read probe alone does not certify existing threads.

## Test Selection And Counting

Use Node's native terminal test summary rather than reconstructing a leaf-only
tree. `tests_run` counts Node test items, including parent tests that contain
subtests, and excludes suites. It is not a count of unique assertions or only
leaf tests. `failures` uses the native failed-test count; a failed parent can
be counted separately from its failed child. `skipped` combines native skipped
and TODO test items. Suite/hook/import failures, cancellation, unhandled
exceptions/rejections and incomplete or inconsistent reporting prevent success
and contribute runner errors as appropriate.

The process drains naturally through test-runner completion and global teardown
rather than emitting a successful receipt and forcing exit when the test stream
first appears complete. Global `after` hook failures can be standalone failure
events without increasing native summary counters. Direct hook failures and
runtime-extra/cancellation errors are accounted for before deciding success;
the summary boolean or failed-test count alone is insufficient.

In pinned Node's `isolation: "none"` implementation, `only: false` alone still
allows `.only`/`runOnly` to hide tests. The clean environment therefore fixes
the internal `NODE_TEST_CONTEXT` value to `mybot-confined-node-test` before
loading the test runner, so the captured runner configuration disables this
filtering. This is a deliberate dependency on the exact inspected Node
implementation, not a public API guarantee for other releases. Probes must
demonstrate that top-level, nested, dynamic `.only`, options and `runOnly`
cannot hide another failing test. Mutation of environment variables by a
selected test must not change the captured selection.

Pinned Node's ordinary `files` path synthesizes a passing file placeholder if
an import registers no tests. It can also lose an import error when a file first
registers a passing test and then throws. The adapter therefore imports explicit
files through trusted `setup` with `files: []`; it does not use that automatic
placeholder path. Actual zero registration remains zero, and any module-import
failure prevents success even when registered tests pass. Placeholder-shaped
events remain conservatively rejected if encountered. A legal test deliberately
using that ambiguous file-name/line1/column1 shape is unsupported in this profile.
Empty files and suites cannot manufacture test items; a selection with no actual
test items cannot pass. Empty modules alongside real tests add no passing items.

Node `expectFailure` reverses ordinary pass/fail interpretation. This slice
marks an `expectFailure` directive unsupported and prevents success rather
than presenting an expected failure as verified code. Skip/TODO-only runs
likewise cannot establish success. At least one actual non-directive test must
pass; native summary success, complete counts and a successful process exit
are all necessary. Top-level awaited registration that does not settle,
unfinished asynchronous work and output truncation are bounded failures,
not implicit permissions to enable more processes or threads.

## Receipts And Existing Workflows

Preserve the five-field receipt:
`tests_run`, `failures`, `errors`, `skipped`, `success`. Validate exact schema,
integer ranges, arithmetic, one complete receipt, actual exit status and
timeout/truncation state. A plain stdout success string or a model statement
is not a receipt. Preserve the actual fixed command, runtime/profile, duration,
selected tests, counts and bounded output in each `test_result` Artifact.
The receipt is trusted-runner evidence, not a cryptographic attestation against
arbitrary code executing within the same process.

The baseline always runs before the first model call. Strict JSON changes may
touch only current writable files; current tests/read-only dependencies are
immutable. Model calls and costs still require explicit consent. A failed
runtime probe, no tests, unsupported directives or unverified receipts stop
without a model call. Ordinary assertion failures may enter the existing
bounded correction loop.

Code continuation and explicit baseline reconciliation may select `node-test`.
They freeze that profile, rerun the inherited/resolved starting code, retain
current immutable tests and preserve old candidate identities. New cumulative
and incremental Diff, checkpoint origin and provenance retain ADR-0029/0034
semantics. Prepared candidates with lost capability cannot execute through
another profile but retain explicit discard and original-ID GET reconciliation.
Paired devices gain no coding or test scope.

## Acceptance And Source Evidence

The browser fixture extracts the real `forwardedOrigin` function from
`frontend/scripts/api-proxy.ts` into `forwarded-origin.mjs`, mechanically
removing only its three parameter type annotations. The original body is
unchanged. Record source/function/copy hashes and this method; do not claim
that the complete TypeScript module ran unchanged.

Four immutable Node tests preserve own-origin forwarding and foreign-origin
rejection, then require rejecting credential-bearing and path-bearing backend
targets. Actual baseline fails2, the first injected JSON change fails1 and a
second passes4. The source repository and selected host copy/tests remain
unchanged; modifications exist only inside the isolated Run. Model JSON is
deterministic fixture data, while Node execution, confinement, HTTP, SQLite
and exported Diff are actual application behavior.

Before completion, verify native counts with nested suites/subtests/hooks,
empty/placeholders, skip/TODO, expected failures, imports, rejection/exception,
runtime identity drift, output/timeout/cancellation and the all-thread negative
probes. Verify normal `.mjs`/`.cjs`, profile switches, continuation/reconciliation,
lost preparation/execution responses, UI persistence and desktop/mobile themes.
Final tests, retained failures, browser evidence and local activation are recorded
separately. No automatic real model request or dependency install belongs to a
Task, and historical119/9/110 counts remain unchanged.

Final verification:1497 Python tests with required Pi runtime,2470 frontend
tests, TypeScript and production build passed.90 focused backend checks include
32 Node runner and13 API integration cases; six independent boundary probes
also did not produce a false pass. Browser acceptance:8 Node/58 general/8 primary
GET-only checks,71 final fixture PNG. Primary original records remain unchanged.
Late native fatal errors may have no valid receipt and remain unverified;
do not invent complete error counts for that case.
[Delivery evidence](../../frontend/evidence/coding-node-2026-11-27/README.md).

Primary references are the versioned
[Node test documentation](https://nodejs.org/download/release/v24.21.0/docs/api/test.html),
[Node permission documentation](https://nodejs.org/download/release/v24.21.0/docs/api/permissions.html),
[pinned Node test source](https://github.com/nodejs/node/tree/955266bfdd854cd280dffd47548673914484e4c0/lib/internal/test_runner),
and [Linux Landlock documentation](https://docs.kernel.org/userspace-api/landlock.html).
Local executable behavior and isolation probes remain distinct from those sources.
