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

## Research And Records

- Record upstream repository identity, commit, inspected paths, findings, and gaps in `docs/OPEN_SOURCE_RESEARCH.md`.
- Source presence and upstream documentation are not local integration or test evidence.
- Keep `CONTINUE.md` current when requirements, decisions, evidence, or next steps change.
- Documents under `docs/archive/` are superseded, not active requirements.

## Boundaries

- Do not read sibling `.env` files, credential stores, or database contents.
- Do not start external services, paid model calls, or deployment actions as part of design research.
- Keep sibling projects unchanged unless the user explicitly requests edits there.
