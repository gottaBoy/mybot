# ADR-0034: Explicit Code Baseline Reconciliation

- Date: 2026-11-27, Asia/Singapore
- Status: Accepted; verified and locally activated
- Scope: a reviewed new coding baseline after the original project changes

ADR-0029 deliberately refuses continuation when selected original files change.
Retain that default and add an explicit owner review rather than an automatic
merge. The user compares the prior origin, selected code checkpoint and current
project, then chooses complete starting contents for each writable file.
Mybot still never applies a patch to the original project, executes a user
command or treats old tests as current verification.

## Four Distinct File Sets

Use these names only for the current review:

- `O`: the selected checkpoint Run's recorded original file records.
- `K`: that trusted checkpoint's complete code file records.
- `N`: freshly read current Task/Project file records.
- `R`: the explicitly resolved starting files for the new isolated Run.

All three source sets must have the same complete file paths and order. Adding,
removing or reordering selected files remains a conflict in this slice.
Do not guess a renamed path, truncate a record, follow a symlink or reconstruct
code from an untrusted raw Diff. Existing per-file, total-byte, path and source
read boundaries remain unchanged.

For every currently writable file, the owner explicitly chooses `current`,
`checkpoint` or `manual`. Manual means the complete UTF-8 file content, not a
patch, command, hunk or automatic merge instruction. Resolutions must cover all
and only current writable paths in Task source order; duplicates, omitted paths,
unknown fields and content attached to a non-manual choice fail. Empty manual
content is a valid empty file within the existing byte limits.

Current read-only files and selected immutable tests always come from `N`.
They cannot acquire checkpoint contents through an omitted choice or a manual
resolution, even if they were writable in a source Run. The comparison explicitly
reports discarded prior changes to files that are read-only now. Choosing
`current` for every writable file is valid: `R == N` does not manufacture an
inherited modification or a completed implementation.

## Comparison Is Read Only

Explicit capability `coding_reconciliation` admits the new owner surface and
POST `/api/tasks/{id}/coding/reconciliation/preview`. It accepts a normal coding
configuration with a checkpoint continuation and no reconciliation attached.
This POST only reads selected files and a query-only database snapshot. It
does not probe the test runner, call a model, create a Run/candidate, save code
or append an execution event.

The response carries `O`, `K`, `N`, current file hash, source artifact/Run/round/
origin/candidate identities and per-file change facts. `review_hash` binds the
entire response plus the exact Task, Project and full reviewed configuration,
including model, test selection/profile, resources and continuation instruction.
`current_hash` identifies the current file records, not a durable filesystem
lease. A multi-file read is a captured record set, not an atomic host-filesystem
transaction.

Checkpoint admission still verifies the canonical artifact digest, terminal
same-Task source Run, structured IDs, original fingerprint, complete file set,
source candidate hash and source writable authority. It does not weaken the old
`read_checkpoint` two-value contract. Reading comparison data is not a mutation
receipt and does not authorize later execution.

## Explicit Candidate And Freeze

Optional configuration under the existing continuation:

```json
{
  "reconciliation": {
    "review_hash": "64-hex-review-identity",
    "expected_current_hash": "64-hex-current-record-identity",
    "resolutions": [
      {"path": "source.py", "source": "current"},
      {"path": "helper.py", "source": "checkpoint"},
      {"path": "notes.py", "source": "manual", "content": "version = 4\n"}
    ]
  }
}
```

Normal final preview and preparation freshly read `N` and validate the source,
rebuild the comparison, require both hashes and bind all resolutions. A changed
Task/Project/configuration/source/current file set rejects the old review. There
is no silent new-base fallback, hash dropping or automatic retry after a 409.
The owner keeps local edits, reviews the new comparison and gives fresh consent.

Final `snapshot.origin_files` is `N`, and `snapshot.files` is `R`. Additional
reconciliation provenance freezes the old source origin `O`, checkpoint `K`,
review/current/resolved hashes, source candidate hash and change facts. Existing
continuation metadata retains the old `O -> K` source Diff for inspection.
The complete candidate/hash and existing `coding_jobs` request contract freeze
that choice without new database tables or modifications to old rows.

After preparation, exact GET, same-command replay and execution use that frozen
candidate; they do not reread the host files or mutable source artifact to
rewrite it. A changed command under the same ID conflicts. Current Task
readiness, retirement, model identity, permissions and mutually exclusive
execution checks still apply at their existing admission stages.

Omitted legacy configuration fields stay omitted. Legacy candidate/hash,
checkpoint JSON, Run context and immutable receipt identities are not normalized
or backfilled to add reconciliation, profile or other defaults.

## New Root, Execution And Evidence

The new Run executes a real baseline on `R` with the selected immutable current
tests, then performs the existing bounded model/validation loop. The model gets
only `R`, the actual new test evidence, current Task/Project requirements and
source identifiers/hashes. It does not implicitly receive `O`, `K`, the old
source patch or the entire reconciliation comparison. Those remain review
provenance, not additional model context.

A model response must make a genuine new change from its starting/current files.
Returning `R` unchanged, changing only the selected model or citing old passing
tests does not establish new implementation. Current profile support, timeout,
call/output limits, strict JSON, trusted writer, Landlock/seccomp and cancellation
remain the contracts of ADR-0027/0031/0033.

Keep three different comparisons explicit:

- The resulting cumulative `diff` is `N -> final`.
- This Run's `incremental_diff` is `R -> final`.
- Source provenance is the unchanged old `O -> K`.

New checkpoints record `N` as their original anchor. A later ordinary
continuation compares the host against `N`, never silently returns to the older
`O` or reapplies two patches. Source and new Run histories remain readable and
unchanged. Results and test success remain separate from human acceptance and
from applying, merging, committing or deploying any original-project change.

## UI, Unknown Outcomes And Verification

The same owner coding dialog presents the three source contents, per-file
changes and explicit choices through project-owned Astryx controls. A changed
file/model/test/resource/instruction choice invalidates comparison, final
preview and consent. Drafts survive presentation changes and use the shared
navigation guard. Historical prepared reconciliation remains visible if the
capability disappears, but cannot execute through a legacy path; explicit
discard retains its existing contract.

Unknown preparation/execution retains the original `codingRequest` and candidate.
Reload and response loss reconcile by exact GET without automatically resending,
replacing the ID, inventing original input or treating 404 as termination.
Paired devices gain no comparison, code-body, preparation or execution scope.

Verify source/current drift, writable/current/checkpoint/manual choices, new
read-only tests/dependencies, all-current `R == N`, strict byte/path/order/scope
checks, source and configuration substitution, preview/prepare races and frozen
replays after later host/source changes. Demonstrate a real failing old
checkpoint, current-project maintenance, ordinary continuation conflict,
explicit resolution, a fresh failing baseline and passing actual tests, then
a further continuation from the new root. Preserve no-new-model-change failure.

Browser acceptance uses a disposable copy of mybot source and deterministic
model JSON. Fixture-only source changes are separate from business requests and
real application/test evidence. Final1446 Python/2435 frontend/typecheck/build
passed;108 focused backend checks include40 new cases. A delayed-preview UI race
was fixed and covered before the final full frontend and browser rerun.
Browser:8 reconciliation/58 full/8 primary GET-only checks,75 fixture PNG.
The actual three-Run chain preserves current files, uses5 current tests and
continues from the newly adopted root. Primary rows remain unchanged after
read-only checks.
[Delivery evidence](../../frontend/evidence/coding-reconciliation-2026-11-27/README.md).
No paid model is automatic; historical119/9/110 counts remain unchanged.
