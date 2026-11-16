# ADR-0009: Structured List Conditions And Task Sorting

- Date: 2026-11-15
- Status: Implemented; local production-browser acceptance verified
- Scope: existing single-user Workbench read models and Astryx UI

## Decision

Keep finite, structured query state rather than expanding a handwritten JQL
grammar. Text matching remains the existing explicit search. A local field
directory supplies actual projects and the five state categories:
pending, active, attention, completed and other.

Multiple selected values are OR within a field and AND between project/state
fields. Empty selection means all, not an empty result set. Tasks use their
latest Run, while Run history classifies each persisted record. A Task without
a Run is pending; no pending Run record is fabricated. Unknown Run statuses
remain other. Fixed route project scope takes precedence over query selection.

## URL Contract

Retain `q/project/filter/order` compatibility and add:

- `projects`: JSON string array, at most 100 unique nonempty project IDs.
- `states`: JSON array of the five unique state-category values.
- `sorts`: JSON array of at most three unique task-column sort rules,
  each `{sortKey,direction}` with a finite column whitelist and
  `ascending/descending`.

Use JSON and URLSearchParams, not a new expression language. Valid multi-value
arrays take precedence over legacy single fields, including explicit empty
arrays. Condition writes use legacy fields for a single compatible value and JSON
for multiple values or pending/other categories. The settings Dialog always writes
the structured `sorts` array, including a single rule; the quick single-sort menu
and single-rule table-header actions retain legacy `order` writes and clear
`sorts`. Removing a header rule from a multi-sort retains the entire remaining
rule list, using JSON while more than one rule remains.
Canonical candidates remove
conflicting old/new fields in one navigation transaction.

Malformed JSON, unsupported fields/values and contradictory definitions are
not silently dropped. Retain invalid parameters for inspection and show an
explicit unsupported result state. A syntactically valid but unavailable project
also blocks the query; absence is not proof of deletion or permission.
Fixed project navigation removes conflicting `projects`.

## Presentation And Drafts

Keep one business component tree and existing Astryx wrappers. MultiSelector
provides search, selection, clear and adaptive presentation. The query remains
one row; narrow screens expose actual candidate editors in the Filters Dialog.
Search/Enter applies the complete candidate; closing the filter editor retains
the in-memory draft. Side-scope actions remain immediate and clear only the
corresponding multi-value field. ADR-0008's traversal restoration still applies.

Column visibility and order are nonsensitive local preferences, not a SavedView.
Use a complete seven-column permutation and always show the title. Hidden
columns may still participate in sorting. Ordering and sort priority can be
changed with keyboard-accessible arrow buttons; dragging is not required.

The existing upper-right Columns menu opens the settings Dialog. It edits a
candidate, applies once or cancels without changing applied preferences. Dirty
close/navigation requires confirmation. A synchronous Apply may admit its own
URL commit; its local duplicate-submit lock must not mark that commit busy and
therefore block itself.

Task multi-sort uses Astryx's proven `useAppTableRows` sorting implementation,
not a second sorting engine. `sorts` takes precedence over `order`; supported
JQL ORDER BY remains the effective-sort authority and locks other sort edits.
New task column order/multi-sort is consumed only by the task list. Run history
retains its independent table semantics; retaining a parameter there is not
evidence of executing task sorting. No grouping or arbitrary JQL is added.

## Boundaries

No model request, Run mutation, external connector, identity/ACL inference,
deployment or permission expansion follows from editing these settings.
This is local filtering of existing read models, not server-side pagination,
query-language completeness, durable draft storage or private saved views.

634 frontend tests and typecheck/build passed. The same production build passed
browser reports of 58/15/16/30/9/9 checks, with 111 production screenshots and no
page errors. Six independent settings checks and two supplemental screenshots
are preserved separately. See
`frontend/evidence/advanced-workbench-2026-11-15/README.md`.
The backend was unchanged and Python units were not rerun; the 306-case baseline
belongs to the prior batch. This is not real-provider, physical-device, Safari
or final visual acceptance.
