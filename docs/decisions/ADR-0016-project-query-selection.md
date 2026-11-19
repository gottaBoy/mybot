# ADR-0016: Project Query Selection And Reference Admission

- Date: 2026-11-19, Asia/Singapore
- Status: Implemented; isolated acceptance completed
- Work Item: IZ-07.3c1a
- Follows: ADR-0015

## Decision

Reuse the existing explicitly advertised `project_references` contract for the
Task query's project selector, committed project validation/name and SavedView
load validation. No new endpoint or capability is needed. Missing capability
retains the legacy complete Bootstrap catalog. An advertised read failing must
not fall back to Bootstrap references.

The installed Astryx MultiSelector has local search but no remote search callback.
Use a project-owned ProjectQueryPicker composed from existing Astryx wrappers:
a Button trigger, Dialog, TextInput, Checkbox, search and pagination Buttons.
The dialog lists one authoritative server page and separately hydrates selected
IDs. Do not eagerly fetch every page, browser-filter server matches, or infer
missing from absence on a page.

The picker edits the parent's unsent Basic condition draft. Checking or clearing
projects does not update the task URL or send a task-query/model request.
Closing retains that candidate; the existing main Search/non-composing Enter
commits the whole text/project/state candidate once and resets the result page.
Picker search only commits its local directory query; pagination does not change
the task query. Preserve selection across directory pages and searches; cap at
100 distinct IDs. Unchecking a confirmed missing ID remains possible.

The trigger obtains selected labels through independent hydration and never
labels an unverified ID as missing. Loading, forbidden, unavailable, malformed
response, true empty and confirmed missing are distinct. Disable stale option
activation while reads are pending; preserve drafts across theme/locale changes.
Keep keyboard focus, Escape, nested mobile Filters dialogs and long labels
within the existing Astryx behavior and semantic-token/density boundary.

## Committed Conditions

Validate committed project IDs independently from picker draft IDs. With remote
references enabled, do not consult Bootstrap for availability or heading names.
Until the committed hydration is ready, hide results behind a loading state;
on failure show an explicit GET retry, and on confirmed missing block results
with the existing unavailable-condition error. A read failure is not missing.
No automatic retry of failed reads on background Bootstrap polls.

Only the selected minimal IDs/names are needed for this admission. Reuse the
strict project-reference client, cancellation and response binding; no model or
mutation calls are involved. Empty selections require no selected validation.
Fixed project routes keep their current full Project dependency; this slice does
not migrate that route or reinterpret route scope as authorization.

## Saved Views

Before loading a SavedView snapshot, independently validate its exact project IDs
through a fresh read with the caller's AbortSignal. Preserve the existing dirty
candidate confirmation. During validation, expose busy and block duplicate load
and navigation; do not announce success or modify URL, columns or query drafts.
Cancel/discard on scope change, unmount or obsolete request.

Immediately before the synchronous application, verify that the candidate still
matches the baseline taken when validation began. User edits invalidate that
validation; theme/locale changes do not. Restore the existing synchronous
navigation admission exception only for the final confirmed local commit.
Failed/missing validation leaves all drafts and applied table settings unchanged.
This read path must never become a mutation or Provider replay policy.

## Scope And Evidence

Full Project routes/list/forms, other view projections, negotiated Bootstrap
reduction and transfer measurements remain IZ-07.3c1b/c2/c3/d. The original
119/9/110 ledger is unchanged. This slice does not add execution permissions,
SSO, devices, workflow execution, production activation or global performance
claims. Unit, production browser and isolated actual-API evidence follow below.

## Implementation And Acceptance

`ProjectQueryPicker` uses separate selected-ID hydration and an open-dialog
directory read. Checking a box does not refetch the directory page. The selected
reference hook is disabled for an empty candidate; the directory is unmounted on
close. The parent committed-reference hook is separate from both. Same-key
refresh retains validated references with busy metadata; it does not cancel an
in-flight task query. A new selected-ID request hides obsolete result rows.

`SavedViewsMenu.onValidateApply(record, signal)` is optional. Legacy SavedView
detail reads remain navigable and are canceled/discarded on scope change. Only
the new reference-validation stage registers a read lock. Completion discards a
queued navigation before releasing that lock; it cannot silently replay an
unrelated route after a failed validation.

The final synchronous `onApply` checks navigation acceptance before changing
table settings or drafts. Validation failure, candidate change or rejected
navigation must not be announced as a loaded snapshot. An exact fetched
SavedView is still a copied snapshot, not a live resource binding or mutation
receipt.

Usage remains inside the existing Basic condition row:

```tsx
<ProjectQueryPicker
  data={data}
  refreshRevision={refreshRevision}
  value={conditionDraft.projects}
  onChange={(projects) => setConditionDraft((draft) => ({ ...draft, projects }))}
  t={t}
  hiddenLabel
/>
```

Final verification: 1,245 frontend tests / 45 files, TypeScript and production
build passed. Production browser reports passed picker 44, SavedViews 32,
comprehensive 58 and actual API 5, with 96 final PNG and no pageerrors.
The 710 Python tests belong to the previous November 18 batch; no backend source
changed and they were not rerun in this slice. Existing build-size and
Starlette/httpx warnings remain. Evidence and retained failures:
[acceptance record](../../frontend/evidence/project-query-selection-2026-11-19/README.md).

Original 4180 has not loaded the read capabilities. Restored 5173 uses that legacy
backend. This is isolated acceptance, not main-service activation, Bootstrap
reduction or user visual acceptance.
