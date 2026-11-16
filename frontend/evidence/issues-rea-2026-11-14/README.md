# Issues Research And Workbench Regression

Date: 2026-11-14. This directory contains the final `r10` production-preview
regression: 57 checks, 60 screenshots, no page errors or recorded failure.
`verification.json` is the generated report, not a hand-edited result.

All model and backend behavior uses FakeProvider/MockTransport or intercepted
synthetic browser projections. No production credentials, paid model calls,
upstream Zira runtime, or physical-device compatibility are verified here.
The existing 4180/5173 services were unchanged; temporary 4187/5176 were stopped.

Relevant views:

- `layout-full-shell-columns-desktop.png`: shared shell and full task list.
- `columns-menu-full-shell-desktop.png`: real column settings and single sort.
- `pagination-mobile-sort-390.png`: mobile list and visible pagination.
- `work-zira-light.png` / `work-zira-dark.png`: optional palette.
- `recovery-retry-desktop.png` / `recovery-retry-mobile.png`: native recovery.

Measured toolbar frames: compact 28px, comfortable 32px, touch 40px.
Measured task rows: 37px, 45px, 53px respectively. Inner text/option dimensions
are recorded separately in the JSON report.

Source study: `docs/REA_ZIRA_ISSUES.md` and its three companion studies.
The user's screenshot and the inspected Zira commit are distinct evidence.
The screenshots here are mybot fixtures, not copies of that reference image.

Remaining gaps include WUI-01 project-query browser cases, WUI-06 durable
unknown-recovery reconciliation across reloads, and WUI-11 full Back/history
transactions. Build chunk-size warnings and the Python dependency warning remain.
Passing these checks is not user acceptance of the visual design.
