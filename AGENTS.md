# Project Instructions

## Resume

Read `CONTINUE.md` before making assumptions about the project. Then read the latest ADR referenced there and the document relevant to the requested work.
Use `docs/PRODUCT_GOALS_CURRENT.md` for product delivery priorities. A completed
query/pagination slice is not completion of the goal/task/Agent/outcome workflow.
The initial Task workspace is delivered in ADR-0021. Prioritize persistent Task
conversation and fixed Workflow versions next, rather than automatically choosing
the next remaining data projection. Distinguish local activation from isolated tests.
For frontend work, also read `docs/ASTRYX_TEMPLATE_INTEGRATION.md` and
`docs/UI_ITERATIONS.md`. For Zira-derived work, read `docs/ZIRA_FRONTEND_STUDY.md`
and `docs/REA_ZIRA_LAYOUT.md`; the 625-file structural index is not runtime evidence.
For Issues-specific work, also read `docs/REA_ZIRA_ISSUES.md` and its shell/query/results
studies. The supplied screenshot and the inspected Zira commit are different evidence;
do not infer Basic/ZQL, column management, live page size or saved-view support from
the screenshot alone.
The three delegated source studies are `docs/ZIRA_STUDY_INTERACTIONS.md`,
`docs/ZIRA_STUDY_DATA.md` and `docs/ZIRA_STUDY_ADMIN.md`; use the relevant one for
action behavior, data contracts or configuration/workflow changes.
Inspect the working tree before editing; an earlier
iteration may still be uncommitted.

## Product And Phase

- Target: an AI workbench for R&D teams, initially validated by one developer.
- Current phase: implementation authorized by the user on 2026-11-04.
- First slice: single-user, read-only project research, persistent runs/events, model routing and responsive Web UI.
- Preserve the static review artifacts. The working application lives separately in `workbench/` and `web/`.
- No shell execution, code writes, deployment, automatic paid calls or sibling credentials. Providers run only when the user explicitly starts/tests a configured connection.
- Preserve the distinction between accepted requirements, proposed designs, source observations, and tested behavior.

## UI

- Create a mybot-owned UI. Do not copy or borrow visual style, layout, or interaction
  design from sibling projects under `/home/my/workspace/ainfra`, except for the
  explicit reference authorization below.
- On 2026-11-13 the user authorized studying
  `/home/my/workspace/ainfra/zira/frontend` for frontend layout. This is a narrow
  read-only exception: inspect shell/header/toolbar/density/theme organization and
  adapt the principles to mybot. The user subsequently explicitly authorized
  learning its list/search/action layout and reproducing its color scheme as an
  optional **Zira style** alongside mybot's own styles, still using Astryx components.
  Reconstruct that palette through the mybot/Astryx token registry, not by importing
  Zira's component library or maintaining a second page implementation. Do not
  modify Zira, copy its branding/assets, or assume its APIs, authorization, tests or
  license apply to mybot. Do not inspect sibling credentials, databases or session data.
  Record inspected commit/paths, observations, local adaptations and gaps in
  `docs/REA_ZIRA_LAYOUT.md`.
- `prototype/` is an unadopted early sketch, not the visual or engineering baseline.
- The user rejected the visual quality of `design/review-v1/`. Preserve it for comparison, not as the accepted baseline.
- `design/review-v2/` contains the current task/call/coordinator/control/plan-revision visual proposal and static checks, not an accepted final design. Read `docs/UI_ITERATIONS.md` before continuing it.
- In `design/review-v2/`, Control Panel edits are in-memory presentation drafts only. Never present a static preview as applied configuration or a completed agent action.
- Static Plan v3 is a local revision draft, not a new run. Static model profiles and connection locations are explicitly fictional, unverified samples, not working providers.
- In the live `web/` application, project/model/task configuration is persisted through the API. Model reachability still requires an explicit test; saved configuration is not test evidence.
- Preserve V1 and draft history. Iterate the current visual layer without deleting whole stylesheets before replacements exist.
- Static mock data and disabled business actions must not be presented as executed work.
- Public open-source projects may be studied for architecture and capabilities; do not turn that into copying their UI.
- The user explicitly approved Astryx Playground, Components, Theme, and Templates
  pages as implementation references on 2026-11-11:
  - `https://astryx.atmeta.com/playground`
  - `https://astryx.atmeta.com/components`
  - `https://astryx.atmeta.com/docs/theme`
  - `https://astryx.atmeta.com/templates`
- The user also approved the supplied `#code=...` Playground variants and explicitly
  authorized fully reproducing a selected Playground/template locally. A selected
  template or component may therefore be reproduced for this project, including its
  layout, component composition, responsive states, theme setup, and source structure,
  when that is the chosen migration slice.
- Reproduction is still not permission to claim Meta/Astryx ownership or endorsement.
  Rebrand the product for mybot, preserve required MIT/license notices, inspect
  third-party assets and dependencies separately, and do not copy unrelated Astryx
  marketing pages or example data into product behavior.
- The user selected 20 templates via CLI commands on 2026-11-13, covering login,
  shell, dashboards, tables, kanban, canvas, forms, settings, documents, chat and
  work-item detail. The local scaffolds live under `frontend/src/app/<id>/page.tsx`.
  These are reference artifacts, not automatically adopted routes. Integrate the
  selected patterns into a coherent product rather than shipping 20 disconnected
  demo pages. Keep a per-template source/adoption/evidence map.
- Template passwords, SSO provider detection, sample task priorities/due dates,
  saved indicators and no-op actions are not business facts. Replace them with
  verified API behavior or omit them. SSO layout adoption is not OIDC/SAML support;
  a canvas layout is not arbitrary workflow execution; a board must not change a
  persisted Run's status through presentation-only dragging.

## Frontend Component System

For the authorized React migration and any later React surface, use the following
component policy.

### Default stack

- Prefer **Astryx** as the base design system for new React work:
  - repository: `https://github.com/meta/astryx`
  - documentation: `https://astryx.atmeta.com`
  - use the published package before copying source into this repository.
- Astryx is the source of generic components, theme primitives, accessibility behavior,
  and design tokens. Do not rebuild an Astryx component locally without a concrete
  product requirement or an explicitly selected local reproduction slice.
- Astryx currently targets React 19+. The user authorized migrating this project's
  `web/` application to React + Astryx on 2026-11-11. The migration still requires
  an explicit work item, an ADR, incremental slices, and a browser regression pass;
  authorization is not evidence that the migration is complete.
- **Tailwind CSS** is optional and belongs at the page/layout boundary: grid, spacing,
  responsive composition, and small product-specific adjustments. Do not make Tailwind
  the second implementation of the same Astryx component.
- **Radix UI** is optional and belongs to behavior primitives that Astryx does not
  provide. Do not maintain duplicate Dialog, Popover, Menu, Tabs, or Tooltip
  implementations without recording the reason.
  This is not permission to import Zira's UI library; document any missing Astryx
  primitive before introducing an exception, while retaining Astryx tokens/wrappers.
- Use `pnpm exec astryx template --list --type page` and
  `pnpm exec astryx template <id>` as the source-of-truth workflow for local
  template reproduction. Keep generated references under the frontend template
  boundary, expose them through an on-demand catalog/preview, and do not import all
  templates into the product shell or claim that a generated preview is connected to
  mybot business data.
- Use the installed, pinned CLI for the user's `npx @astryxdesign/cli template ...`
  requests. Do not silently download a newer CLI, run `astryx init`, overwrite
  existing adaptations or upgrade React/Astryx. CLI "missing dependency" suggestions
  can be false positives from example strings: inspect actual imports before
  installing anything. A duplicate template request is not permission to discard
  local work.

### Encapsulation boundary

- Product code must import project-owned wrappers, not Astryx or Radix directly:

  ```text
  frontend/components/ui/AppButton
  frontend/components/ui/AppDialog
  frontend/components/ui/AppTable
  frontend/components/workbench/TaskCard
  ```

- Wrappers own product naming, defaults, analytics hooks, permission states, and
  migration seams. Vendor-specific props stay inside the wrapper where practical.
- Keep generic UI separate from workbench-domain components. A task, run, model,
  conversation, approval, or artifact component must not be hidden inside a generic
  Button/Dialog/Table abstraction.
- Use one token source. If Tailwind is enabled, map its theme to the project token
  contract instead of maintaining a second color, spacing, radius, or typography scale.
- Prefer supported `className`, token, and slot APIs. Do not style vendor internals
  through fragile descendant selectors or DOM assumptions.

### Astryx source and licensing

- Astryx's MIT-licensed source may be copied, modified, vendored, and used in
  commercial code, but copied files must retain the copyright and license notice.
- Prefer Astryx's documented source-eject/swizzle flow for a component that needs deep
  ownership. Record the upstream repository, commit/tag, copied paths, local changes,
  and license in `docs/OPEN_SOURCE_RESEARCH.md`.
- Do not assume every repository asset or dependency has the MIT license. Check
  third-party icons, fonts, images, examples, generated files, and package licenses
  before redistributing them.
- Do not use Meta/Astryx names, logos, or wording that implies official endorsement
  for the project's fork or branded components.

### Quality gates

For every new shared component:

- Add keyboard, focus, disabled, loading, error, and responsive states where applicable.
- Add accessible name/role/state coverage and test the primary interaction with a real
  browser when the component uses overlays, focus traps, drag-and-drop, or portals.
- Add unit/component tests for behavior; a successful build alone is not evidence that
  the component is complete.
- Add a small usage example or story for variants and edge states.
- Verify light and dark themes, narrow mobile widths, reduced motion, and long
  localized labels.
- Keep the initial bundle and CSS budget visible; use lazy loading for large feature
  surfaces rather than importing every optional component into the shell.
- Source-copied components and templates using `stylex.create` require the local
  StyleX Babel transform. Loading prebuilt Astryx CSS alone is not enough. Check
  actual development and production renders, not only TypeScript.
- Keep the editor chrome's theme separate from the theme being authored. Preserve
  token/component edits across tab switches, template changes, mode changes and
  iframe recovery. Require confirmation before replacing unsaved theme edits.
- Verify token and component edits against computed styles inside the preview
  iframe, and verify that exported `defineTheme` source contains the same values.
- The local preview must not call business APIs, evaluate edited TSX in the parent
  page, or fall back to executing templates outside the preview boundary. Edited
  source may run only inside the opaque sandbox through the restricted local
  module resolver and self-hosted compiler. Keep the dedicated CSP, import
  allowlist, message validation and retry behavior; do not describe this as a
  complete JavaScript capability sandbox.
- Run `pnpm test`, `pnpm build`, `scripts/verify-theme.mjs` and
  `scripts/verify-template-catalog.mjs` for Playground changes. Preserve source and
  runtime evidence separately; do not label template import as TSX compilation.

### One Codebase, Multiple Styles

- The user explicitly requires switching visual styles without maintaining separate
  page/component implementations. Use a single business component tree.
- Keep **style ID**, **accent ID**, **light/dark mode**, **language** and **density** independent.
  Persist only these nonsensitive UI preferences; do not store tokens, credentials,
  project notes or model output in preference storage.
- `frontend/src/components/ui/themes.ts` owns the product style registry and lazy
  theme loading. `AppTheme` owns theme application; product pages consume semantic
  tokens. The product theme must remain separate from the Theme Editor's draft.
- Map product `--wb-*` variables to Astryx semantic colors/fonts. Do not add a new
  per-theme stylesheet, component branch or hardcoded light/dark palette in a feature.
  Shared layout may vary with density, not with copied page implementations.
- Prefer published theme packages and token overrides; do not copy fonts or load
  remote font URLs automatically. Declare fallback fonts and preserve notices.
- Keep mybot's default style and the user-authorized Zira palette selectable.
  A theme-specific token adapter is allowed; theme-specific business components
  and importing Zira's React/Radix/Tailwind implementation are not.
- Share comfortable/compact/touch defaults through the UI density context. Controls in
  the same toolbar must follow one size profile; a feature-local override needs a
  concrete compact-chrome or accessibility reason. Verify rendered geometry, not
  just preference values. Do not force every control into a fixed CSS height.
- Keep filter collapse at the filter heading and table sort/visibility within the
  table's upper-right tools. The inspected Zira commit and the user's screenshot
  differ; record that distinction rather than claiming an exact source match.
- Theme loading must handle stale requests and failure without remounting forms,
  losing current filters or resetting a running task. Switching appearance must
  never call a model, mutate a Run or change authorization.
- Verify at least three styles, both modes, persistence, keyboard selection,
  narrow-screen layout and reduced motion. Compare computed colors/font/radius,
  not merely a selected radio state. Retain user input across appearance changes.
- Use Badge for domain status, AvatarStatusDot for explicitly named Agent state,
  AvatarGroup/Overflow for real Run membership, Skeleton only during loading, and
  CommandPalette groups for actual navigation. Do not invent users, online devices,
  progress percentages or model capability from these presentation components.

### Zira-Derived Product Rules

The user authorized learning the complete frontend structure and the relevant
product patterns, not replacing Astryx. Apply these rules to mybot:

- Keep a stable hierarchy: global navigation/search, page context and primary
  action, query/filter controls, result toolbar, results and optional inspector.
  Global quick find belongs in the top bar; mobile uses the same command source.
- Reuse project-owned PageHeader/toolbar/result-state patterns as repetition grows.
  Do not copy a new shell or whole page for each view, theme or template.
- Keep query drafts separate from committed queries. Shareable query/view/sort/
  pagination state belongs in the URL, with refresh/back/forward behavior.
  Appearance preferences and modal state are not query state.
  The Basic query row edits text/project/status locally; Search or non-composing
  Enter commits the entire finite candidate in one URL patch and resets page.
  Side-scope navigation remains immediate and rebases only its changed field.
  Admitted `traverse` restores the whole committed Basic/JQL snapshot, while
  presentation pushes preserve pending edits. Do not infer the reason from URL
  differences or add a competing popstate listener. Keep clear as an icon in the
  original query row, enabled even for draft-only edits. No draft is durable or
  part of model authorization.
  Structured `projects/states/sorts` use strict JSON schemas, not an expanded
  handwritten JQL grammar. Multi-values are OR within a field and AND across
  fields; empty means all. Malformed definitions or unavailable selections must
  block results, not silently return unfiltered data. Fixed route scope wins.
  Keep Task-latest and Run-history denominators distinct. Task column order and
  up-to-three sort rules are not automatically Run-table or Board sort support.
  Preserve legacy single-value links and the documented writer precedence in
  ADR-0009. Settings Apply must not block its own synchronous URL commit.
  Private SavedViews capture only committed Task query/applied table settings.
  Load copies a snapshot, not an ID-bound live query; protect dirty candidates.
  Preserve CAS, stable IDs and unknown-write locks. Reading current resource state
  is not an exact mutation receipt or a durable operation journal. See ADR-0010.
  Render long view feedback below the page heading, not beside its title.
  Astryx busy required dialogs use `alertdialog`; adaptive touch actions use
  dialog/buttons. Browser tests must follow both actual presentations.
  The server task-query contract (ADR-0011/0012) has a bounded response and explicit
  `unicode-natural-v1` ordering. The frontend consumes it only when Bootstrap
  explicitly advertises `task_query: true`; missing/false keeps the legacy path,
  while an advertised endpoint failure must not silently fall back.
  Server ordering is not Intl.Collator equivalence. The browser validates DTOs
  and request identities, then preserves server rows without sorting or slicing
  them again; it does not recompute Unicode text/order as response admission.
  Selected-task detail/history (ADR-0013) likewise requires explicit `task_detail`
  capability, uses one read-only snapshot and keeps history paging separate from
  the list URL. Do not claim Bootstrap or global transfer has shrunk merely because
  a consumer migrated. Keep all remaining consumers and measurements explicit.
  A response snapshot is not a cross-page cursor or an immutable result-set lease.
  Astryx disabled buttons may use `aria-disabled`; focus restoration must exclude
  both native and ARIA-disabled controls and must not steal user-moved focus.
  Workspace counts/search (ADR-0014) also require explicit capabilities.
  Task-latest counts and all-Run counts have different denominators; failed counts
  stay unknown rather than zero. Quick find reports bounded domain results with
  total/has-more, keeps local navigation separate, and does not browser-filter
  authoritative server matches. Astryx can retain optimistic old options, so
  cancel/discard obsolete searches and block stale click/keyboard selection before
  palette close. Provider calls and mutations never inherit this GET retry path.
  Project references (ADR-0015) require their own explicit capability. A bounded
  page is not the full Project catalog: hydrate selected IDs independently, keep
  missing distinct from off-page and read failure, and use workspace totals rather
  than page sums. Minimal references cannot stand in for full Project form data.
  Directory drafts/pages are local panel state, separate from the task query.
  Mount only the currently presented global navigation; hidden mobile/desktop
  copies must not create duplicate directory read consumers.
  Project query selection (ADR-0016) keeps picker candidates and committed-ID
  hydration separate. A picker change never commits the task query. Validate
  SavedView project references freshly before applying, bind that read to the
  current query/draft/table baseline, and clear obsolete navigation on failure.
  Only that validation stage locks navigation; legacy detail reads still cancel
  on scope change. Confirm final URL admission before changing local table/draft
  state or announcing a loaded snapshot.
  Project resources (ADR-0017) have independent detail/query capabilities.
  Full Project routes and summary pages must not synthesize missing fields from
  references. Keep summary notes absent and detail fields exact. A transient
  same-ID refresh may retain validated content only with explicit stale feedback;
  missing/forbidden/401 must hide or clear it. Task creation requires an explicit
  project candidate and a fresh exact-ID read before POST; no Bootstrap first-item
  default when references are supported. That read is not a lease or write retry.
- Run history (ADR-0018) requires explicit `run_query`. It counts every joined
  historical Run by its own status, independently of Task-latest state. The
  minimal DTO is server ordered; never sort, filter or slice the admitted page
  again. `runOrder` is a single Run-specific URL sort, separate from Task
  `order/sorts` and SavedViews. Invalid Run order blocks remote Run results only.
  Preserve column/density preferences across page remounts; restore pager focus
  only when the user has not moved it, excluding native and ARIA-disabled actions.
- Task board (ADR-0019) requires explicit `task_board`: one read-only snapshot
  returns five column totals and independent fixed20 pages, at most100 full Task
  cards. It classifies Task-latest, not historical Run failures. Preserve server
  order, exact Task/Run actions and explicit query failures. `boardPages` is
  independent of table sort/page size; query edits reset it, presentation changes
  retain it. Preserve original command intent before fixed-project scope injection.
  Board reads/paging never write Run status or execute a model.
- Inbox (ADR-0020) reuses explicit `task_query` and independently `task_detail`.
  Its fixed pending/attention adapter, `inboxType` and20/50/100 pagination are
  distinct from general Task/Run/Board presentation state. Unsupported query
  conditions fail closed. Detail reads occur only for a presented selection;
  advertised failures cannot fall back to Bootstrap/list details. Fresh details
  outside the current Inbox are not actionable. Retain explicit stable-ID
  selection on same-key refresh and never substitute another task after removal.
- Task workspace (ADR-0021) owns the stable encoded Task route and goal/work/review
  views. Reuse full Task/Project read contracts and the existing RunWorkspace;
  bind embedded Run responses to exact Task/Run/Project identity before actions.
  Abort checks precede every response state write. Hard401/403/404 refresh errors
  clear private Run content and controls. Creating a Task navigates without
  automatic context preview; Arrange and Run consent remain separate actions.
  A confirmed saved form can release its own navigation blocker while retaining
  duplicate-submit protection. Successful Task-started Runs stay in that Task.
- Route and query listeners must consult the shared navigation admission guard.
  Restoring a dirty form's URL in a capture listener alone does not preserve the
  form. One navigation event must share one decision across consumers; confirmed
  replay must not consume approval twice. Unauthorized cleanup bypasses draft
  protection. Use `pushWorkbenchNavigation` and the canonical
  `mybot:navigation` event, not independent hash assignments/listeners.
  Managed entry metadata contains only session/index/key/maxIndex. Native
  Navigation state and classic History state are separate: preserve both original
  stores and mirror only the owned stamp. Supported browsers use absolute native
  entry targets; the relative History fallback is not certified for interleaved
  traversals. Unknown/unmanaged/cross-document targets must not be guessed or
  overwritten. See ADR-0008 and retain its explicit browser limits.
- URL parameter support is not query-language support. The current JQL compatibility
  whitelist is sorting only; unsupported `assignee/currentUser`, grouping and
  expressions must fail explicitly, not silently return unfiltered data.
  Full JQL requires a real identity/field model and proven parser/query contract.
- List selection, row activation, inspector selection and current page are independent
  states. "Select this page" must not claim to select an entire result set.
- Trace every visible command and shortcut through its label/icon, handler, actual
  API/local side effect, prerequisites, pending state, outcome and affected read
  models. A copy-link command must not trigger another action. No-op menus,
  disconnected page-size options, TODO lifecycles and success-only announcements
  are not adopted capabilities.
- List, table, board, inbox, hierarchy, overview and detail must share domain read
  models. Historic failed attempts are not current task failures after successful
  recovery; counts must state whether they count tasks, runs or calls.
- Distinguish initial loading, refreshing/stale data, network failure, forbidden,
  missing object, true empty and unsupported capability. Never turn a failed read
  into a success-shaped empty array, fake record or zero metric.
- Keep outcome state structured. An error string must never be rendered with a
  success tone just because it shares a notice variable. API boundaries must reject
  malformed/error envelopes and missing required DTOs even when HTTP is 2xx.
- Keep server state, nonsensitive UI preferences and unsaved form drafts separate.
  Do not introduce a state library solely because Zira uses it.
- After a successful mutation, refresh/invalidate all affected read models. Do not
  announce success before confirmation. Abort or discard stale reads; 401/logout
  must clear private projections and outstanding requests.
- Build cache keys and invalidation prefixes from one factory/contract and test the
  impact graph. Do not swallow 401/403/Abort in reference hydration or substitute a
  mock user/project/default state when production references are unavailable.
  Missing identity or capability metadata must not imply owner or permission.
- Never transfer a generic read-retry policy to model requests or mutations.
  Provider timeouts may have unknown outcomes/costs; manual retry requires stable
  request IDs, budget and replay consent, preserving original history.
- Recovery first registers a server-persisted prepared candidate without execution
  consent, then explicitly executes that exact request ID. Reconcile by GET after
  response loss/reload; never infer a receipt only from a child Run or changed
  source status. Unknown locks cannot be abandoned, bypassed with another ID or
  routed through legacy controls. Applied means control applied, not model
  success, cost settlement or successful UI refresh. Candidate replacement must
  reconcile the new ID, and a later legal recovery needs a fresh snapshot and
  fresh consent. Validate full ledger identity consistency even when its history
  is truncated. See ADR-0007.
- Forms validate locally and at the API boundary, show field/action errors, preserve
  input on failure and block duplicate submission. Dependent field/resource changes
  invalidate prior consent. Unsupported required metadata is an error, not a field
  to silently omit.
- A board move is not a Run status write. Future execution actions require a legal
  transition, capability/permission checks, cost preview, concurrency/timeout limits,
  idempotency and confirmed outcome. Optimistic presentation is not execution evidence.
- Workflow edits, saved drafts, immutable published versions and running snapshots
  are separate. Refetch/theme switches must not overwrite dirty edits; publishing/
  reloading requires explicit scope and conflict handling.
- Scope editors to object ID plus baseline revision/hash and draft. Validation,
  impact analysis and consent must bind the exact saved candidate and dependencies;
  changes invalidate them. Dirty/unknown/sample definitions must not reach dangerous
  real writes. A 409 is not resolved by dropping the revision or auto-retrying.
- Preserve unknown metadata/configuration round-trip or reject the edit; do not
  silently drop it or coerce an unknown permission/subject into a known type.
  Whole-object replacement, local draft application and immediate per-item writes
  need distinct contracts. Configuration saved, binding applied, capability tested,
  execution finished and notification delivered are separate facts.
- Keep keyboard shortcuts scoped, IME-safe and inactive for unrelated text editing.
  Reuse Astryx focus/overlay behavior. Mobile inspectors become drawers/full views;
  only the result/canvas region may scroll horizontally, not the document.
- Record evidence source, unit, denominator, time window and unknowns for metrics.
  Do not borrow default-zero statistics, static recent items, fabricated actors,
  silent fallback, unverified optimistic rollback or disabled business placeholders.
- Zira README/comments and routes include historical/placeholder material. Track
  structure scan, source observation, mybot implementation and tested behavior
  separately. Do not claim all Zira functionality is audited or locally integrated.

### Decision rule

- New reusable React design-system capability: **Astryx first**.
- Missing accessible primitive: **Radix or a documented local primitive**.
- Page layout and one-off composition: **Tailwind or project CSS**.
- Workbench-specific interaction: **project-owned component**, reusing Astryx/Radix
  primitives underneath.
- Existing `web/` vanilla UI: it is the migration source and must remain usable until
  each replacement slice is verified. New React/Astryx work is allowed under the
  migration ADR; do not delete the vanilla implementation wholesale before an
  equivalent replacement and rollback point exist.

## Research And Records

- Record upstream repository identity, commit, inspected paths, findings, and gaps in `docs/OPEN_SOURCE_RESEARCH.md`.
- Source presence and upstream documentation are not local integration or test evidence.
- Keep `CONTINUE.md` current when requirements, decisions, evidence, or next steps change.
- On each completed frontend slice, update `docs/PROGRESS_LOG.md`, the template
  adoption map and browser evidence. Report unverified behavior and existing build
  warnings. Do not change the 119-item ledger counts just because more templates,
  screenshots or tests were added.
- Documents under `docs/archive/` are superseded, not active requirements.

## Boundaries

- Do not read sibling `.env` files, credential stores, or database contents.
- Do not start external services, paid model calls, or deployment actions as part of design research.
- Keep sibling projects unchanged unless the user explicitly requests edits there.
