# Borderless surface polish

## Decision

Queer Guide uses the supplied subway templates' soft surface grammar everywhere:

- 26px page-level panels
- 18px cards, fields, popovers, and floating controls
- 12px buttons, tabs, chips, and rows
- 9px count marks

Decorative hairlines and component frames are removed. Hierarchy comes from spacing,
tonal surface steps, type, and the existing soft elevation. This applies to public,
account, community, travel, marketplace, help, and admin surfaces.

## Lines that remain

Only lines that carry information remain:

- subway tracks and their station rings
- visible keyboard focus rings
- destructive or validation state indicators when a tonal state cannot communicate it
- chart, map, calendar, and table geometry that encodes data rather than framing a surface

These are marks, not decorative container borders.

## Shared-component contract

- Inputs, textareas, selects, secondary buttons, badges, alerts, and popovers use
  filled tonal surfaces rather than outlines.
- Dense lists use spacing and alternating/hover tone rather than row rules.
- Tabs are grouped on a rounded tonal rail; active tabs use an ink fill.
- Drawers, floating action buttons, mobile overlays, and calendar cells never expose
  square corners.
- Legacy `border-border-hairline` call sites remain harmless while they are retired:
  the semantic hairline token is transparent in both themes.

## Verification

- No visible hairline frame on representative public routes at desktop or mobile.
- Interactive controls resolve to the semantic radius tokens or true circles.
- Inputs and secondary actions remain discoverable through fill, label, hover, and
  focus state.
- Subway tracks, safety semantics, and keyboard focus remain intact.

## Follow-up: rendered-edge contract

The first production audit was too narrow: it inspected controls, but not every
rendered surface. The stricter contract treats the following as surfaces too:

- full-width content bands and the footer
- alert and emergency bands
- media and illustration wells
- cards implemented as links or generic containers
- sticky filter/navigation rails
- loading and empty-state plates

Every visible outer edge uses the semantic radius ladder. Joined internal seams
may remain straight only when they are fully contained by a rounded parent and
cannot read as an exposed corner. App roots, scrims, progress bars, map/chart
geometry, subway tracks, and focus rings are not surfaces and remain exempt.
