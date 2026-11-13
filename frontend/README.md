# mybot React + Astryx frontend

This is the first migration surface for the live `web/` application. It runs in
parallel with the vanilla entry until the migration slices are accepted.

## Run

Requires Node.js 22.13+ and pnpm. Dependencies are locked; Astryx Core and
all seven themes use 0.7.13.

```bash
pnpm install
pnpm dev
```

The Vite server runs at `http://127.0.0.1:5173/` and proxies `/api` to
`http://127.0.0.1:4180` by default. Override the backend with
`MYBOT_BACKEND_URL`.

## Routes

- `#workbench`: responsive workbench shell and real bootstrap summary
- `#chat`: read-only AI Chat + Artifact view backed by a persisted Run
- `#templates`: Playground with source, complete Theme Editor and local previews
- `preview.html?preview=1`: dedicated, opaque-origin preview document; not a business page

## Theme Editor

Base Styles, Components and Advanced are adapted from the upstream docsite.
Colors (including separate light/dark branches), typography, spacing, radii,
element sizes, motion, component tokens and custom CSS overrides update the
iframe immediately. Seven presets, replacement confirmation, reset and theme
source export are supported. Editor state stays mounted across view switches.
StyleX source is compiled with the Babel plugin; the runtime component library
continues using its prebuilt CSS.

The preview runs in a dedicated opaque iframe with `sandbox="allow-scripts"` in
both dev and production, and cannot connect to `/api`, external services or
submit forms. Monaco edits are compiled by the self-hosted TypeScript runner
inside the iframe; valid edits update the preview, while compile/runtime errors
stay in the iframe lifecycle and expose a retry action. Targeting can select
allowlisted Astryx Core instances and the property panel is generated from the
pinned Core PropDoc registry (162 components). Supported literal props write
back into source before recompiling; callback, slot and expression props remain
read-only. Imports remain restricted to the local allowlist; this is not a
general-purpose JavaScript sandbox.

The preview entry is code-split from TypeScript, Core, theme, icon and chart
runtime chunks. The entry stays small, while the complete compiler/runtime
dependencies remain available when a preview is built.

Fonts are local/fallback only; no external font download happens automatically.
Payment logo fixtures use offline labels instead of blocked third-party URLs.
Source and copyright details: `vendor/astryx/NOTICE.md` and `vendor/astryx/LICENSE`.

## Local Astryx templates

The official Astryx CLI generated 58 page templates under
`src/templates/generated/`. The manifest and dynamic loaders are generated
alongside them. To refresh the local copies after an Astryx upgrade:

```bash
pnpm exec astryx template --json --type page
```

The current generated source is kept locally under the MIT license. Templates
must be rebranded and connected to mybot facts before becoming product flows;
the catalog preview is a reference surface, not an execution claim.

## Checks

```bash
pnpm typecheck
pnpm test
pnpm build
```

Browser regression uses an independently installed Playwright and Chrome:

```bash
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
BROWSER_EXECUTABLE=/usr/bin/google-chrome \
MYBOT_FRONTEND_URL=http://127.0.0.1:5173/ \
node scripts/verify-theme.mjs
```

Run `scripts/verify-template-catalog.mjs` with the same variables for all
58 local templates. The scripts block business and external requests and write
screenshots/JSON to `/tmp` by default. They do not start models or use runtime data.
Production verification uses `pnpm preview` and the URL set in `MYBOT_FRONTEND_URL`.
