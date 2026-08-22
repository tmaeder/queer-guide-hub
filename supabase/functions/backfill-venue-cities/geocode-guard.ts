// Pure query-building and contradiction guards for the forward geocoder.
//
// Split out of index.ts only so they are reachable from a test — index.ts calls
// Deno.serve at module scope and cannot be imported.
//
// Background: the forward pass used to send `q=<venues.address>` and write the
// first global hit unvalidated. Nominatim answers a bare street name with
// whatever street of that name it ranks highest ANYWHERE. Reproduced live
// 2026-08-22:
//
//   "Möhnestraße 59"                          -> 51.4584822, 6.8222474 | Oberhausen 46049
//   "Möhnestraße 59, 59755 Arnsberg, Germany" -> 51.4555545, 7.9688323 | Neheim     59755
//
// The venue row already carried city='Arnsberg' and postal_code='59755'. None
// of it reached the query and none of it gated the answer, so a correct row was
// overwritten with coordinates 85 km away plus Oberhausen's city_id — and
// city_id feeds safety_gated via location_is_high_risk, so a wrong country here
// is a safety-layer fault, not only a map pin.

export interface GeoVenue {
  id: string
  name: string
  address: string | null
  city: string | null
  postal_code: string | null
  country: string | null
  country_id: string | null
  enrichment_status?: Record<string, unknown> | null
}

export interface CountryRef {
  code: string
  name: string
}

export function normPostal(p?: string | null): string | null {
  const s = (p || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return s.length >= 3 ? s : null
}

/**
 * Compared on the leading 4 characters, not byte-equality. A correct match can
 * legitimately land in a neighbouring postal UNIT (NL 1011AB vs 1011AC, UK
 * SW1A1AA vs SW1A2BB are the same block); it cannot land in a different postal
 * DISTRICT. 59755 vs 46049 differs at character 1.
 *
 * A missing postcode on either side is absence of evidence, never a conflict.
 */
export function postalContradicts(rowPostal?: string | null, hitPostal?: string | null): boolean {
  const a = normPostal(rowPostal)
  const b = normPostal(hitPostal)
  if (!a || !b) return false
  if (a === b) return false
  const n = Math.min(4, a.length, b.length)
  return a.slice(0, n) !== b.slice(0, n)
}

export function countryContradicts(rowCode?: string | null, hitCode?: string | null): boolean {
  if (!rowCode || !hitCode) return false
  return rowCode.toUpperCase() !== hitCode.toUpperCase()
}

/**
 * Nominatim answers a query it cannot place at street level with the enclosing
 * settlement, and that answer passes both guards above — a city centroid IS in
 * the right city and the right country. Writing it would re-create exactly the
 * pollution 20260827100000_venue_centroid_repair.sql exists to remove, which
 * NULLs city-centroid coordinates because they are worse than no coordinate.
 *
 * Measured 2026-08-22 against live Nominatim: a bogus street inside a real city
 * returns ZERO results rather than degrading, so this does not fire often. It
 * fires on the case this repo already knows about — `venues.address` that is
 * itself a place name ("Puerto Vallarta" -> addresstype=city, "Le Marais" ->
 * addresstype=suburb), the same collision class that made 15 of 65 name_exact
 * venue matches wrong.
 *
 * DENY-list, not an allow-list: the address-level space is open-ended and a
 * real house came back as `class=place / type=house / addresstype=place`, so
 * an allow-list built from the obvious types would have refused a correct hit.
 */
const LOCALITY_ADDRESSTYPES = new Set([
  'city', 'town', 'village', 'hamlet', 'municipality', 'suburb', 'neighbourhood',
  'quarter', 'borough', 'district', 'county', 'state', 'province', 'region',
  'country', 'continent', 'postcode', 'administrative', 'island', 'archipelago',
  'locality', 'city_district', 'subdistrict', 'political',
])

export function isLocalityFallback(hit: { addresstype?: string; class?: string; type?: string }): boolean {
  const t = (hit.addresstype || '').toLowerCase()
  if (t && LOCALITY_ADDRESSTYPES.has(t)) return true
  // boundary/administrative comes back with addresstype=administrative already,
  // but a boundary relation is never a venue location under any type.
  return (hit.class || '').toLowerCase() === 'boundary'
}

/**
 * Build the query from what the row knows, skipping any component the address
 * string already spells out so "Möhnestraße 59, 59755 Arnsberg" does not become
 * "…, 59755, Arnsberg".
 *
 * The COUNTRY IS DELIBERATELY ABSENT. Nominatim free-text is conjunctive — every
 * token you add is a constraint it must satisfy — so a component that does not
 * parse takes the whole result set to zero. Measured 2026-08-22:
 *
 *   "2496 Riva Road, Annapolis"                     -> 1 hit
 *   "2496 Riva Road, Annapolis, United States"      -> 0
 *   "2496 Riva Road, 21401, Annapolis"              -> 0
 *   "2496 Riva Road, 21401, Annapolis, United States" -> 0
 *
 * The country belongs in the `countrycodes=` PARAMETER, which is a filter rather
 * than a search term: it applies the same restriction at zero recall cost. The
 * first version of this function put the name in `q` and took four findable prod
 * addresses to no_results.
 *
 * The postcode stays a rung-1 term because it disambiguates strongly where it
 * does parse (it is what separates 59755 Arnsberg from 46049 Oberhausen), and
 * rung 2 drops it precisely because of the recall cost shown above.
 */
export function buildForwardQuery(v: GeoVenue, withPostal: boolean): string {
  const parts: string[] = []
  const push = (s?: string | null) => {
    const t = (s || '').trim()
    if (!t) return
    if (parts.join(', ').toLowerCase().includes(t.toLowerCase())) return
    parts.push(t)
  }
  push(v.address)
  if (withPostal) push(v.postal_code)
  push(v.city)
  return parts.join(', ')
}

/**
 * A bare street name with no locality — not in a column, not as a comma clause
 * in the address — is exactly the query that produced Oberhausen. There is no
 * question to ask, so we don't ask one.
 *
 * A COUNTRY IS NOT LOCALITY, even though it is now enforced via countrycodes=.
 * "Storegade 11" restricted to Denmark is still ambiguous — Storegade is the
 * main street of nearly every Danish town, and that ambiguity is what put Cafe
 * Davids 210 km from Vordingborg. Country narrows the haystack; it does not
 * identify the needle.
 */
export function hasLocalityContext(v: GeoVenue): boolean {
  if (v.city?.trim() || normPostal(v.postal_code)) return true
  return (v.address || '').includes(',')
}

/** The population the old query shape produced: no comma, no 4+ digit run. */
export function isBareStreetAddress(address: string): boolean {
  return !address.includes(',') && !/\d{4,}/.test(address)
}

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLon = ((bLon - aLon) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/**
 * Records the decision on the row itself. A refusal has to be legible as a
 * refusal — "geocode_attempted with no coordinates" alone reads identically to
 * "Nominatim has never heard of this street".
 */
export function stampGeocode(
  prev: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
  now: string = new Date().toISOString(),
): Record<string, unknown> {
  return { ...(prev || {}), geocode: { ...patch, at: now } }
}
