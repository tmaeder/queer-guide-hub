# Personality dialog production E2E remediation

## Context

The production Playwright run on 22 September 2026 passed all public personality data and wrong-entity tests. The Add Personality validation test failed because the long modal exceeded a 720 px viewport, leaving its submit button outside the viewport with no scrollable modal container.

## Approved design

- Limit the Add Personality dialog to the available viewport height using dynamic viewport units.
- Make the dialog itself vertically scrollable so every field and action remains reachable at compact desktop and mobile heights.
- Keep the existing form validation, error announcement, and focus behavior unchanged.
- Add a component regression test for the viewport-bound scrolling contract and retain the production Playwright assertion for empty-name validation.
- Limit this change to the personality dialog. The unrelated nightly failures in tags, marketplace, villages, events, search, and visual snapshots are outside this remediation.

## Acceptance criteria

1. At a 1280 x 720 viewport, Playwright can reach and click Add Personality without forcing coordinates.
2. Empty submission marks Name as invalid, renders a role=alert message, and focuses the field.
3. Existing personality view and wrong-entity E2E tests remain green.
4. CI, production deployment, production smoke, and targeted production personality E2E all pass.
