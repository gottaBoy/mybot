# ADR-0008: Managed Browser Navigation And Draft Protection

- Date: 2026-11-15
- Status: Implemented; managed same-document Chrome production scenarios verified
- Scope: same-document mybot navigation and unsaved form drafts

## Context

Replacing a Back destination with the form's old URL protects neither browser
history nor the draft. Multiple route/query listeners can also consume an approval
twice or repeat a traversal after a save completes.

## Decision

Use one navigation controller and canonical `mybot:navigation` notification.
App, Workbench and query projections consume the same admitted transition.
The canonical CustomEvent carries only `detail.kind` as `push`, `replace` or
`traverse`; consumers still check navigation admission before reading its reason.
The safe reader returns undefined for unrelated or malformed events. Existing
zero-argument history-port publishers remain valid.

- Managed push/replace checks the current draft/busy blocker before writing.
- Each managed history entry carries only
  `__mybotNavigation:{session,index,key,maxIndex}`. Existing object state is
  preserved; non-object state is retained in a separate namespaced value.
- A rejected native Back/Forward traversal uses a real traversal to restore the
  accepted entry. Use absolute Navigation API targets where supported, with
  `history.go` as the sequential fallback. Confirmation replays the retained
  target, not a URL replacement.
- Cancel does not overwrite the blocked destination URL. Controller metadata may
  be maintained on accepted managed entries.
- Traversal commit is idempotent. Completing a save and clearing busy must not
  both issue another `go` for the same pending intention.
- Busy retains the intention. Failure returns to an explicit decision; success
  may flush an already-approved intention.
- Authentication reset clears pending navigation before private draft cleanup.

No draft text, consent, credentials, project notes or model output enters history
state or preference storage. Drafts are not made durable by entry metadata.
Basic/JQL query drafts use the admitted reason: ordinary presentation pushes
preserve unsubmitted candidates, immediate scope pushes rebase only their changed
field, and native traversal restores the whole committed query snapshot. A local
reset counter carries no draft content. Reload restores committed URL state only.

## Boundaries

External/unmanaged entries are not assigned guessed indexes or overwritten.
The UI reports the unsupported traversal; keeping the form does not promise
restoration of an unknown address. Explicit navigation may start a new managed
segment. Cross-document departures use only the native beforeunload hint; no
claim is made that every browser or device must honor cancellation.

Retain the compatibility unit-tested admission API, but browser consumers must
use the canonical controller. Do not reintroduce independent raw hash/pop handlers.

## Verification

Use synthetic read models and real browser Back/Forward to verify entry keys,
URL, query state, draft retention, cancel/confirm, multi-step and consecutive
traversals, busy success/failure, authentication reset and unknown-entry behavior.
In-flight native traversal stress needs separate evidence from sequential Back
checks; neither constitutes Safari/physical-device certification.

## Absolute Native Traversal

On 2026-11-15, production pressure testing found that relative `history.go`
restoration can drift when another native Back is queued inside pop dispatch.
The first three sequential production checks passed, but the interleaved case
did not restore the accepted entry. That failed run remains in
`/tmp/mybot-navigation-history-20261115-prod-r1/`; it is not counted as a pass.

Feature-detect Navigation API `entries`, `updateCurrentEntry` and `traverseTo`.
Classic `history.state` and `NavigationHistoryEntry.getState()` are separate
state stores. Synchronize only the managed navigation stamp into the current
Navigation API entry, preserving its existing state; do not copy classic
payloads or infer ownership from URL similarity. This also gives reload a
durable entry-identity mapping without a business-data storage journal.

For a managed same-document destination, match session/index/key in that
separately written stamp and call `traverseTo` with the browser's native entry
key. Handle rejection from both `committed` and `finished`; an unavailable or
rejected owned target fails closed, without synthesizing an index or rewriting
the destination. Relative History API traversal remains the fallback when
Navigation API support is absent. Sequential fallback behavior does not prove
interleaved traversal support in those browsers.

Primary references, inspected 2026-11-15:

- WHATWG Navigation API:
  `https://html.spec.whatwg.org/multipage/nav-history-apis.html#navigation-api`
- Chrome Navigation API:
  `https://developer.chrome.com/docs/web-platform/navigation-api`

The isolated development checks
`/tmp/mybot-navigation-history-20261115-pressure-r2/` and
`/tmp/mybot-navigation-history-20261115-reload-r1/` passed the interleaved native
Back and managed-reload identity scenarios respectively. Navigation unit tests
total 20 passing checks. The final rebuilt-production run passed all nine
scenarios with nine screenshots and no page errors:
`frontend/evidence/ui-closeout-2026-11-15/navigation/verification.json`.
It includes managed reload, native interleaving, cumulative traversal, busy
save success/failure, 401 reset and unmanaged failure closure. All API traffic
was intercepted; no test invoked a provider or mutated a real backend.
This does not certify Safari, physical devices, concurrent fallback traversal
or cross-document cancellation.

The later Basic-query first slice adds reason classification without changing
history admission or traversal mechanics. Navigation unit coverage is now 36
tests; the same nine production scenarios were rerun successfully under
`frontend/evidence/query-drafts-2026-11-15/navigation/`. Fifteen separate
query-draft browser checks verify whole-snapshot restoration and preservation
for ordinary presentation pushes. Synthetic events are not physical-device
or input-method certification.
