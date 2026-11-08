// Photon (komoot, OpenStreetMap data) -> Mapbox-shaped feature.
//
// Why Photon and not Nominatim: public nominatim.openstreetmap.org answers
// HTTP 403 to every request from the Supabase edge-function egress (blocked by
// IP range, not by User-Agent — the same request from another network returns
// 200). backfill-venue-cities hit the same wall on 2026-09-24 and moved to
// Photon; this function followed on 2026-11-08 after every address field on the
// site had been showing "no match".
//
// Photon's response is a GeoJSON FeatureCollection whose `properties` already
// use the keys the frontend reads (city/state/country/postcode/street/
// housenumber), but it has no `display_name`, so `place_name` is composed here.

export interface PhotonFeature {
  type?: string
  geometry?: { type?: string; coordinates?: [number, number] }
  properties?: Record<string, unknown>
}

export interface MapboxLikeFeature {
  id: string
  type: 'Feature'
  place_name: string
  center: [number, number]
  context: Array<{ id: string; text: string }>
  properties: Record<string, unknown>
  geometry: { type: 'Point'; coordinates: [number, number] }
}

/** Photon serves these result languages; anything else falls back to English. */
const PHOTON_LANGS = new Set(['en', 'de', 'fr', 'it'])

/**
 * Pick Photon's `lang` from an Accept-Language header. The language changes
 * RANKING as well as labels: unparameterised, "Zurich" ranks a Kansas village
 * above the Swiss city, while lang=en ranks Zürich, Switzerland first.
 */
export function photonLang(acceptLanguage: string | null | undefined): string {
  for (const part of (acceptLanguage || '').split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase().split('-')[0]
    if (PHOTON_LANGS.has(tag)) return tag
  }
  return 'en'
}

/** Countries that write "123 Main Street" rather than "Hauptstrasse 123". */
const NUMBER_FIRST = new Set(['US', 'GB', 'CA', 'AU', 'NZ', 'IE', 'ZA', 'IN', 'PH', 'SG', 'MY'])

const SETTLEMENT_TYPES = new Set(['city', 'town', 'village', 'hamlet'])

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** Returns null for a feature without usable coordinates — never a [0,0] point. */
export function photonToMapbox(f: PhotonFeature): MapboxLikeFeature | null {
  const coords = f.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null
  const [lng, lat] = coords.map(Number)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null

  const p = (f.properties ?? {}) as Record<string, unknown>
  const name = str(p.name)
  const street = str(p.street)
  const housenumber = str(p.housenumber)
  const countryCode = str(p.countrycode)?.toUpperCase()
  const isSettlement = SETTLEMENT_TYPES.has(String(p.type ?? '')) ||
    SETTLEMENT_TYPES.has(String(p.osm_value ?? ''))
  const city = str(p.city) ?? (isSettlement ? name : undefined)
  const state = str(p.state)
  const country = str(p.country)
  const postcode = str(p.postcode)

  let streetLine: string | undefined
  if (street) {
    streetLine = housenumber
      ? (countryCode && NUMBER_FIRST.has(countryCode) ? `${housenumber} ${street}` : `${street} ${housenumber}`)
      : street
  }

  const parts: string[] = []
  const push = (s?: string) => {
    if (s && !parts.some((x) => x.toLowerCase() === s.toLowerCase())) parts.push(s)
  }
  // A named POI ("Zürich Hauptbahnhof") leads; a house/street result's `name`
  // is usually empty or repeats the street.
  if (name && name !== street) push(name)
  push(streetLine)
  push(postcode && city ? `${postcode} ${city}` : city)
  // Canton/city-state names repeat the city (Zurich, Zurich): skip that echo.
  if (!(state && city && state.toLowerCase() === city.toLowerCase())) push(state)
  push(country)

  const context: Array<{ id: string; text: string }> = []
  if (city) context.push({ id: 'place', text: city })
  if (state) context.push({ id: 'region', text: state })
  if (country) context.push({ id: 'country', text: country })
  if (postcode) context.push({ id: 'postcode', text: postcode })

  const osmType = str(p.osm_type)
  const osmId = p.osm_id != null ? String(p.osm_id) : undefined
  const id = osmId ? `photon.${osmType ?? ''}${osmId}` : `photon.${lng.toFixed(6)},${lat.toFixed(6)}`

  return {
    id,
    type: 'Feature',
    place_name: parts.join(', ') || 'Unknown',
    center: [lng, lat],
    context,
    properties: {
      ...p,
      ...(city ? { city } : {}),
      ...(countryCode ? { country_code: countryCode.toLowerCase() } : {}),
    },
    geometry: { type: 'Point', coordinates: [lng, lat] },
  }
}

/** Parse a Mapbox-convention "lng,lat" query; null when it is not one. */
export function parseLngLat(query: string): { lng: number; lat: number } | null {
  const bits = String(query).split(',').map((s) => s.trim())
  if (bits.length !== 2) return null
  const lng = Number(bits[0])
  const lat = Number(bits[1])
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lng, lat }
}
