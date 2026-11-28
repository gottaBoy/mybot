# AI Plan Suggestions Evidence

Date: 2026-11-28. This is isolated fixture evidence for the ADR-0037
implementation; it is not evidence of paid provider quality or automatic plan
publication.

## Automated checks

- Python full suite: `1580 passed` with `MYBOT_REQUIRE_PI_RUNTIME=1`.
- Focused suggestion/plan/query regression: `134 passed`.
- Frontend: `pnpm test`, `87 files / 2526 tests passed`.
- Frontend TypeScript: `pnpm exec tsc --noEmit`.
- Frontend production build: `pnpm build`.
- Existing browser workbench fixture: all checks passed, including desktop,
  mobile, themes, navigation guards, task/run history and read-only projections.
- Isolated fixture API check: `POST /tasks/{id}/plan-suggestions/preview`
  returned a frozen candidate and made no provider request.
- Isolated engine check: one valid strict suggestion response produced one
  `plan_suggestion` Artifact and no new Task.

## What this proves

The preview, prepare, execute, discard and original-request reconciliation
paths are exercised against HTTP/SQLite/worker behavior. The result is shown
as an unpublished draft and can only enter the existing TaskPlanEditor local
draft. The source model response is deterministic fixture data.

## Primary activation

Commit `832fd89` is pushed to `origin/main`. The primary local backend was
restarted with the same command on port `4180` after a private backup. The
migration preserved the original 1 Project, 1 Task, 6 Runs, 1 Model,
18 Agents, 17 Calls, 6 Artifacts and 157 Events, added an empty
`plan_suggestion_jobs` table, and classified all six legacy Runs as
`execution`. A GET-only bootstrap/task query and prepared-suggestion read
returned the same business rows with `task_plan_suggestions: true`.
