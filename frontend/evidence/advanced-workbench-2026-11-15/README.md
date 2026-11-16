# Advanced Conditions And Task Table Acceptance

Date: 2026-11-15, Asia/Singapore. This batch implements the existing project/state
field directory, multi-value conditions, task column ordering and up to three
task sort priorities. It does not complete the full 110-item business backlog.

## Final Evidence

| Report | Passing checks | PNG files | Boundary |
| --- | --- | --- | --- |
| [Workbench](full/verification.json) | 58 | 60 | Disposable local API/FakeProvider and explicit intercepted scenarios |
| [Prior draft contract](drafts/query-drafts-verification.json) | 15 | 9 | Fully intercepted synthetic reads; single-value compatibility actions |
| [Project scope](projects/project-workspace-verification.json) | 16 | 6 | Fully intercepted synthetic reads, not backend ACL verification |
| [Advanced features](advanced/verification.json) | 30 | 24 | Fully intercepted conditions, sorts, settings and responsive controls |
| [Navigation](navigation/verification.json) | 9 | 9 | Real Chrome traversal with synthetic API responses |
| [Durable recovery](durable/verification.json) | 9 | 3 | Real local API/SQLite, FakeProvider, deliberate response loss |
| [Settings component](settings/verification.json) | 6 | 2 | Independent isolated component checks, supplemental to production |
| [Frontend units](frontend-tests.json) | 634 | N/A | 182 more passing cases than the previous 452-case baseline |

The six production reports contain 111 actual screenshots; the independent
settings report adds two supplemental screenshots. Assertions overlap and must
not be summed as distinct capabilities. No final report has a page error.
TypeScript and production build passed. Existing greater-than-500-KB shared and
optional chunk warnings remain. Backend source was unchanged; Python units were
not rerun. The previous 306-case backend baseline remains separately preserved.

## Verified Contract

- Actual project records and five state categories supply the field directory.
  Multi-selection is OR within one field and AND across fields. Task state uses
  its latest Run; Run history classifies each record independently.
- Search/Enter applies the entire candidate once. Single compatible conditions
  use legacy `project/filter`; multiple values and pending/other use JSON
  `projects/states`. Empty selection means all. Fixed route scope cannot escape.
- Malformed JSON, unknown states/sort fields/directions, duplicate or excessive
  sort rules and unavailable project values remain explicit errors, not
  success-shaped unfiltered results. Invalid candidates survive view changes.
- Searchable Astryx MultiSelector has a button trigger with a combobox inside
  its search popup. Keyboard selection/Escape restores focus. Mobile Filters
  contains visible candidate editors and Search, in addition to immediate scope.
- Column visibility/order edits remain drafts until Apply. Title stays required.
  Arrow commands reorder columns and sort priority; Cancel/Keep/Discard and dirty
  native Back retain their stated behavior. Main query input is not remounted.
- Task sorting uses Astryx's real sorting hook, including ties and pagination.
  Hidden sort columns retain their rule. Settings writes JSON `sorts`, even for
  one rule; quick single-sort commands retain legacy `order`. Structured sorts
  override legacy order, while supported JQL ORDER BY remains authoritative.
- New column order and multi-sort are consumed only by the task list. Board and
  Run history share conditions, but do not pretend to execute task table sorts.

Independent review reproduced an Apply bug: a busy navigation blocker prevented
the settings callback from updating its own URL. It was fixed, then checked with
a real managed-navigation callback, duplicate submission and failed callback.
The final product test confirms applied sort JSON and real rendered ordering.
Final source review also fixed table-header Clear sort dropping remaining
priorities. Two real context-menu checks prove three-to-two and two-to-one rule
transitions and their actual row order. All production reports were rerun on
that rebuilt source, not reused from the earlier checkpoint.

## Reproduction

Follow the disposable backend/preview setup in `../../README.md`. Use a fresh
`/tmp/mybot-astryx-workbench.XXXXXX` fixture, never production data.

From the repository root, with an existing Playwright and Chrome installation:

```bash
export MYBOT_FRONTEND_URL=http://127.0.0.1:5176/
export PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs
export BROWSER_EXECUTABLE=/usr/bin/google-chrome
MYBOT_BROWSER_FIXTURE=1 WORKBENCH_EVIDENCE_DIR=/tmp/mybot-advanced-unique \
  node frontend/scripts/verify-workbench-advanced.mjs
MYBOT_BROWSER_FIXTURE=1 WORKBENCH_EVIDENCE_DIR=/tmp/mybot-full-unique \
  node frontend/scripts/verify-workbench.mjs
MYBOT_BROWSER_FIXTURE=1 WORKBENCH_EVIDENCE_DIR=/tmp/mybot-drafts-unique \
  node frontend/scripts/verify-query-drafts.mjs
MYBOT_BROWSER_FIXTURE=1 WORKBENCH_EVIDENCE_DIR=/tmp/mybot-projects-unique \
  node frontend/scripts/verify-project-workspace.mjs
MYBOT_BROWSER_SYNTHETIC=1 NAVIGATION_EVIDENCE_DIR=/tmp/mybot-history-unique \
  node frontend/scripts/verify-navigation-history.mjs
MYBOT_BROWSER_FIXTURE=1 WORKBENCH_EVIDENCE_DIR=/tmp/mybot-recovery-unique \
  node frontend/scripts/verify-durable-recovery.mjs
```

Full workbench requires an initially empty fixture. Durable recovery's intentional
failure is one-shot and may run once after full workbench on the same fixture.
The other four scripts fully intercept their API traffic.

Intermediate development dynamic-import failure and overbroad test locators are
not counted as passes. Final advanced evidence is production r4; final project
evidence is r4. No result assertion was removed to obtain a pass.

## Remaining Limits

Chrome widths/reduced motion/synthetic IME are not Safari, physical-device or
real-input-method certification. The 320px settings dialog scrolls internally;
its footer is not promised to remain always visible. Screenshot review is not
the user's final visual acceptance.

Saved views, server-side filtering/pagination, list-return continuity, arbitrary
JQL, identity/ACL, connectors and execution authority remain separate work.
Existing services 4180/5173 were not restarted; new recovery APIs are still not
loaded into that old 4180 process. Temporary 4187/5176 are stopped after acceptance.
No real providers, credential reads, production writes, deployment, commit or
push occurred. The original ledger remains 119 total, 9 complete and 110 not
fully complete; these UI packages are cross-cutting views, not additional items.
