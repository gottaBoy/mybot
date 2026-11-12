# Project Instructions

## Resume

Read `CONTINUE.md` before making assumptions about the project. Then read the latest ADR referenced there and the document relevant to the requested work.

## Product And Phase

- Target: an AI workbench for R&D teams, initially validated by one developer.
- Current phase: implementation authorized by the user on 2026-11-04.
- First slice: single-user, read-only project research, persistent runs/events, model routing and responsive Web UI.
- Preserve the static review artifacts. The working application lives separately in `workbench/` and `web/`.
- No shell execution, code writes, deployment, automatic paid calls or sibling credentials. Providers run only when the user explicitly starts/tests a configured connection.
- Preserve the distinction between accepted requirements, proposed designs, source observations, and tested behavior.

## UI

- Create an original UI. Do not copy or borrow visual style, layout, or interaction design from sibling projects under `/home/my/workspace/ainfra`.
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
- Use `pnpm exec astryx template --list --type page` and
  `pnpm exec astryx template <id>` as the source-of-truth workflow for local
  template reproduction. Keep generated references under the frontend template
  boundary, expose them through an on-demand catalog/preview, and do not import all
  templates into the product shell or claim that a generated preview is connected to
  mybot business data.

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
- Documents under `docs/archive/` are superseded, not active requirements.

## Boundaries

- Do not read sibling `.env` files, credential stores, or database contents.
- Do not start external services, paid model calls, or deployment actions as part of design research.
- Keep sibling projects unchanged unless the user explicitly requests edits there.
