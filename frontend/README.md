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

## Product Workbench

The default React entry now uses `src/workbench/`: persisted project/task forms,
run lists, snapshot/role/resource confirmation, model and backend configuration,
and a lazy Run workspace with stages, calls, artifacts and audit. UI primitives
are wrapped in `src/components/ui/`. English/Chinese and light/dark preferences
persist locally; credentials do not.

The integrated surfaces include `#overview`, `#inbox`, `#hierarchy`, `#documents`,
and Run graph/transcript views. Work lists switch between list, filtered Table
and Kanban projections. Preferences select eight visual styles (including the
user-authorized Zira palette), independent light/dark, density and language.
All use one business component tree and project-owned Astryx wrappers.
Global quick find is in the top bar.

Accent colors are independent of style. Comfortable/compact/touch defaults come
from one density context for controls and tables. The upper-right Columns menu
contains column visibility/reset and the existing single sort; column ordering,
multi-sort and saved views are not implemented. Issues-specific source findings
and the supplied screenshot's differences are recorded in
`../docs/REA_ZIRA_ISSUES.md`.

The selected 20 CLI scaffolds under `src/app/` remain reference artifacts, not
separate production pages. See `../docs/ASTRYX_TEMPLATE_INTEGRATION.md`.
URL query state accepts `jql/mode/view/groupBy/group`; execution supports only a
small created/summary ordering compatibility set. Assignment/currentUser, other
expressions and non-none grouping are explicitly unsupported, not ignored.

The backend still serves the classic `web/` entry on port 4180. Native React
retry/resource and conservative resume dialogs use server-persisted recovery
intents and exact receipts, with the classic links preserved. Registering a
candidate does not authorize execution. Reload and route changes restore the
original request ID through GET; unknown outcomes cannot be replayed or bypassed
with a fresh ID. Applied means queue/resume control applied, not provider success
or settled usage. Conversation caches remain in
classic. `VITE_LEGACY_URL` can change those explicit links;
`MYBOT_BACKEND_URL` controls the dev/preview proxy target. Neither is a credential.
The proxy translates only its own incoming origin, not arbitrary cross-origin
requests.

Model connection tests require the matching backend revision. `POST
/api/models/{id}/test` now requires explicit `consent` and a stable `request_id`;
`GET /api/models/{id}/tests/{request_id}` and `bootstrap.models[].latest_test`
reconcile persisted receipts without invoking a provider. Deploy or restart the
frontend/backend together. The same matching-revision requirement applies to
`/api/runs/{id}/recovery-intents` and its exact-ID/execute/abandon routes. This
development batch did not restart the existing 4180 process or test a real model;
the new contracts are verified only against a fresh isolated backend.

Managed same-document navigation shares one controller and canonical event across
routes and queries. It protects dirty/busy forms without rewriting the blocked
destination. Supported Navigation API browsers use absolute native entry targets;
the History API fallback has no certified concurrent-interleaving guarantee.
Unmanaged/cross-document entries, Safari and physical devices retain the limits
in `../docs/decisions/ADR-0008-managed-browser-navigation.md`.

Workbench browser checks intentionally create data and use only the isolated
`tests/browser_server.py` FakeProvider/MockTransport. Start a **fresh** fixture:

```bash
# Repository root, terminal 1. Keep the generated directory for this run only.
FIXTURE_DIR=$(mktemp -d /tmp/mybot-astryx-workbench.XXXXXX)
PYTHONPATH=.:tests .venv/bin/python tests/browser_server.py "$FIXTURE_DIR" 4187 astryx-browser-fixture

# frontend/, terminal 2, after pnpm build:
MYBOT_BACKEND_URL=http://127.0.0.1:4187 pnpm preview --host 127.0.0.1 --port 5176

# frontend/, terminal 3:
MYBOT_BROWSER_FIXTURE=1 \
MYBOT_FRONTEND_URL=http://127.0.0.1:5176/ \
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
BROWSER_EXECUTABLE=/usr/bin/google-chrome \
node scripts/verify-workbench.mjs
```

Never run this mutation test against the production data directory. It verifies
the fixture workspace prefix and requires an empty project list before seeding.

`MYBOT_BROWSER_CASE=forms` runs only the fully intercepted synthetic form and
model-receipt contracts, without seeding the backend. Its report identifies the
scenario; it is not a substitute for the full suite. Failed checks retain their
error details in `verification.json`.
The fixture token above is public test data, not an account credential.
See `../docs/ASTRYX_WORKBENCH_REASSESSMENT.md` for scope and remaining migration.

Additional production-browser acceptance scripts:

- `scripts/verify-project-workspace.mjs`: set `MYBOT_BROWSER_FIXTURE=1`; all API
  responses are locally fulfilled and writes are rejected.
- `scripts/verify-navigation-history.mjs`: set `MYBOT_BROWSER_SYNTHETIC=1`;
  real history traversal, synthetic API responses, no backend mutation.
- `scripts/verify-durable-recovery.mjs`: set `MYBOT_BROWSER_FIXTURE=1`; real local
  API with FakeProvider, dropped responses, reload and same-ID reconciliation.
  Run once per fresh fixture; its first intentional provider failure is one-shot.

The November 15 closeout passed 418 frontend tests, 306 backend tests, build,
and browser reports of 57/16/9/9 checks. Reproduction, screenshots and limits:
`evidence/ui-closeout-2026-11-15/README.md`. These are overlapping checks, not a
new product-backlog count or user approval of the visual design.

## Basic Query Drafts

The query row's text/project/status controls are local candidates until Search
or non-composing Enter submits one URL patch. Side-scope navigation remains
immediate and rebases only the field it changes. Presentation pushes and
appearance changes retain drafts; native Back/Forward restores the full
committed Basic/JQL snapshot. Clear is an icon in the same query row and works
for draft-only edits. Drafts are never stored in history or preferences.

`scripts/verify-query-drafts.mjs` requires `MYBOT_BROWSER_FIXTURE=1` and uses
fully intercepted synthetic API reads. With the browser environment above it
checks atomic event counts, IME handlers, traversal, fixed project scope and
mobile boundaries. Evidence: `evidence/query-drafts-2026-11-15/README.md`.
This first slice does not add field multi-select, a full JQL engine, saved views
or server-side pagination.

## Advanced Conditions And Task Columns

Project/state fields now use the pinned Astryx MultiSelector via a project
wrapper. Multiple values are OR within a field and AND across fields; empty
means all. Mobile Filters exposes actual candidate editors and Search. Task
state uses the latest Run, while Run history filters each persisted record.

Legacy single-value `project/filter/order` links remain supported. Structured
`projects/states/sorts` parameters are strict JSON, with explicit invalid or
unavailable states rather than silent fallback. Task settings support column
visibility/order, required title, keyboard movement and up to three sort rules.
The settings Dialog writes `sorts` even for one rule; quick single-sort commands
write `order` and clear `sorts`. JQL ORDER BY retains authority.

New column order/multi-sort is task-list only; Run history keeps its own table
semantics. Column preferences are local nonsensitive settings, not SavedViews.
See `../docs/decisions/ADR-0009-structured-list-conditions-and-sorting.md`.

`scripts/verify-workbench-advanced.mjs` requires explicit
`MYBOT_BROWSER_FIXTURE=1` or `MYBOT_BROWSER_SYNTHETIC=1`; all its API traffic is
fulfilled locally. Final acceptance: 634 frontend tests, build, production reports
58/15/16/30/9/9 and 111 screenshots. Independent settings checks are supplemental.
Evidence and reproduction: `evidence/advanced-workbench-2026-11-15/README.md`.
Backend units were not rerun because backend source was unchanged.

## Private Saved Views

`FocusedWorkbench` exposes a saved-view directory for a single-user workspace or
fixed project. It saves committed task queries and applied table configuration,
not unsent drafts, model authorization, a shared ACL or a live URL binding.

Updates/deletes use revisions; a lost mutation response is not automatically
retried. Reading the stable ID shows current state, not an exact operation receipt.
The unknown-operation editor is not a durable cross-reload execution journal.

The 2026-11-16 acceptance record is
`evidence/saved-views-2026-11-16/README.md`; the contract is
`../docs/decisions/ADR-0010-private-saved-views.md`.
An existing 4180 process does not acquire these routes merely because frontend
source changed. The isolated acceptance did not restart it. After separate user
confirmation on 2026-11-16, consistent backups and quiescence checks, the real
4180 service was updated and its route is now active. See
`evidence/local-activation-2026-11-16/README.md`; follow
`../docs/SAVED_VIEWS_ACTIVATION.md` before any future service update.

Run the synthetic suite without business writes:

```bash
MYBOT_BROWSER_SYNTHETIC=1 \
MYBOT_FRONTEND_URL=http://127.0.0.1:5173/ \
node scripts/verify-saved-views.mjs
```

Use `SAVED_VIEWS_SCENARIO` only for a focused diagnostic run; unset it for full
acceptance. `verify-saved-views-live.mjs` writes real configuration through an
isolated test API/SQLite. Use the fresh fixture startup instructions above and
explicit `MYBOT_BROWSER_FIXTURE=1`; never point it at the user's 4180.

`MYBOT_LOCAL_ACTIVATION_READONLY=1 node scripts/verify-local-activation.mjs`
checks the actual local service using intercepted GET-only browser traffic. It
must not seed records, start models or collect private DOM/screenshots. Its
reports default to the Git-ignored private `.runtime` directory.

## Bounded Task Query Client

The task list uses `GET /api/tasks/query` only when Bootstrap explicitly
advertises `capabilities.task_query: true`. Older backends keep their existing
local list. An advertised query endpoint failing, returning 403/404, or returning
an invalid 2xx body never silently falls back to Bootstrap rows.

The client validates the exact response contract and sent request snapshot,
including scope, effective sorts, page arithmetic and task/Run relationships.
The server owns text matching and ordering. Astryx renders each returned page
unchanged, with its sort controls retained; it does not re-sort or slice it.
Browser and Python Unicode tables are not assumed to be identical.

Drafts do not make query requests. Obsolete reads are aborted and discarded.
Same-query refresh retains rows with a busy state; failed reads hide the rows
and offer explicit GET-only retry. Background Bootstrap polling does not cancel
an in-flight query or automatically retry a failed one.

Run the fully intercepted client suite without business writes:

```bash
MYBOT_BROWSER_SYNTHETIC=1 \
MYBOT_FRONTEND_URL=http://127.0.0.1:5176/ \
TASK_QUERY_CLIENT_EVIDENCE_DIR=/tmp/mybot-task-query-client \
node scripts/verify-task-query-client.mjs
```

This synthetic script imports a typed test fixture and was verified with
Node 24.21.0. Older supported Node releases may require
`node --experimental-strip-types scripts/verify-task-query-client.mjs`.

`verify-task-query-live.mjs` requires `MYBOT_BROWSER_FIXTURE=1` and a **fresh**
empty disposable fixture started as above. It seeds only synthetic projects and
tasks, compares the actual API's exact page IDs to rendered desktop/mobile
rows, and must never target the user's backend. Its output directory is
`TASK_QUERY_LIVE_EVIDENCE_DIR`.

Evidence and rollout limits:
`evidence/server-pagination-2026-11-17/README.md` and
`../docs/decisions/ADR-0012-task-query-client-admission.md`.
This slice does not reduce Bootstrap or paginate Inspector history. The user's
4180 backend has not been restarted for this capability, so 5173 continues its
legacy list path there. Commit/push does not activate a running backend.
