# City discovery galleries

Approved by the user on 10 October 2026 after the compact-grid proposal.

City discovery should feel like choosing stops on a colourful subway line: inviting imagery and useful filters, while retaining the compact opening overview and factual safety treatment.

- Where to go: three-column desktop/two-column mobile photo gallery, name and category, searchable by name with category chips. Show a bounded first set and reveal more results; filters operate on the city-scoped fetched catalog rather than the old twelve-row preview.
- Next departures: event-type groups with chronological listings inside each, date/type/free filters and recoverable empty results.
- Queer districts: real photo cards with short descriptions and honest station-themed fallbacks when imagery is unavailable.
- Existing track tokens, typefaces, rounded surfaces, accessible focus states and reduced-motion behavior. Colourful station badges and restrained hover movement provide personality without adding controls to every card.
- Retain locale-aware content, city-scoped queries, risk gating, map context, disclosure navigation and onward catalog links.

Alternatives considered: masonry makes comparisons harder; carousels hide choices. Compact grids retain scanability and the decluttering goal.

Validation: filtering/reset and grouping unit tests, scoped CityDetail regression tests, lint/typecheck/build, desktop/mobile browser interaction and accessibility checks. Inspect visuals in one batched pass with at most one corrective confirmation pass.
