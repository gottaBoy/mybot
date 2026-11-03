# Project Instructions

## Resume

Read `CONTINUE.md` before making assumptions about the project. Then read the latest ADR referenced there and the document relevant to the requested work.

## Product And Phase

- Target: an AI workbench for R&D teams, initially validated by one developer.
- Current phase: research, product definition, user journeys, and original UI design.
- Do not start business implementation or connect live executors unless the user changes this phase.
- Preserve the distinction between accepted requirements, proposed designs, source observations, and tested behavior.

## UI

- Create an original UI. Do not copy or borrow visual style, layout, or interaction design from sibling projects under `/home/my/workspace/ainfra`.
- `prototype/` is an unadopted early sketch, not the visual or engineering baseline.
- The user rejected the visual quality of `design/review-v1/`. Preserve it for comparison, not as the accepted baseline.
- `design/review-v2/` contains the current task/call/coordinator/control-panel visual proposal and static checks, not an accepted final design. Read `docs/UI_ITERATIONS.md` and `docs/USER_REFERENCES_2026-11-02.md` before continuing it.
- Control Panel edits are in-memory presentation drafts only. Never present a preview as applied configuration or a completed agent action.
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
