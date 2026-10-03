# Unified map ecosystem

Date: 2026-10-03  
Status: Approved

## Objective

Turn the existing shared map engine into a continuous discover → save → plan →
experience system without replacing Queer Guide's intent navigation. The map is
a connected product subsystem, not a persistent site-wide drawer.

## Product contract

- Map controls expose four lines: **M Venues**, **E Events**, **C Community &
  care**, and **T Travel & stay**. Existing entity bullets remain the identity
  of individual stations.
- The public views are **Stations**, **Heat**, **Areas**, and **Routes**. Combined
  is a legacy URL input only; it resolves to Stations, whose low-zoom rendering
  may include a quiet density wash.
- Areas never compete with point lines. Cities, countries, and queer villages
  render through the Areas view.
- One station, route, context, and provider contract powers viewport discovery,
  explicit search results, trips, and ordered guide picks.
- Routes connect trip stops and curated guide/quest/Pride stops. Queer Guide
  does not become a turn-by-turn journey planner.

## Integration contract

- `/map` is the canonical network surface. Search, directory, detail, city,
  country, travel, saved, trip, and guide surfaces hand off context to it rather
  than inventing local URL vocabularies.
- Explicit providers own their data. A search map renders the ranked search
  results it was given and must not silently replace them with a viewport fetch.
- Saved and visited state is viewer-private. Precise location, visited history,
  and accessibility preferences never enter share URLs.
- Safety is station and destination context, never a danger heat layer.
- Specialist rights, recognition, and analytics choropleths stay specialist
  maps while sharing the basemap and interaction standards.

## Visual authority

Adopt the supplied Map Strategy and Map Redesign semantics and interactions.
Render them with the later approved softened Queer Guide system: tonal paper
surfaces, semantic radii, and one soft elevation. The older square-panel,
3px-border, hard-shadow treatment is not reintroduced.

## Completion evidence

- Legacy `lens` and `layers` map URLs continue to resolve.
- Routes never fall through to ordinary pins, and Areas never appears as a
  top-level line.
- Every discovery map uses the shared line/station registry or is documented as
  a specialist map.
- Search list and map data/selection stay synchronized.
- Eligible stations can be saved and added to trips; curated routes can be
  opened, shared, and copied into trips.
- Responsive, keyboard, reduced-motion, RTL, dark-mode, privacy, build,
  typecheck, lint, unit, and end-to-end checks pass.
