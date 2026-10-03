# Admin content workspace redesign

## Goal

Turn `/admin/content` and every registry-backed `/admin/content/:type` route into one calm, fast editorial workspace. The redesign must improve scanability and control discovery without changing existing content operations, data loading, saved views, display modes, bulk actions, or editor flows.

## Chosen direction

Use an **editorial workspace** model rather than a denser power-user console or a visual card browser.

- Keep the established admin shell, typography, monochrome palette, semantic radii, and 8-point spacing rhythm.
- Treat the page header as identity and primary action space only.
- Consolidate search, filter, sort, lifecycle state, and display settings into a single visually bounded workspace toolbar.
- Keep saved views adjacent to the toolbar so they read as presets for the same workspace rather than a separate navigation system.
- Preserve the table as the default high-density view, but strengthen hierarchy between record identity, metadata, state, and row actions.

## Interaction design

### Header

- Retain the archetype route line and one `h1`.
- Keep the record count beside the title using tabular figures.
- Keep refresh, export, type-specific actions, and create in the right-aligned action group.
- Do not add explanatory copy that consumes vertical space on a high-frequency operational screen.

### Workspace controls

- Place search first and allow it to grow to the available width.
- Group filter, sort, archive/merge state, and view configuration as one control cluster.
- Retain existing popovers and behavior; this is an information-architecture and styling change, not a filter rewrite.
- Show selection count as an explicit status inside the workspace controls.
- Allow the toolbar to wrap cleanly at smaller widths without forcing horizontal page scrolling.
- Keep saved-view state, including dirty/save/reset behavior, directly above the working controls.

### Data surface

- Give the table its own clear paper surface and a sticky, differentiated header.
- Increase row separation through spacing and hairlines, not card cages.
- Keep the record title as the strongest row element and descriptions secondary.
- Keep state text-readable; colour remains supplementary rather than the only signal.
- Reveal secondary row actions on hover/focus where possible while keeping the primary edit affordance discoverable.
- Retain inline editing, row click, lifecycle actions, live links, sorting, selection, pagination, skeletons, and empty states.

### Responsive behavior

- On narrow screens, the search field spans the row and the remaining controls wrap below it.
- Saved views remain horizontally scrollable.
- The table remains horizontally scrollable because its columns are operationally meaningful; controls must not add a second competing horizontal scroll region.

## Accessibility

- Preserve the single page heading and existing accessible names.
- Keep visible keyboard focus for every control and row action.
- Use text labels or accessible names for icon-only actions.
- Maintain touch targets and avoid hover-only access to essential actions.
- Respect reduced-motion and the admin motion restrictions already enforced by the repository.

## Scope and verification

The implementation will be focused in the shared `ContentListPanel`, saved-view bar, and table components so all registry content routes inherit it. Verification includes focused component tests, type checking/linting for changed files, and visual checks of the live-shaped local route at desktop and narrow widths.
