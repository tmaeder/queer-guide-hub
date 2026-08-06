/**
 * Canonical TanStack Query keys.
 *
 * Why this exists: 365 query sites hand-rolled inline array literals, yielding
 * 402 distinct root strings. The trip domain alone had **46** of them —
 * `trip-packing`, `trip-notes`, `trip-polls`, `trip-inbox-items`, … — every one
 * a sibling root rather than a child of the trip it belongs to. Nothing about
 * `['trip', id]` matches `['trip-packing', id]`, so no mutation could
 * invalidate the trip it just changed: each call site listed the two or three
 * roots its author happened to remember, and the rest went stale. Invalidation
 * was string guesswork, and `trip` (12 uses) vs `trips` (8) vs `trips-strip`
 * vs `trip-saves` gave the guesswork no way to be right.
 *
 * The shape is the standard hierarchy — `all ⊃ lists ⊃ list(args)` and
 * `all ⊃ details ⊃ detail(id) ⊃ facet(id, name)` — chosen because TanStack
 * matches keys by PREFIX. That single property is what the flat roots threw
 * away: with facets nested under `detail(id)`, invalidating a trip invalidates
 * everything about that trip, for free and forever, including facets added
 * after the call site was written.
 *
 * Rules:
 *  - Never inline a key literal for a domain that appears here.
 *  - Never `.concat()` or spread a key into a longer one at a call site —
 *    add a factory method, so the hierarchy stays readable in one place.
 *  - A facet keyed by something OTHER than the trip (user id, city ids, a
 *    date) is NOT a facet: it is its own list. See `documentsFor`/`templates`.
 */

type Id = string | null | undefined;

/** Normalize so `undefined` and `null` cannot produce two distinct caches. */
const id = (v: Id) => v ?? null;

const TRIP = 'trip';

/**
 * Facets that are scoped to exactly one trip. Nesting them under
 * `detail(tripId)` is the whole point: `invalidateQueries(qk.trip.detail(id))`
 * now reaches all of them.
 */
export type TripFacet =
  | 'booking-clicks'
  | 'budget'
  | 'budget-items'
  | 'chat'
  | 'comments'
  | 'concierge'
  | 'cost-estimate'
  | 'email-turns'
  | 'inbox'
  | 'inbox-items'
  | 'journal'
  | 'local-context'
  | 'messages'
  | 'news'
  | 'notes'
  | 'nudges'
  | 'packing'
  | 'packing-suggestions'
  | 'photos'
  | 'polls'
  | 'reactions'
  | 'recap'
  | 'reservation-suggestions'
  | 'reservations'
  | 'safety-briefing'
  | 'safety-narrative'
  | 'share-view-stats'
  | 'shares';

export const qk = {
  trip: {
    /** Every trip query, list and detail alike. The nuclear option. */
    all: () => [TRIP] as const,

    lists: () => [TRIP, 'list'] as const,
    /** The signed-in user's trips. */
    list: (userId: Id) => [TRIP, 'list', id(userId)] as const,
    /** Trips whose itinerary already covers a destination. */
    coveringDestination: (userId: Id, target: unknown) =>
      [TRIP, 'list', id(userId), 'covering', target] as const,
    /** The compact /hub strip. */
    strip: (userId: Id) => [TRIP, 'list', id(userId), 'strip'] as const,

    details: () => [TRIP, 'detail'] as const,
    /**
     * One trip AND, by prefix, every facet of it. This is the key to
     * invalidate after any mutation that touches a trip.
     */
    detail: (tripId: Id) => [TRIP, 'detail', id(tripId)] as const,
    facet: (tripId: Id, facet: TripFacet) => [TRIP, 'detail', id(tripId), facet] as const,

    // ── Not trip-scoped: keyed by user or by query args, so they are lists in
    // their own right and must NOT hang off detail(tripId).
    savesFor: (userId: Id) => [TRIP, 'saves', id(userId)] as const,
    documentsFor: (userId: Id) => [TRIP, 'documents', id(userId)] as const,
    templates: (month: number, homeCountryId: Id, homeCityId: Id) =>
      [TRIP, 'templates', month, id(homeCountryId), id(homeCityId)] as const,
    suggestions: (kind: 'cities' | 'venues' | 'recs', args: unknown) =>
      [TRIP, 'suggestions', kind, args] as const,
    /**
     * Map pins are keyed by the CITIES on the itinerary, not by the trip: two
     * trips through Berlin share the answer, and it must survive the trip
     * being edited. Deliberately not a facet — nesting it under detail(tripId)
     * would both fragment the cache and wrongly drop it on every trip write.
     */
    mapSuggestions: (kind: 'venues' | 'events', args: unknown) =>
      [TRIP, 'map', kind, args] as const,
    safetyFor: (ids: unknown) => [TRIP, 'safety', ids] as const,
    /** Country-scoped, shared across trips. */
    news: (countryIds: unknown) => [TRIP, 'news', countryIds] as const,
    /** Documents narrow further than `documentsFor` when a scope is given. */
    documentsScoped: (userId: Id, scope: string, tripId: Id) =>
      [TRIP, 'documents', id(userId), scope, id(tripId)] as const,
    /** Keyed by the email item, not the trip. */
    emailItem: (itemId: Id) => [TRIP, 'email-item', id(itemId)] as const,
    /**
     * Per-viewer, so it carries the viewer identity (or the anonymous
     * fingerprint) alongside the trip. Still nested under the trip so a trip
     * invalidation reaches it.
     */
    reactions: (tripId: Id, viewer: Id) =>
      [TRIP, 'detail', id(tripId), 'reactions', id(viewer)] as const,
    /** Depends on the itinerary's cities as well as the trip. */
    localContext: (tripId: Id, cityIds: unknown) =>
      [TRIP, 'detail', id(tripId), 'local-context', cityIds] as const,
  },
} as const;
