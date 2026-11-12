# REA: Astryx Theme Editor And Playground

- Date: 2026-11-12 (Asia/Singapore).
- Method: read-only comparison of the local source trees. This is a capability
  inventory and risk review, not a visual acceptance or a claim of full parity.
- Upstream repository: `https://github.com/meta/astryx`.
- Upstream local path: `/home/my/workspace/ainfra/mywork/astryx`.
- Upstream commit: `5770e5b197cf80d5a824667c23046887cc8fa0f5`.
- mybot path: `/home/my/workspace/ainfra/mywork/mybot`.
- Package baseline: `@astryxdesign/core` and `theme-neutral` 0.7.13,
  React 19, StyleX 0.19, Vite 6. The published package and the upstream
  workspace are different baselines; copying docsite code does not prove
  compatibility with the installed package.
- Snapshot: the initial audit below describes the source read before the
  parallel implementation changes. The delivery verification section must name
  any subsequent fixes and actual test evidence; old percentages and old build
  claims in `REA_ASTRYX_PLAYGROUND_COMPARE.md` are not current acceptance.

## Source Map

Upstream paths, relative to the Astryx repository:

- `apps/docsite/src/app/playground/PlaygroundClient.tsx`: editor state, template
  and theme selection, export, URL, preview status, targeting and resizing.
- `apps/docsite/src/app/playground/PreviewStage.tsx`: one persistent iframe,
  desktop fill, fixed 402 x 874 phone viewport and preview-only fullscreen.
- `apps/docsite/src/app/playground/usePreviewFrame.tsx` and `previewChannel.ts`:
  fresh iframe generations, nonce attestation and MessageChannel lifecycle.
- `apps/docsite/src/app/playground/themeEditor/ThemeEditor.tsx`: three theme
  panels and composed-theme state.
- `apps/docsite/src/app/playground/themeEditor/BaseStylesPanel.tsx`,
  `ComponentTokensPanel.tsx`, `RawTokensPanel.tsx`, `ColorSwatch.tsx`,
  `TokenRow.tsx`, `constants.ts` and `helpers.ts`: controls, token categories,
  component mappings, scale expansion and theme export.
- `apps/docsite/src/app/playground/preview/page.tsx`, `runner.ts` and
  `ErrorBoundary.tsx`: compiler bootstrap, evaluated TSX, rendering and errors.
- `apps/docsite/src/app/playground/previewThemes.ts`: registered selectable
  themes, not just a light/dark switch.
- `apps/docsite/src/app/playground/propertyEditor/`: instance annotation,
  element targeting and property edits back to source.
- `apps/docsite/next.config.mjs`: route-specific framing and script restrictions.
- `apps/docsite/e2e/playground-preview-isolation.spec.ts` and
  `apps/docsite/src/__tests__/playground-preview-channel.test.ts`: upstream
  isolation/recovery test references. They are not mybot test results.

mybot paths, relative to this repository:

- `frontend/src/TemplatesPage.tsx`: Playground shell, source textarea, menus,
  hash restoration and template selection.
- `frontend/src/theme-editor/`: copied theme-editor implementation.
- `frontend/src/playground-preview/{protocol.ts,SandboxTemplatePreview.tsx,PreviewRunner.tsx}`:
  local allowlisted-template preview.
- `frontend/src/playground-code.ts`: browser compression and local hash format.
- `frontend/src/templates/{template-loaders.ts,generated/}`: 58 generated
  template modules and complete source strings.
- `frontend/src/{App.tsx,main.tsx,styles.css}`, `frontend/vite.config.ts`,
  `frontend/package.json`: route, entry, global CSS, build and dependency boundaries.
- `workbench/app.py:73`: backend request boundary and current production CSP.

## Findings

### P0: StyleX Source Is Not Compiled

At the initial snapshot `frontend/vite.config.ts` only used `react()`, with no
StyleX transform or extraction. The installed StyleX implementation at
`frontend/node_modules/@stylexjs/stylex/lib/cjs/stylex.js:135` throws
`Unexpected 'stylex.create' call at runtime. Styles must be compiled by '@stylexjs/babel-plugin'.`

This is more than a spacing difference:

- All copied theme-editor panels call `stylex.create` at module evaluation.
  Importing the real editor without adding the build transform can break the
  whole Playground before React can display a runtime boundary.
- Fifteen generated templates also call `stylex.create`: `canvas-editor`,
  `dashboard-alert-rail`, `dashboard-cohort-funnel`, `dashboard-comparison`,
  `dashboard-progress`, `dashboard-scorecard`, `kanban-board`,
  `settings-dialog`, `shell-top-nav`, `table-collapsible`, `table-comparison`,
  `table-filter`, `table-inbox`, `table-tree` and `work-item-detail`.
- `tsc` and Vite transpilation alone do not execute these lazy modules, so a
  successful build is not sufficient evidence that these templates work.

Gate: development and production previews must load all fifteen affected
templates and the real Theme Editor with no StyleX runtime error, and computed
styles must demonstrate that the generated CSS was applied.

### P1: The Copied Theme Editor Is Not Yet The Active Editor

At the initial snapshot `TemplatesPage.tsx:159` defined a second, static
`ThemeEditor`. Its Components/Tokens tabs had no state or actions. The copied
`frontend/src/theme-editor/ThemeEditor.tsx` had the upstream implementation but
was not imported by the page. Source presence must not be called integration.

The preview props accepted only `templateId`, `mode` and `fallback`.
`protocol.ts` had no token or component-override payload; `PreviewRunner.tsx:146`
always used `neutralTheme`. Therefore editing a copied editor in isolation
could not update the iframe.

Gate: use the actual editor, keep its state mounted across Code/Theme tab
switches, send structured token/component data, reconstruct with `defineTheme`
inside the iframe and prove the rendered preview changes.

### P1: Preview Success Was A Load Signal, Not A Render Signal

`PreviewRunner.tsx:70-94` posted `mybot-preview-rendered` immediately after
`setComponent`, before React committed the component. There was no local
ErrorBoundary. A component can import successfully, throw during render and
still leave the parent showing success.

The parent used an 8-second readiness timeout, but had no per-build watchdog
after readiness. `preview-clear` also did not invalidate a pending import.

Gate: post completion from a commit marker under a resettable error boundary;
report runtime errors; correlate responses with the current request/generation;
cancel superseded work; bound startup/build waits; expose a genuine rebuild
action. "Building local template" must not be presented as TSX compilation.

### P1: Prototype Keys Bypassed The Template Allowlist

Both `PreviewRunner.tsx:19` and template hash initialization used
`id in templateLoaders`. `constructor`, `toString` and `__proto__` are inherited
keys, not approved templates. A crafted hash can select one and reach a
non-loader call or an uncaught synchronous exception.

Gate: use `Object.hasOwn`, validate IDs against the manifest, validate mode as
`light | dark`, catch both synchronous and asynchronous loader failures and
test prototype-key hashes explicitly.

### P1: Isolation Claims Exceeded The Actual Boundary

- `SandboxTemplatePreview.tsx:22` used
  `allow-scripts allow-same-origin` in development. That iframe can access
  parent DOM/storage and same-origin APIs. The visible claim that the preview
  has no parent/storage access was false for the supplied development URL.
- `SandboxTemplatePreview.tsx:143` rendered the imported template in the
  parent tree as a fallback after iframe failure. This abandons isolation
  precisely when the isolated path fails.
- The nonce handshake is a useful capability boundary, but the preview
  adopted the port and sent ready without waiting for its own initial
  document load. Upstream deliberately waits before running previewed code
  so the first load event cannot be confused with code-triggered navigation.
- Vite had permissive CORS and no preview-specific `frame-ancestors`, script,
  form or network policy. Upstream has route-level headers; its development
  exception is not a reason to give mybot's local application broad authority.

Current previewed modules are repository-controlled, not user-evaluated TSX,
so this is not evidence of an existing arbitrary-source exploit. Before
enabling arbitrary TSX, same-origin execution and parent-tree fallback are P0
blockers. Do not silently add `unsafe-eval` to the application's global CSP.

Gate: no in-parent fallback; opaque sandbox in the tested preview mode;
same-site framing restriction; explicit preview-only script policy; actual
DOM/storage/API access probes; navigation/reload recovery with a new iframe.

### P1: Theme Messages Need Runtime Validation

TypeScript message unions do not validate structured-cloned input. Initially
the child only checked `type`/`templateId`, and the parent read message fields
without a shape guard. New theme data must not add an unbounded arbitrary
object channel.

Required local contract:

- Plain records only; reject prototype keys, arrays where maps are expected,
  non-string token values, non-finite numbers and invalid modes.
- Limit total payload size, key count, string lengths and component-map depth.
- Validate token names and component style maps before `defineTheme`.
- Send serializable token/component data, not callbacks or package objects.
- Ignore stale request IDs, stale generations and unsupported message types.
- Reject malformed input without crashing or changing the last valid theme.

Raw CSS values and freeform component CSS intentionally have expressive power.
An opaque iframe is not a network firewall: CSS `url()` and code requests need
an explicit network decision. Do not promise "offline" or "no API access"
without request-level evidence.

## Capability Comparison

| Capability | Upstream behavior | Initial mybot source observation |
| --- | --- | --- |
| Base styles | Palette; heading/body fonts; type ratio/size; corner radius; spacing; element size; duration | Copied controls exist, but active page still renders static rows |
| Scale presets | Unified presets plus per-scale controls; concentricity warnings | Same copied algorithms; no active integration |
| Color modes | Edits the selected branch of `light-dark()` and preserves the other branch | Copied ColorSwatch supports this; must prove iframe propagation |
| Components | Component-token mappings and freeform CSS property overrides | Copied panel exists; no preview payload |
| Override order | Seeded component map, token-derived map, then freeform overrides, deep merged | Same copied helper; no active rendered result |
| Advanced tokens | Colors, spacing, radius, typography, size, elevation, duration, easing with previews | Same copied panel; not active |
| Initial theme | Registered theme selection seeds tokens and component overrides; key remounts editor | Only Neutral Light/Dark menu items; no theme registry |
| Theme persistence | Custom theme remains the fact source across mode/view switches and iframe recovery | Only mode survives locally; editor state not connected |
| Theme export | Current composed tokens and component selectors exported as `defineTheme` TS | Export downloads current TSX only |
| Fonts | Loads configured Google Fonts for editor and preview | External import intentionally removed; labels state local/fallback; exact font parity is not established |
| Source editor | Monaco, type declarations, formatting and TSX source | Textarea plus regex highlighting; no diagnostics, completions or real formatter |
| Code preview | Self-hosted TS compiler and scoped module resolver | Fixed allowlisted template imports; edited source does not run |
| Small examples | Measures the rendered root and centers a small example | Runner adds 24px to every template; Welcome is not measured/centered equivalently |
| Full-page templates | Definite fill dimensions with no blanket outer padding | Fixed min-height and universal runner padding alter layout |
| Phone preview | Fixed 402 x 874 CSS px on desktop; full bleed on mobile | Width min(390px, 100%), min-height 720px and extra padding |
| Fullscreen | Preview-only fixed wrapper, explicit exit; preserves iframe | Browser fullscreen on whole Playground root |
| Editor resize | 440px default, 340-760px limits, iframe interaction disabled while dragging | Fixed grid column; no resize handle |
| Targeting | Instance annotation, overlay, Properties popover, prop change back to source | Not implemented |
| Templates | Full source selection and confirmation before discard | 58 full sources available; custom confirmation banner and fixed module preview |
| Share/hash | Compressed code hash, canonical share URL | Compression/restoration exists; local `#templates?code=` format |
| Build status | Startup/compiler/build/error/rebuild lifecycle | Import lifecycle only, with premature success |
| Isolation | Nonce + port + fresh frame; production opaque origin | Basic nonce/port exists; development same-origin and parent fallback weaken boundary |

## Routes, CSS And Assets

### Routes And API Access

- `App.tsx` recognized `#code=` and `#templates?...`; `playground-code.ts`
  changed the current hash with `replaceState`. URL codecs and application
  route parsing must share a contract.
- Code restoration was asynchronous while the 400ms URL writer was already
  armed. Large compressed links can race the default source write. Hash
  restoration also needs a latest-request guard.
- A `template` parameter and restored code can disagree because the preview
  selects a fixed module instead of compiling the restored source.
- `WorkbenchApp` fetched `/api/bootstrap` on mount even for `#templates`.
  Template inspection should not require or fetch workbench business data.
- `?preview=1` bypassed WorkbenchApp, which avoids that bootstrap fetch inside
  the runner, but a query flag is not itself a trust boundary.
- Backend `workbench/app.py` rejects cross-site API requests and protects
  writes. Do not weaken these protections to make a preview fetch succeed.
  The current backend global CSP also says `frame-ancestors 'none'`, so a
  production integration needs a dedicated preview response policy rather
  than assuming Vite preview behavior equals FastAPI deployment behavior.

### Dark Mode And CSS Ownership

- The global stylesheet fixed `:root {color-scheme: light}` and hard-coded
  light body colors. Playground used a separate `--pg-*` dark palette.
  Astryx Theme synchronizes root `data-theme`, but CSS specificity/order and
  native controls still require computed-style verification.
- The theme under edit should affect the preview, not unexpectedly resize or
  recolor the editor chrome. Keep chrome mode and preview theme ownership
  explicit.
- Some templates include nested Theme providers, for example
  `settings-dialog.tsx` and `canvas-editor.tsx`. These intentionally override
  an outer preview theme in their own region. Such regions are not evidence
  that the theme bridge failed; tests must distinguish nested-provider scope.
- Blanket runner padding, min-heights and phone rounding are local changes,
  not upstream design-token differences.

### Licenses And Visual Assets

- Copied theme-editor and generated template files retain Meta copyright
  headers. At the initial snapshot no frontend MIT full-text notice or
  dedicated third-party notice was found. `OPEN_SOURCE_RESEARCH.md` had no
  Astryx commit/path/adaptation record.
- Keep the upstream MIT permission notice with substantial copies, and record
  this commit plus copied paths and modifications. This report is engineering
  provenance, not a substitute for the license text.
- Generated Gallery/Product/Course templates commonly use the same
  `data:image/svg+xml` placeholder instead of the official example images.
  Their files are local, but visual asset parity is not complete.
- `payment-form.tsx:509-558` references PayPal, Google Pay and third-party
  credit-card logos over the network. No blanket asset-license assumption is
  justified by the repository MIT license.
- Inter and the other named fonts were not found as bundled frontend assets.
  Do not claim exact typography when the chosen font is a system fallback.

### Bundle

- Template modules are lazy, but
  `import.meta.glob(..., {eager: true, query: '?raw'})` embeds all 58 source
  strings into the initial JavaScript. `App.tsx` statically imports both
  Playground and Chat.
- The pre-existing, not freshly built, `frontend/dist` inspected during this
  audit contained a 2.9 MiB main JS file, a 312 KiB CSS file and a 21 MiB
  directory including source maps. These are an artifact observation, not
  this delivery's build measurements or transferred/gzip sizes.
- Gate: record fresh raw and compressed entry/chunk sizes, lazy-load the
  Playground/editor and source strings, and ensure compiler/Monaco/theme
  registries do not inflate the normal workbench route.

## This Iteration's Targets

1. Make the real three-panel Theme Editor executable with correctly compiled
   StyleX and a package-compatible API.
2. Connect tokens and component overrides to the isolated preview; preserve
   state through mode/view changes and iframe recovery.
3. Add theme export/reset, reliable build/error/rebuild state and invalid-input
   rejection.
4. Fix the known runner padding, viewport, dark-mode and parent-fallback
   problems without changing backend/model/execution permissions.
5. Record copied-source provenance and keep deliberate differences visible.

The following remain separate unless implementation and tests explicitly
demonstrate them: Monaco; arbitrary TSX compilation; full official theme
registry; targeting/property editor; all template visual assets; exact
preview-only fullscreen; all-template keyboard/drag/wizard behavior. Listing
a component or template is not acceptance of its interactions.

## Verification Gates

- `pnpm typecheck`, a fresh production build and focused behavior tests pass.
- Browser checks at 1440, 1024, 768, 390 and 320 CSS px: no horizontal page
  overflow, text/control collisions, clipped tabs or inaccessible menus.
- Light and dark: set an accent, spacing/radius scale, a component override
  and an advanced token; assert iframe computed styles, not just parent state.
- Toggle Code/Theme and light/dark; switch templates; reload/navigate the
  iframe; confirm accepted theme edits remain and no stale message wins.
- Export a theme with quotes, backslashes, nested component selectors and
  custom tokens; parse/typecheck the downloaded source and reproduce its
  computed styles.
- Load all 58 templates in development and production; inspect browser errors,
  visible output and runtime interactions, especially the fifteen StyleX
  templates, nested Theme examples and remote-asset examples.
- Invalid template hashes, malformed theme messages, prototype keys,
  oversized/deep payloads and stale request IDs fail closed with a usable
  error/rebuild path.
- A render-throwing component is reported as an error and can recover; it
  never produces a lasting success state.
- Isolation probes cover parent DOM, cookies, local/session storage, API
  requests, foreign embedding and reload/navigation replay. Passing a nonce
  unit test alone is not this evidence.
- Verify focus order, keyboard tabs/menu actions, native color input names,
  overlay focus return and reduced motion; record remaining Safari/real-device
  gaps explicitly.
- Record fresh build sizes and inspect initial requests on the workbench route.

## Delivery Evidence

This document's initial audit did not run the changing implementation or
rebuild the application. It did read the actual installed StyleX runtime,
compare the copied theme panels against the fixed upstream commit, inspect
the message/routing/CSS/API source and inspect the pre-existing dist sizes.
The implementing agent must append the final test commands, evidence paths,
resolved findings and remaining differences before claiming this iteration
is accepted.

## Delivery Verification (2026-11-12)

Implementation in `/home/my/workspace/ainfra/mywork/mybot/frontend` now includes:

- `src/theme-editor/`: copied/adapted Base Styles, Components and Advanced panels,
  including color branch editing, opacity, presets, scale controls, component token
  mapping, freeform overrides, and safe theme-source serialization.
- `src/playground-preview/`: opaque production sandbox, nonce + MessageChannel,
  message/theme validation, error boundary, stale-load guards, build timeout and retry.
- `src/playground-themes.ts`: seven pinned Astryx theme packages and guarded preset lookup.
- Vite StyleX Babel transform and two HTML entries (`index.html`, `preview.html`).
- `vendor/astryx/LICENSE` and `vendor/astryx/NOTICE.md` with upstream commit and
  copied/generated-source provenance.

Commands and evidence:

```text
pnpm typecheck                         PASS
pnpm test                              PASS (66 tests)
pnpm build                             PASS (production multi-entry build)
node scripts/verify-theme.mjs          PASS (13 browser checks)
node scripts/verify-template-catalog.mjs PASS (58/58 templates)
.venv/bin/python -m pytest -q          PASS (244 tests, 1 existing warning)
```

Browser verification used Chrome with API and external requests blocked. Theme checks
covered Base Styles numeric changes, component override add/remove, Advanced color edits
against iframe computed style, light/dark branch preservation, theme replacement cancel/
confirm/reset, theme export, mobile tabs, no horizontal overflow, and preview error retry.
Template catalog checks covered all 58 generated templates, opaque iframe IDs, visible DOM,
no uncaught page errors, and no business/external requests. Payment template remote payment
logos were replaced with offline text labels so CSP does not leave broken image states.

Remaining intentional gaps:

- The editor is a textarea/highlight editor, not Monaco.
- Edited arbitrary TSX is not evaluated. The sandbox only loads allowlisted generated
  templates; this is intentional until a separate TypeScript compiler/runtime security
  slice is approved.
- Full targeting/property editor and exact upstream preview compiler are not implemented.
- Build output still reports a large template/playground chunk; the templates are lazy,
  but the editor/runtime dependency graph remains substantial.
