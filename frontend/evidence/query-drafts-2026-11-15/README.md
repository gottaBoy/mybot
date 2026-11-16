# Basic Query Drafts: First Slice

Date: 2026-11-15, Asia/Singapore. Scope: IZ-02/03's existing text, project and
status-category controls. This is not a full query language, field directory,
multi-select condition editor or saved-view implementation.

## Final Results

| Report | Passing checks | Screenshots | Data source |
| --- | --- | --- | --- |
| [Full workbench](full/verification.json) | 58 | 60 | Disposable local API/FakeProvider plus explicit intercepted scenarios |
| [Query drafts](drafts/query-drafts-verification.json) | 15 | 9 | Every API read fulfilled locally; no real backend |
| [Project isolation](projects/project-workspace-verification.json) | 16 | 6 | Every API read fulfilled locally; no real backend ACL verification |
| [Managed navigation](navigation/verification.json) | 9 | 9 | Real Chrome history with synthetic API responses |
| [Durable recovery](durable/verification.json) | 9 | 3 | Real local API and SQLite, FakeProvider, intentional response loss |
| [Frontend units](frontend-tests.json) | 452 | N/A | Vitest: 18 new candidate tests and 16 new navigation-reason tests |

All browser reports have no page errors. There are 87 actual PNG files, with no
duplicate screenshot entries in the final reports. Assertions overlap and must
not be counted as distinct product capabilities. TypeScript and production build
passed; existing greater-than-500-KB chunk warnings remain.

The Python backend was unchanged and its unit suite was not rerun in this slice.
The previous 306-test backend baseline remains separately preserved under
`../ui-closeout-2026-11-15/`; actual API/FakeProvider browser regression was rerun.

## Contract

- Editing the query row's text, project or status changes only an in-memory
  candidate. Search or non-composing Enter writes all three fields and page one
  through a single admitted navigation event. Default `all` values are omitted.
- Immediate side-scope pushes rebase only their changed field. Clicking an already
  selected scope does not secretly submit or clear a dirty candidate.
- Ordinary view/mode/sort/page pushes and appearance changes retain drafts.
  Native Back/Forward emits `traverse` and restores the entire committed
  Basic/JQL snapshot, including fields whose committed values did not change.
- The X button stays in the original query row. It works for draft-only edits,
  clears Basic/JQL together and is disabled when nothing can be cleared.
- Raw whitespace edits count as unsubmitted editing; Search trims them and
  removes the pending indication. Unsubmitted drafts are not durable.
- Fixed route project scope takes precedence over conflicting URL/candidate
  values. No draft is execution consent or a model request.

Independent review found cross-field draft loss, partial history restoration and
missing draft-only clear. All three were fixed and independently rechecked.
The full suite's first run stopped on an old assertion requiring literal
`filter=all`; the normalized contract permits its absence. That assertion was
corrected, and the full suite passed from a new empty fixture. No result/scope
assertion was removed.

## Reproduction

Build `frontend/` with `pnpm build`. Start a fresh disposable backend using
`tests/browser_server.py` and preview on a separate port as documented in
`../../README.md`. Never run fixture mutations against production data.

From the repository root:

```bash
export PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs
export BROWSER_EXECUTABLE=/usr/bin/google-chrome
export MYBOT_FRONTEND_URL=http://127.0.0.1:5176/
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

The full suite needs an initially empty fixture. Durable recovery's intentional
FakeProvider failure is one-shot; run it once per fresh backend. The full suite
does not consume that marker, so durable recovery may follow it.

## Limits

Chrome desktop/mobile widths, reduced motion and synthetic IME events were
tested, not physical input methods or devices. At narrow widths, project/status
Selectors remain hidden and Filters uses the existing immediate scope flow.
Resize testing proves same-tree draft retention, not hidden touch controls.
Navigation API fallback interleaving, Safari and cross-document cancellation
remain outside certification.

Services 4180/5173 were not restarted; new recovery APIs remain unloaded in the
existing 4180 process. Temporary 4187/5176 were used only for acceptance and
stopped afterwards. No real provider calls, credentials, production writes,
deployment, commit or push occurred. The business ledger stays at 119 total,
9 complete and 110 not fully complete. Technical checks are not visual approval.
