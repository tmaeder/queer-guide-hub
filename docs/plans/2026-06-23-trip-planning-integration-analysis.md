# Trip Planning & Booking — Analysis and Integration Roadmap

_2026-06-23_

## Why this exists

We audited the booking / trip-planning experience and how well it connects to the rest of
the platform. The headline finding: **the trip planner is already one of the most complete
features in the product** — and most of its weaknesses are *integration seams*, not missing
trip functionality. This doc records the current state (so we don't rebuild it), the real
gaps, and the milestone roadmap. Milestone 1 ships alongside this doc.

## Current architecture (as built)

**Lifecycle.** Trips move through five phases (`src/components/trips/tripPhase.ts`):
`seed → plan → countdown → live → memory`, derived from dates + an overridable `status`.

**Data model** (`supabase/migrations/2026040*` onward): `trips` (geo-anchored — `primary_city_id`/
`primary_country_id` are NOT NULL), `trip_members` (owner/editor/viewer + RLS), `trip_days`
(auto-generated), `trip_places` (links a venue/event/hotel **or** a custom place; carries
`booking_status` intent/booked/completed + `reservation_id`), `trip_shares`/`trip_share_views`,
`trip_messages`/`trip_notes`/`trip_polls`, `trip_safety_briefings`, `trip_nudges`,
`trip_booking_clicks`, `reservations`, `budget_items`, `trip_packing_items`,
`trip_collections`. Booking provider stubs (`bookings`, `booking_webhooks`) exist but are
**unused** — see "Booking model" below.

**Hooks** (`src/hooks/`): `useTrips`/`useTrip`/`useTripMutations`, `useActiveTrip`,
`useTripSafety`/`useTripSafetyNarrative`, `useTripReservations`, `useTripBudget`,
`useTripPacking`, `useTripChat`, `useTripCollaboration`, `useTripDocuments`, `useTripNudges`,
`useTripShares`, `useTripBookingClicks`, `useTripSuggestions`, `useDiscoverableTrips`, and more.

**Edge functions:** `ai-plan-trip` (LLM itinerary from a prompt, grounded in `search_hybrid`
candidates), `recommendation-engine` (`get_recommendations`), `trip-nudges`,
`trip-safety-narrative`.

**Booking model (important).** The platform is an **affiliate aggregator, not a payment
processor.** Stripe (`create-checkout-session`) handles **donations only**. Hotel/event/
activity "booking" = affiliate redirects (`src/lib/booking/placeLinks.ts`, Travelpayouts /
Booking.com / GetYourGuide), with clicks logged to `trip_booking_clicks` and confirmations
captured into `reservations` (manual entry + email inbox). Deepening "booking" therefore
means **tightening the click → reservation loop**, not building a checkout.

## What was already built (do NOT rebuild)

- **Entry points:** `AddToTripDialog` is on `VenueDetail`/`EventDetail`/`HotelDetail`;
  `PlanTripFromHereButton` on `CityDetail`/`CountryDetail`/`QueerVillageDetail`;
  `QuietAddToTripButton` on `VenueCard`/`EventCard`. `useEntityTripStatus` powers "in a trip"
  checkmarks.
- **Saves → trips:** per-item `AddSavedToTripButton` in `SavedTab`.
- **Booking flip:** `SortablePlaceCard` "Mark booked" → prefilled `AddReservationDialog` →
  flips `booking_status` intent→booked + sets `reservation_id`.
- **Reusable infra:** `saved_items` view, `get_recommendations` / `related_entities` RPCs, the
  search-proxy `/recommendations` + `/similar` endpoints (`fetchRecommendations`/`fetchSimilar`
  in `src/lib/searchClient.ts`).

## The real gaps

1. Search results and map markers had **no add-to-trip CTA**.
2. Saves → trips was **per-item only** — no bulk "you saved N places in Barcelona → build a trip".
3. `TripSuggestions.tsx` existed but was **dead code (never mounted)** and used naive
   `foursquare_rating`-ordered DB queries — it did **not** consume the recommendation engine.
4. The affiliate-click refocus prompt in `PlaceBookableLinks` was a **dead-end toast** (no action).

## Milestone 1 (shipped with this doc)

A single reviewable PR, zero DB migrations — all read-side composition + UI wiring.

- **Shared primitives:** `src/lib/trips/resolveEntityGeo.ts` (batch-resolve venue/event geo,
  since search/rec rows lack `city_id`/lat/lng) + `addPlacesBulk` in `useTrips.ts` (one insert,
  one cache invalidation — never loop `addPlace`).
- **Theme 1 — entry points:** `QuietAddToTripButton` (new `inline` variant) on venue/event
  search-result cards (`SearchResultCard.tsx`).
- **Theme 2 — saves→trips:** `useSavedItemsByCity` hook + `SavedToTripCard` banner mounted in
  `SavedTab` ("Start a trip here" / "Add to active trip", deduped, ≥2 saves per city).
- **Theme 3 — recommendations:** `TripSuggestions` rewired to `fetchRecommendations` and
  **mounted** as a "Suggestions" accordion in `TripPlannerPage`.
- **Theme 4 — booking loop:** `PlaceBookableLinks` refocus toast gains a "Mark booked" action
  (via `onBookingPrompt`) that opens the prefilled reservation dialog `SortablePlaceCard` owns.

## Milestone 2 (shipped)

- **Add-to-trip from map marker popups** — `QuietAddToTripButton` (inline) in
  `MapEntityCard`'s popup variant for venue/event points.
- **`AddPlaceDialog` "Suggested" (nearby) tab** — semantic neighbours of the trip's
  most-recently-added place via `fetchSimilar` (`related_entities`), geo-resolved client-side.
- **On-demand geo resolution** — `AddToTripDialog` now resolves `city_id`/`country_id` for
  venue/event entities that lack them (search hits, map markers) via `resolveEntityGeo`, so the
  *create-new-trip* path works everywhere instead of erroring. (Supersedes the M2 plan to
  backfill geo into the search index — solved client-side, no index change needed.)

## Roadmap

- **M3:** saves banner in `EmptyTripsHero`; "Suggested" tab type/loading polish; surfacing
  trip-place adds as a stronger personalization signal.
- **M3+:** real booking/payment integration (`bookings`/`booking_webhooks`); travel-buddy /
  "who's visiting at the same time" social discovery (reusing intimate-match + inbox infra).
