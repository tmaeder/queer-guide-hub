# Design System: Ambient Product Context

## Overview

This document extends the core [SUBWAY MAP design system](docs/design-system/README.md) with conventions for carrying a user's active context across discovery, management, and focused work. The ambient layer should feel present and useful without becoming a second global navigation system: show a concise summary first, reveal detail on demand, and recede inside the dedicated workspace.

The visual language remains paper, ink, and tonal washes. Ambient state does not introduce a new accent palette or elevation ladder. Meaning comes from hierarchy, position, copy, and icons before color.

## Layout

- Put cross-product context in a compact band between the global header and page content on desktop. Pin it with the shared header offset rather than a duplicated pixel value.
- On mobile, turn the same context into a floating dock above persistent bottom navigation. Respect safe-area insets and leave the underlying page legible.
- Expand contextual detail into a right-side sheet on desktop and a bottom sheet on mobile. Keep the compact bar as the stable entry point; do not expand substantial detail inline and push the page down.
- Reuse `PageContainer` gutters and caps for sticky workspace controls so navigation aligns with the content below it.
- Keep sticky control bands to one non-wrapping row. When labels do not fit, allow horizontal scrolling and hide only the scrollbar, never the content.
- Treat switchers as two distinct levels: broad workspace sections at the start of the row and presentation modes at the end. Preserve that visual separation instead of merging every destination into one undifferentiated tab list.
- Use responsive one-, two-, and three-column grids for persistent portfolios. Empty states occupy the same structural region as populated grids so the surface does not disappear when there is no data.

## Elevation & Depth

Ambient chrome uses tonal contrast and backdrop blur before added shadow. Sticky desktop bands sit on a nearly opaque background wash; mobile docks may invert to ink on paper for separation from content. Drawers and sheets use the existing overlay elevation only—do not invent a trip-specific shadow.

## Shapes

- Use the shared semantic radius tokens. Compact floating docks and controls use `rounded-element`; page-level sheets inherit the system's panel shape.
- Active switcher items are solid rectangular elements within a softly rounded group. Avoid pill styling for primary navigation unless the control is genuinely a chip or status badge.
- Use `rounded-full` only for true circular marks such as progress rings and status dots.

## Components

### Ambient context bar

- Lead with one recognizable icon, a truncating context title, and a short phase/status line. Keep the whole summary row actionable.
- Give the bar an explicit region label. The disclosure control exposes `aria-expanded` and names the sheet it controls.
- Keep dismissal separate from opening the context. Use an icon-only button with an accessible name and a full touch target.
- Defer detailed loading until the sheet opens. Inside the sheet, use compact progress, small numeric stats, prioritized attention items, one primary next action, and a quieter link to the full workspace.
- Hide ambient chrome on routes where it would duplicate the focused workspace or compete with administrative, account, checkout, authentication, or legal tasks.

### Contextual actions

- Use one action vocabulary across detail pages, cards, and compact rows. Variants may change density and emphasis, but not the interaction model.
- Labels describe the result in the user's current context: name the destination or active collection when known; switch to a confirmed-state label after completion.
- Pair icons with visible text. Icons reinforce intent but never carry the meaning alone.
- Truncate long contextual labels inside a bounded button rather than allowing them to distort a card or toolbar.
- Preserve the surrounding surface's click behavior deliberately: nested actions may stop propagation, but the action itself retains an accessible name, busy state, and disabled state.

### Workspace switchers

- Use URL-backed state for shareable, restorable sections and modes. Mark the active choice with `aria-current="page"`.
- Active items invert to ink/paper; inactive items use muted text and gain contrast on hover. This is navigation state, so do not use track colors as selection decoration.
- Pair each label with a consistent 16px line icon. Keep labels visible; icon-only navigation is not appropriate for peer workspace destinations.
- Section changes should preserve normal navigation history. Mode changes within the same workspace may replace the current history entry when they are presentation changes rather than new destinations.

### Focused workspaces

- Put the primary task for the active section directly in the page. Group secondary tools beneath a plain-language heading in accordions so capability remains discoverable without presenting a wall of peer tabs.
- Keep genuinely cross-cutting alerts above section-specific content. Keep preparation, collaboration, and memory content within the section where it is actionable.
- Lazy-load heavy secondary tools and use the branded track loader for suspense states.
- Adapt the default emphasis to temporal context, but always leave all peer sections and modes reachable through the explicit switchers.

### Context-aware editorial surfaces

- Reflect active context in the page title and lede before adding more chrome. Copy should explain how the current surface relates to the user's ongoing work.
- Place the primary planning or continuation surface before inspiration, maps, booking, and reference material. Utility sections may follow editorial discovery without interrupting its reading flow.
- Carry structured selections between surfaces through prefilled actions, then clear transient parameters after the action is resolved.

### Persistent portfolios

- Keep owned collections visible in their stable home instead of showing them only as transient recent activity.
- Align the collection title, count, browse action, and create action in one compact header. Use tabular numerals for counts and retain text labels beside action icons.
- Render loading skeletons in the same grid geometry as final cards. Give failures an inline retry and zero-data states a purposeful creation entry point.

## Do's and Don'ts

### Do

- **Do** make ambient context compact, dismissible, and progressively disclosed.
- **Do** preserve the system's paper/ink hierarchy, semantic radii, touch targets, focus rings, and typography.
- **Do** use text, icons, and position together so state is understandable without color.
- **Do** let phase or current context improve defaults and wording while keeping navigation explicit.
- **Do** use localized, outcome-oriented labels that remain meaningful when read by assistive technology.

### Don't

- **Don't** duplicate ambient context inside its dedicated workspace.
- **Don't** turn every tool into a top-level tab or every status into persistent chrome.
- **Don't** wrap sticky navigation into multiple rows; scroll it horizontally or move lower-priority controls elsewhere.
- **Don't** introduce trip-specific colors, shadows, radius values, or loaders.
- **Don't** make a contextual action icon-only, color-only, or dependent on hover for explanation.
