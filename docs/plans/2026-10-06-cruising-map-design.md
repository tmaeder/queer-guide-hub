# Cruising map and dating workspace design

**Approved:** 2026-10-06

## Goal

Create a private, map-first cruising guide for signed-in adults that combines
the existing dating discovery experience with the complete cruising-place
catalogue. The interaction may borrow the immediacy of Sniffies' people-and-
places map without copying its precise-location privacy model.

## Product shape

`/cruising` becomes the canonical workspace. The legacy `/intimate`,
`/discover`, and `/people/dating` entry points lead into its People view so the
product has one intimate-discovery system instead of parallel dating and
cruising surfaces.

The workspace offers three map layers: People, Spots, and Both. Desktop uses a
map beside a result panel. Mobile uses a full-width map with a compact mode
switch and a result sheet/list below it. Selecting a marker or an approximate
presence area selects the corresponding result; selecting a result focuses the
map.

The panel has two modes:

- **Nearby people** reuses intimate-profile onboarding, filters, profile
  previews, likes, passes, matches, and messaging.
- **All spots** searches and paginates every authenticated cruising venue.
  Spots without coordinates remain in the list even though they cannot appear
  on the map.

## Authentication and privacy

- The route is authenticated and non-indexable. Anonymous clients must not
  receive cruising-place coordinates or intimate-profile data.
- Viewing spots requires a signed-in adult account but does not require an
  intimate profile.
- The People layer requires the existing intimate-profile opt-in.
- A member appears as active only after an explicit, expiring cruising-mode
  opt-in. Presence is represented by a coarse city/area bubble or count, never
  by a precise person coordinate.
- Device location is requested only after the user chooses **Near me**. It is
  used locally for map centering and distance ordering and is not published as
  a member location.

## Map and list behavior

- Cruising venues use their stored coordinates and existing venue-detail
  routes.
- The default view is Both when a member has intimate discovery enabled, and
  Spots otherwise.
- Map movement can refresh the visible spot set through an explicit
  **Search this area** action; it must not hide the global All spots catalogue.
- Search covers spot name, city, region, and country. URL state records the
  selected panel, search term, and map/list mode, but never private location or
  dating preferences.
- Empty, loading, permission-denied, and incomplete-coordinate states are
  explained rather than rendered as a blank map.

## Safety content

A compact, persistent guide links to existing Queer Guide resources and covers
mutual consent, the rights of non-participants, discretion, local-law
awareness, sexual-health options, privacy, and exit planning. It does not frame
cruising itself as a pathology or risk category.

## Initial scope

The first release deliberately excludes public check-ins, exact user-location
pins, crowd counts, public activity timestamps, reviews, and unmoderated spot
creation. Those features require separate threat modelling, moderation, and
retention decisions.

## Verification

Tests must prove that anonymous visitors cannot query protected data, cruising
queries remain category-scoped, all spots remain listable independently of map
coordinates, approximate presence never exposes precise member coordinates,
legacy dating routes resolve into the unified workspace, and the map/list
interaction works at desktop and mobile widths.

## Alternatives considered

- Reusing `/venues?category=cruising` would provide a directory but not the
  requested map-led dating/cruising experience.
- Building a full real-time clone with exact user pins, check-ins, and crowd
  counts would create unnecessary privacy and moderation risk.
- Keeping dating and cruising as separate top-level products would duplicate
  onboarding, filters, profile actions, and messaging while making the map less
  useful.
