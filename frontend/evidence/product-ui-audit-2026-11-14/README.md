# Product UI Audit Evidence

Date: 2026-11-14, Asia/Singapore.

Scope: the user requested an overall functionality and visual review while keeping
Astryx as the component system. Source findings and staged recommendations are in
`docs/PRODUCT_UI_AUDIT.md`; passing rendering tests is not proof that those pending
findings are fixed, nor that the user accepted the design.

## Current Changes

- Overview now shows recent task activity, one latest Run per task, with an attempt
  count. It no longer repeats historical Runs as separate current tasks.
- Global quick find remains separate from list search. The list query input,
  Basic/JQL mode and submit control occupy one row; desktop inline project/status
  selectors use the same scope state as the sidebar. Narrow screens use the
  existing Filters dialog rather than wrapping the inline selectors into more rows.
- The placeholder is “Search in results”; no new Provider or execution capability.

## Results

- 214 frontend unit tests passed.
- TypeScript and production build passed; existing >500 kB chunk warnings remain.
- Product browser regression: 39 named checks passed, zero page errors.
- Inventory: 10 routes at 1440/1024/390px, 30 page measurements/screenshots.
  Three additional configuration forms were opened, inspected and closed without
  submission. The inventory records document width; it is not a full audit of
  every interaction, permission, theme and server failure on each page.
- Existing 320/390/768px, keyboard, consent, task history, URL, responsive inspector,
  45-task sorting/pagination and 16 style/mode samples remain in the complete run.
- Overview grouping is checked against a fixture task with two completed Runs.
  The existing projection unit tests separately cover recovery from historical
  failure to a successful latest Run.

All retained screenshots use synthetic FakeProvider/MockTransport fixtures. The
real 4180/5173 workspace was previewed read-only, with no real model requests.
No sibling credentials, database contents or services were used.

## Reproduce

Use the fresh-directory fixture/build/preview procedure from
`../search-list-2026-11-14/README.md`, then:

```bash
MYBOT_BROWSER_FIXTURE=1 \
MYBOT_FRONTEND_URL=http://127.0.0.1:5176/ \
WORKBENCH_EVIDENCE_DIR=/tmp/<new-evidence-directory> \
PLAYWRIGHT_MODULE=/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs \
BROWSER_EXECUTABLE=/usr/bin/google-chrome \
node frontend/scripts/verify-workbench.mjs
```

Final output: `/tmp/mybot-product-ui-audit-20261114-r2/`.
This folder retains the 30 inventory screenshots, three forms and verification
JSON. Other screenshot names in JSON refer to that full temporary output.
The first attempt stopped at an ambiguous test selector for the form's two close
commands; the inventory now targets the dialog header close control explicitly.
The entire suite was rerun against a fresh fixture and passed.

The temporary 4187/5176 test services have been stopped; real 4180/5173 remain.
No Python business logic changed or Python suite rerun. Complete JQL, native
recovery UI, live connector scope, Safari/physical devices and production security
remain outside the claims of this evidence.
