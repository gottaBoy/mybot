# ADR-0028: Explicit Prior Artifact Context

- Date: 2026-11-26, Asia/Singapore
- Status: Accepted
- Product priority: continue real R&D work from verifiable previous results

After ADR-0027's implementation/test loop, let the owner explicitly choose prior
artifacts when arranging the next research Run from a saved Task message. Keep
the existing selected-message rule: no implicit conversation history, automatic
memory or automatic selection of the latest result.

## Contract

Expose capability `task_artifact_references` and owner GET
`/api/tasks/{id}/artifacts?page=N`. One query-only read transaction joins the exact
Task's artifacts to terminal Runs (`succeeded`, `failed`, `canceled`). Pages have
20 metadata records, totals and `artifacts-created-v1` ordering by created_at DESC,
artifact ID ASC. This is a changing snapshot, not a result-set lease.

The catalog has no bodies. Empty and oversized artifacts remain explicit,
unselectable records with a null hash. Admit at most three references, 32 KiB per
artifact and 64 KiB total, without truncation. Both the catalog and explicit
selection avoid loading an oversized body.

Extend turn preview and prepare with optional `artifact_refs: [{id, sha256}]`.
The digest covers canonical UTF-8 ID, source Run/Task IDs, title, kind, creation
time, exact body and byte length. Review decisions remain independent and do not
change the reference's content identity. A failed Run's result is reference data,
not proof of validation or human acceptance.

Preview verifies identity, ownership, terminal source status, size and digest,
then includes the selected bodies/provenance in both `snapshot.artifacts` and
the exact model context text. File evidence retains its file-only denominator.
The combined context byte count includes the reference serialization. Reference
data is labelled untrusted, not an instruction source.

Prepare rechecks the same references and binds them to the context/candidate
hash. Changed or unavailable input rejects preparation. On success, existing
`task_turns.candidate` and `runs.context` freeze the full selected records; no
schema change or second artifact authority. Later source changes cannot alter an
already prepared candidate. Reusing a preparation must match its exact references.

## Product Flow

Task conversation -> save a supplement -> Arrange next run -> Select prior
artifacts -> Review selected artifacts -> choose models/resources -> fresh consent.
Checkbox candidates and the accepted preview are separate. Unreviewed selections
block advancement and participate in the existing dirty-navigation protection.
Selecting references performs no preparation or model call.

The preview shows actual bodies, IDs, source Run IDs, byte counts and digests.
Frozen candidates reopen read-only. Run's confirmed-context boundary shows the
original frozen provenance and body, including after refresh.

The explicit capability is required. Catalog errors stay errors, not empty
successes; responses bind Task, page, selected IDs/hashes and message identity.
Abort obsolete/unmounted reads. Unknown preparation/execution keeps the same
Turn/request and GET reconciliation, never an automatic mutation replay. A known
artifact admission rejection returns to context selection with fresh consent.

Single-use device delegation still concerns the same owner-prepared candidate.
Its summary adds an optional artifact count, bound into client grant identity;
neither reference bodies nor file access are added to device read scope. Existing
grants without references retain their legacy summary shape.

## Limits And Evidence

This slice is explicit reference context for a subsequent research Run. It does
not apply an old patch into a new coding workspace, add runtime/test profiles,
implement task dependencies, send all history or expand model/tool permissions.
Coding execution remains the separate ADR-0027 path. Provider execution still
requires the user to explicitly start a configured model.

Validation, browser failures, fixture-vs-provider limits and primary activation:
[2026-11-26 evidence](../../frontend/evidence/core-continuation-2026-11-26/README.md).
The original119/9/110 engineering ledger remains unchanged.
