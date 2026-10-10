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

## Implemented and verified

Gallery tiles share the existing image primitive and retain uncropped logo treatment when a photo is unavailable. Districts show curated/source photos with station placeholders for missing imagery. Venue discovery starts at six tiles and can reveal more; the overview map remains bounded to twelve markers.

Departures preview four event types with up to three rows each. Readers can expand a type or reveal more types. Expired records are excluded; ongoing date ranges display their end date with an explicit “Until” label. Date filters use destination calendar days and retain overlapping multi-day events.

New copy is translated in all eleven locales and synced to public locale assets. Filters reset on city navigation.

Validation: 21 focused unit/component tests and six city browser tests passed. Desktop/mobile filter interactions and axe checks passed with no serious/critical findings and no horizontal overflow. Scoped ESLint passed. Typecheck reported no new errors against the repository baseline. Production build passed. Some district source photos are absent; placeholders intentionally make that absence visible.
