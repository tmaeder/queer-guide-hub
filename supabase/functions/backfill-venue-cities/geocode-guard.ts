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

/**
 * Deliberately CODE-ONLY. The country reaches Nominatim as `countrycodes=` and
 * nowhere else; carrying the display name here would invite putting it back
 * into `q`, which is the regression documented on buildForwardQuery.
 */
export interface CountryRef {
  code: string
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

/**
 * What to do with a `geo_address_queue` row after the reverse geocoder answers.
 *
 * Pure and exported so the rule is testable without a Photon call or a database,
 * because getting it wrong is invisible in production: the old code reported a
 * "fill" whenever the response carried a postcode OR a state OR a countrycode,
 * then DELETED the row. A countrycode alone satisfies that, so rows whose
 * coordinates have no postal code at all were counted as filled and dropped —
 * and `run_geo_address_enqueue_backlog` re-selected them an hour later, forever.
 * Measured on prod 2026-09-05: 49 reported fills across two drain cycles moved
 * `missing_postal` by 0.
 *
 * Two rules:
 *   - `filled` means a postal code was WRITTEN. Not "a response arrived", not
 *     "something was written". The caller measures the write and passes it in.
 *   - A response with no postcode is a durable answer about these coordinates,
 *     not a transient failure, so the row PARKS rather than being deleted and
 *     re-enqueued. Parking is the queue's existing memory: the drain skips
 *     parked rows and the backlog's depth budget ignores them.
 *
 * A transient failure (timeout, 429, 5xx) is NOT this function's business — it
 * throws upstream and takes the retry-with-backoff path.
 */
export interface PostalJobOutcome {
  /** 'done' → delete the row. 'park' → keep it, at the attempt ceiling. */
  disposition: 'done' | 'park'
  /** Count towards `filled` only when a postal code actually landed. */
  filled: boolean
}

export function postalJobOutcome(
  geo: { postcode: string | null } | null,
  wrotePostal: boolean,
): PostalJobOutcome {
  if (geo?.postcode) return { disposition: 'done', filled: wrotePostal }
  return { disposition: 'park', filled: false }
}

// ── Photon (forward) ─────────────────────────────────────────────────────────
//
// Since 2026-09-24 public Nominatim answers 403 to every request from the
// edge-function egress, so the forward pass asks Photon (komoot, OSM data).
// Photon is NOT a drop-in replacement, and the difference is the reason the two
// guards below exist. Measured live 2026-10-07:
//
//   "2496 Riva Road, Annapolis"   -> 2525, 2553, 2521 Riva Road (no 2496 at all)
//   "Storegade 11, Vordingborg"   -> Storegade 11B, STEGE (a different town)
//
// Nominatim returns ZERO for an address it cannot find; Photon is a fuzzy
// search engine and returns its nearest-looking neighbour. Both answers above
// pass the country, postal (the row had none) and locality guards, so without
// these two they would be written as the venue's coordinates.

export interface PhotonFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: Record<string, unknown>
}

/** Map a Photon feature onto the Nominatim shape every guard here already reads. */
export function photonToNominatim(f: PhotonFeature): {
  lat?: string; lon?: string; class?: string; type?: string; addresstype?: string
  housenumber?: string; place_names: string[]
  address: { city?: string; postcode?: string; country_code?: string }
} {
  const p = (f.properties ?? {}) as Record<string, string | undefined>
  const [lon, lat] = f.geometry?.coordinates ?? []
  const isSettlement = ['city', 'town', 'village'].includes(String(p.type ?? ''))
  return {
    lat: Number.isFinite(lat) ? String(lat) : undefined,
    lon: Number.isFinite(lon) ? String(lon) : undefined,
    class: p.osm_key,
    type: p.osm_value,
    // Photon's `type` is its layer (house, street, city, district, county…);
    // the settlement/area layers are exactly the ones isLocalityFallback refuses.
    addresstype: p.type,
    housenumber: p.housenumber,
    place_names: [p.city, isSettlement ? p.name : undefined, p.county, p.district, p.locality]
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0),
    address: {
      city: p.city ?? (isSettlement ? p.name : undefined),
      postcode: p.postcode,
      country_code: p.countrycode ? String(p.countrycode).toLowerCase() : undefined,
    },
  }
}

/** Lowercase, strip diacritics and punctuation — "Zürich" and "Zurich" agree. */
export function normPlace(s?: string | null): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * The street number the row asks for: the first number in the first comma
 * clause that has one ("2496 Riva Road" → 2496, "Möhnestraße 59" → 59,
 * "8/6-8 Si Lom 2" → 8). Null when the address carries no number.
 */
export function rowHouseNumber(address?: string | null): number | null {
  for (const clause of (address || '').split(',')) {
    const m = clause.match(/\d+/)
    if (m) return parseInt(m[0], 10)
  }
  return null
}

/**
 * True when the row names a street number and the hit is not that number. A hit
 * with NO number when the row has one is a contradiction too: it is a street or
 * area feature, and Photon reaching for one is how 2496 became 2525.
 */
export function houseNumberContradicts(address?: string | null, hitHouse?: string | null): boolean {
  const want = rowHouseNumber(address)
  if (want === null) return false
  const m = (hitHouse || '').match(/\d+/)
  if (!m) return true
  return parseInt(m[0], 10) !== want
}

/**
 * True when none of the hit's place names (city, county, district, locality)
 * appears in what the row says about where it is. Stege is not in
 * "Storegade 11, Vordingborg"; Annapolis is in "2496 Riva Road, Annapolis".
 * A hit naming no place at all cannot be corroborated and is refused.
 */
export function placeContradicts(v: GeoVenue, placeNames: string[]): boolean {
  const rowText = ` ${normPlace([v.address, v.city, v.postal_code].filter(Boolean).join(' '))} `
  if (!rowText.trim()) return false
  const names = placeNames.map(normPlace).filter((n) => n.length >= 3)
  if (!names.length) return true
  return !names.some((n) => rowText.includes(` ${n} `))
}
