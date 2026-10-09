# Breadcrumb Route Stops

## Outcome

Replace the standalone chevron breadcrumb row with one transit-style route strip. Every breadcrumb is rendered as a station on a continuous line, so the hierarchy and the product's route language become the same navigation element.

## Interaction and hierarchy

- Preserve the existing breadcrumb trail source, links, localization, and JSON-LD behavior.
- Render ancestors as linked stations and the current page as the terminal, non-linked station.
- Use the route family's existing track color for the line and active stop.
- Give the current page the strongest visual state; previous stops remain clearly available as navigation.
- Keep a semantic breadcrumb navigation landmark and expose the current page with `aria-current="page"`.

## Responsive behavior

- Keep the route on one horizontal line.
- On narrow screens, retain Home and the current page in the visible strip and expose intermediate stops through the existing accessible overflow menu.
- Truncate only the final label when space is constrained; do not wrap the route into multiple rows.
- Station targets must retain the project's minimum interactive target size.

## Visual behavior

- Remove chevron separators.
- Draw the track behind the breadcrumb content, terminating at the centers of the first and last stations.
- Use the existing transit palette and station-ring grammar rather than introducing a new visual token set.
- Keep the strip within the established page gutter and maximum width so it aligns with headings and header content.

## Verification

- Add component tests for linked ancestor stops, the current station, overflow behavior, and the absence of chevrons.
- Run the focused breadcrumb tests, TypeScript checking, and a production build or the closest available project verification command.
- Inspect the rendered component at desktop and mobile widths.
