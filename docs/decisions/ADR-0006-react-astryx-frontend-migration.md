# ADR-0006: React + Astryx Frontend Migration

- Status: Accepted for implementation
- Date: 2026-11-11
- Decision owner: project user

## Context

The live application currently runs from `web/` as vanilla HTML, CSS, and JavaScript.
The project now needs a reusable design-system foundation and has explicitly authorized
using React and Astryx. Astryx targets React 19+, while the current application has no
React build or component boundary.

## Decision

Migrate the live `web/` application incrementally to React 19+ with Astryx as the base
design system.

- Astryx supplies generic components, themes, accessibility behavior, and design tokens.
- The user-approved Astryx Playground, Components, Theme, and Templates pages are
  implementation references. The selected Playground/template variants supplied on
  2026-11-11 may be fully reproduced locally when chosen as a migration slice,
  including source structure, layout, responsive states, and theme setup.
- The local result must be rebranded for mybot, preserve applicable MIT/license
  notices, and keep third-party assets/dependencies under their own license review.
  This does not imply Meta/Astryx endorsement or make unrelated examples product
  behavior.
- Tailwind, if introduced, is for page layout and local composition rather than a second
  implementation of Astryx components.
- Radix is optional and is only used for behavior primitives missing from Astryx.
- Product code imports project-owned wrappers under the frontend UI boundary instead of
  importing vendors throughout feature code.
- The existing vanilla application remains the rollback/reference path until each slice
  passes functional, browser, responsive, and accessibility checks.

## Scope

The first migration slice should establish:

1. React 19 + Vite entry and production build.
2. The existing shell/navigation as a React route boundary.
3. Astryx theme loading and the project's token mapping.
4. One representative read-only workbench flow.
5. Browser evidence for desktop and mobile viewports.

Business capability expansion, model/provider changes, and agent execution permissions
are out of scope for the migration slice.

## Consequences

### Positive

- A reusable component and token foundation is available for new work.
- Shared UI behavior becomes easier to test and evolve.
- Generic components are less coupled to page-specific markup.

### Costs and risks

- React 19, Vite, package management, and a new build artifact become runtime
  dependencies.
- The migration temporarily requires two implementations and an explicit rollback path.
- Existing vanilla behavior must be compared against the React replacement instead of
  being assumed equivalent.
- Astryx is still a beta dependency; pin versions and record upstream updates.

## Verification requirements

Before deleting a vanilla slice:

- Typecheck and production build pass.
- Existing behavior has a browser regression result.
- Keyboard, focus, accessible names, reduced motion, light/dark themes, and narrow
  widths are checked where applicable.
- The migration record names the replaced paths, evidence, and rollback point.
