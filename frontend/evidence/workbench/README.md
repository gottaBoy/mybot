# Astryx Workbench Evidence

Date: 2026-11-13.

These are generated **disposable test fixtures**, not production runs, real model
results, connected accounts or physical-device certification.

- `verification.json`: 25 product checks, no page errors; API mutations go only to
  `tests/browser_server.py` with FakeProvider/MockTransport.
- `theme-verification.json`: 13 Theme Editor checks on the production build.
- `catalog-verification.json`: 58/58 allowlisted templates render in the opaque
  preview iframe. Its referenced complete screenshot set remains in the recorded
  temporary output directory.
- Selected PNGs: desktop light/dark work lists, desktop Run, 320px dark Run and
  390px dark task form. All product data is synthetic and labeled as a fixture.

Run reproduction instructions are in `../../README.md`; the implementation
analysis is `../../../docs/ASTRYX_WORKBENCH_REASSESSMENT.md`.

The final browser test verifies an initial product path with three JavaScript
assets (about 0.82 MB raw / 260 KB gzip); Monaco, the TypeScript compiler and
template pages are not loaded. Shared CSS and optional preview dependencies remain
large. This is not a completed performance-budget or accessibility audit.
