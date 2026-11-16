# Search And List Iteration

Date: 2026-11-14, Asia/Singapore.

This replaces the previous task-first iteration's search/list composition after
another explicit user rejection. The earlier integration and focused-workbench
evidence remains intact. Technical verification is not visual acceptance.

## Verified

- 214 frontend unit tests passed.
- TypeScript and production build passed. Existing >500 kB chunk warnings remain.
- Product browser regression: 38 checks passed, zero page errors.
- Eight styles in both modes: 16 computed-style samples.
- A separate 45-task, two-project read-only projection verifies draft/committed
  Basic search, IME, Enter/button submission, task-ID search, real sorting before
  pagination, long-title rows and unclipped run-history counters.
- Combined `q/filter/project/order/page/pageSize` state survives refresh and
  back/forward. Clearing filters resets query/scope/page while retaining sort and
  capacity; explicit clearing also resets uncommitted JQL.
- Desktop scope docking and mobile filters use one navigation tree. Dialog Escape
  and focus return pass, including opening a desktop inspector, resizing to mobile,
  then returning focus to the visible mobile task trigger.
- Existing login, model/snapshot consent, artifacts, run controls, themes, locales
  and logout regression remains covered.

All screenshots contain synthetic fixture data. The main fixture uses
FakeProvider/MockTransport; the separate 45-task context intercepts read APIs and
rejects all writes. No real model requests, credentials or sibling services were
used. The real workbench was only previewed read-only.

## Reproduce

Create a new fixture directory for each complete run, then use the same procedure
as `../focused-workbench-2026-11-14/README.md` with:

```bash
MYBOT_BROWSER_FIXTURE=1 \
MYBOT_FRONTEND_URL=http://127.0.0.1:5176/ \
WORKBENCH_EVIDENCE_DIR=/tmp/<new-evidence-directory> \
PLAYWRIGHT_MODULE=/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs \
BROWSER_EXECUTABLE=/usr/bin/google-chrome \
node frontend/scripts/verify-workbench.mjs
```

Final complete output: `/tmp/mybot-search-list-20261114-r4/`.
This directory retains `verification.json` and seven selected screenshots. Other
JSON screenshot paths refer to the complete temporary output. The 45-task image
is a test projection, not additional tasks inserted into the real workspace.

An early unit test caught the missing `query` to `q` mapping. First browser attempt
also caught a test assumption that optional default `filter=all` must always be in
the URL; the final checkpoint explicitly selects that filter before asserting it.
Later screenshots exposed a clipped counter, fixed with a stable count span and
checked in the final complete rerun. Intermediate attempts are not final evidence.

Not added: full JQL, identity/assignee semantics, saved filters, subscriptions,
batch Agent execution, new Provider capabilities or server-side search. Safari
and physical devices remain unverified. Only the documented list URL fields are
shareable; modal and unsaved draft state remains local.
