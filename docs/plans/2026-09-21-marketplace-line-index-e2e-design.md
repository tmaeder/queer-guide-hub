# Marketplace line-index E2E stabilization

## Problem

The production marketplace E2E test compares the control band's vertical
position before and after a filter change. Its initial measurement can occur
while the department index still renders a ten-card loading skeleton. The
post-filter measurement then sees the loaded department list, so the test
reports a large movement even though applying the filter did not remove or
move any persistent page section.

## Considered approaches

1. Give the index a fixed minimum height. This hides the race but reserves
   unnecessary space when the real department count changes.
2. Always render every taxonomy department. This changes product navigation
   semantics merely to stabilize a test.
3. Expose the index's existing loading state with `aria-busy` and wait for the
   loaded state before either measurement. This preserves the UI and makes the
   test measure the behavior it claims to protect.

## Decision

Use `aria-busy` on the department-index section and update the production E2E
test to require `aria-busy="false"` before taking each position measurement.
Add a component test for the state transition. No data flow, filtering, or
layout behavior changes.

## Acceptance

- Assistive technology can detect when the department index is loading.
- The marketplace position assertion measures loaded UI before and after the
  filter change.
- The production marketplace E2E suite passes, excluding only its documented
  data-dependent skips.
