# ADR-0029: Isolated Code Continuation

- Date: 2026-11-26, Asia/Singapore
- Status: Accepted
- Scope: continue a bounded coding Run from explicitly selected prior code

ADR-0028 admits prior artifacts as research input, but every coding Run still
starts from the repository's original files. Add an explicit, independently
consented coding continuation. The original workspace remains unchanged.

## Checkpoint Authority

After validating each model response and before testing that revision, the
trusted harness stores a `code_checkpoint` Artifact. Its structured JSON records
schema version, Task/Run IDs, source candidate hash, implementation round,
original-file fingerprint and the exact current file records. Tests remain
unchanged; the checkpoint is code state, not proof of successful tests or review.
Failed and canceled Runs can have useful checkpoints. A source Run must be
terminal (`succeeded`, `failed`, `canceled`) before selection. An interrupted Run
must first be resolved through its existing lifecycle; no unknown call is retried
implicitly. Old Runs without checkpoints are not reconstructed from raw Diff.

Owner GET `/api/tasks/{id}/coding/checkpoints?page=N` exposes20 metadata records,
totals and `checkpoints-created-v1` ordering (created_at DESC, artifact ID ASC).
It joins the exact Task in one query-only snapshot and has no code bodies.
Malformed/oversized checkpoints remain explicitly unavailable metadata. The
serialized body limit is512KiB, while actual files retain the existing10 files,
32KiB/file,64KiB total ceiling. No truncation.

Capability `coding_continuation` must be explicit. Existing `isolated_coding`
does not imply it. Device pairing and single-use research execution grants do
not acquire checkpoint read or coding execution scope.

## Admission And Frozen Inputs

Optional coding configuration:

```json
{
  "continuation": {
    "checkpoint": {"id": "artifact-id", "sha256": "64-hex-content-identity"},
    "instruction": "Explicit requirements for this implementation"
  }
}
```

The digest uses ADR-0028's canonical artifact identity, including IDs, metadata
and exact body. Preview/prepare verify that digest, terminal same-Task source,
structured checkpoint IDs, original fingerprint, complete file set/order,
source candidate consistency and the source writable scope. Changed inherited
files must also belong to the new writable selection. Tests/dependencies cannot
be smuggled in through a checkpoint. The current Task's selected original file
records must exactly match the source origin. Any drift rejects with a conflict;
there is no fuzzy patch application, auto-rebase or silent fresh-base fallback.

The candidate freezes effective starting files, original files, source artifact/
Run/round/digest, inherited Diff and explicit requirements. Reuse the existing
`coding_jobs` preparation, request identity, mutual-exclusion and GET reconciliation
contract. No new tables. Execute uses the frozen candidate after fresh consent;
later source artifact or host-file changes do not rewrite it. Model identity and
Task execution conflicts retain existing execute-time checks.

## Execution And Review

Each continuation starts a new Run with a new call budget and actual baseline
test execution on the inherited code, then sends that code, the baseline evidence
and explicit requirements to the selected model. A response that repeats inherited
code cannot claim new implementation. All prior test/output data remains untrusted.
The runner and its confinement profile are unchanged.

Each legal revision publishes a cumulative `diff` against the original repository
and, for continuations, an `incremental_diff` against this Run's inherited start.
It also stores a new checkpoint. Further continuations retain the same original
base and immediate-parent provenance. Test attempts and human decisions stay
independent; inherited passing tests still run again. No original-file write,
shell tool, automatic commit/merge, dependency installation or deployment.

The Task implementation dialog offers Original project files / Prior code
checkpoint, a paged source picker and requirements. Source changes clear preview
and consent. Preview exposes inherited Diff and exact starting file contents.
Prepared reopens preserve these inputs, never editor drafts or old consent.
Run context shows the immediate source; checkpoint JSON and both Diff variants
display/export as their actual data formats.

## Verification

Use actual isolated Python tests with injected text responses. Demonstrate
partial implementation failure -> terminal checkpoint -> new baseline failure ->
one repair -> passing immutable tests, preserving original files and patch
applicability. Verify a further continuation, base/test drift, wrong Task,
source lifecycle, readonly inheritance, stale hashes, no new changes and frozen
receipts after response loss. Real-provider quality and billing remain unverified.

Evidence and local activation are recorded separately in
[the delivery record](../../frontend/evidence/coding-continuation-2026-11-26/README.md).
The historical119/9/110 ledger is unchanged. More test runtimes and task
decomposition/dependencies remain separate work.
