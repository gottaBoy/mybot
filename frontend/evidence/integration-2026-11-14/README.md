# Astryx Integration Verification

Completed 2026-11-14. All product screenshots use disposable, labeled fixture data.
No business Provider/Codex CLI request, real SSO account or upstream application
was used. These are Chrome viewport simulations, not physical-device certification.

- `verification.json`: 31 complete product checks, no page errors; 16 computed
  style/mode samples across Neutral/Zira/Gothic/Matcha/Stone/Butter/Chocolate/Y2K.
- `theme-verification.json`: 13 Theme Editor checks.
- `catalog-verification.json`: 58/58 opaque-sandbox template renders.
- Selected PNGs show the top-bar search, Zira light/dark palette, task board,
  overview, work graph, token login, mobile task dialog and 320px Run.
- The complete current temporary product output is
  `/tmp/mybot-workbench-final-20261114-r4`; earlier failed/partial checks are not
  presented as successful evidence.

Appearance tests compare computed foreground/background/font/radius and prove no
API writes. URL tests preserve query state, reject unsupported assignee/currentUser
and grouping, and verify refresh/back/view switching. Ordering compatibility is
not a full JQL engine.

The production initial JavaScript path remains about 1.02 MB raw / 323 KB gzip.
Optional/shared chunks still produce >500 KB build warnings. Runtime isolation,
functional evidence and bundle-budget work are separate concerns.
