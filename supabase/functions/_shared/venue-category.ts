// The `venues.category` vocabulary, in one place.
//
// This exists because three source adapters independently got it wrong and the
// failure is INVISIBLE until commit: pipeline-validate approves the row, then
// `commit_venue_staging_item` hits `venues_category_check` and the row lands as
// disposition='rejected' with a constraint message. Measured 2026-08-22:
//
//   refuge-restrooms   944 committed / 907 rejected (49% lost) — emitted NO
//                      category at all, so commit substituted 'unknown', which
//                      the CHECK does not allow. The vocabulary has had
//                      'toilet' since 20260810120100.
//   osm                178 / 203 (53% lost) — emitted 'community-center' with a
//                      HYPHEN; the vocabulary is 'community_center'.
//   community-manual     0 /  13 (100%)     — emitted 'nightclub'; the
//                      vocabulary is 'club'.
//
// Keep VENUE_CATEGORIES in sync with `venues_category_check`. The guard test
// asserts every value here is accepted by the live constraint's vocabulary.

export const VENUE_CATEGORIES = [
  'bar',
  'club',
  'cafe',
  'restaurant',
  'hotel',
  'sauna',
  'cruising',
  'outdoor',
  'shop',
  'community_center',
  'organization',
  'event-venue',
  'theater',
  'gallery',
  'salon',
  'gym',
  'toilet',
  'other',
] as const

export type VenueCategory = (typeof VENUE_CATEGORIES)[number]

const ALLOWED = new Set<string>(VENUE_CATEGORIES)

/**
 * Common spellings that are NOT in the vocabulary. Hyphen/underscore drift is
 * handled generically below; this map is for genuinely different words.
 */
const ALIASES: Record<string, VenueCategory> = {
  nightclub: 'club',
  disco: 'club',
  danceclub: 'club',
  pub: 'bar',
  tavern: 'bar',
  coffee: 'cafe',
  coffeeshop: 'cafe',
  bistro: 'restaurant',
  diner: 'restaurant',
  hostel: 'hotel',
  guesthouse: 'hotel',
  motel: 'hotel',
  bnb: 'hotel',
  bathhouse: 'sauna',
  spa: 'sauna',
  restroom: 'toilet',
  toilets: 'toilet',
  washroom: 'toilet',
  bathroom: 'toilet',
  cinema: 'theater',
  theatre: 'theater',
  museum: 'gallery',
  library: 'other',
  communitycentre: 'community_center',
  communitycenter: 'community_center',
  ngo: 'organization',
  nonprofit: 'organization',
  charity: 'organization',
  fitness: 'gym',
  gyms: 'gym',
  beach: 'outdoor',
  park: 'outdoor',
  store: 'shop',
  sexshop: 'shop',
  bookshop: 'shop',
}

/**
 * Coerce any source's category string into the `venues.category` vocabulary.
 *
 * NEVER returns 'unknown'. `commit_venue_staging_item` substitutes exactly that
 * string for a missing category and the CHECK rejects it, so an unmapped value
 * must resolve to 'other' — a mis-categorised row is recoverable, a rejected
 * one is silently dropped.
 */
export function normalizeVenueCategory(
  raw: string | null | undefined,
  fallback: VenueCategory = 'other',
): VenueCategory {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return fallback

  // 'community-center' / 'community center' -> 'community_center'
  const underscored = s.replace(/[\s-]+/g, '_')
  if (ALLOWED.has(underscored)) return underscored as VenueCategory
  if (ALLOWED.has(s)) return s as VenueCategory

  // 'event venue' -> 'event-venue' (the one hyphenated member)
  const hyphenated = s.replace(/[\s_]+/g, '-')
  if (ALLOWED.has(hyphenated)) return hyphenated as VenueCategory

  const squashed = s.replace(/[^a-z]/g, '')
  return ALIASES[squashed] ?? ALIASES[s] ?? fallback
}

/**
 * Coerce a country to the ISO-2 form `venues_country_iso2_check` demands, or
 * `undefined` when it cannot.
 *
 * The constraint is `country IS NULL OR country ~ '^[A-Z]{2}$'` — **NULL is
 * allowed but the empty string is NOT**, so a source must omit the field rather
 * than emit ''. Sources that did (`source-osm-venue` sends
 * `tags['addr:country'] ?? ''`, and OSM usually has no addr:country) had every
 * such row rejected at commit.
 */
export function normalizeIso2Country(raw: string | null | undefined): string | undefined {
  const s = String(raw ?? '').trim()
  if (!s) return undefined
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase()
  return undefined
}
