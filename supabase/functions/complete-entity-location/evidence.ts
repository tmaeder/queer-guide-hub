import { countryContradicts, postalContradicts, haversineKm } from '../backfill-venue-cities/geocode-guard.ts'

export interface Feature {
  geometry?: { coordinates?: number[] }
  properties?: Record<string, string>
}
export interface LocationInput {
  name?: string | null
  address?: string | null
  city?: string | null
  postal_code?: string | null
  latitude?: number | null
  longitude?: number | null
}
const norm = (s?: string | null) => (s || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const poiKeys = new Set(['tourism', 'amenity', 'leisure', 'shop', 'office', 'building', 'historic'])

export function canQueryNamedPlace(row: LocationInput, countryCode: string | null): boolean {
  const name = norm(row.name)
  return !!countryCode && name.length >= 16 && norm(row.address).includes(name) && !!(row.city || row.postal_code)
}

const exactNamedPlace = (row: LocationInput, countryCode: string | null, p: Record<string, string>) =>
  canQueryNamedPlace(row, countryCode) && poiKeys.has(p.osm_key) && !!p.postcode && !!p.city
  && norm(row.name) === norm(p.name)
  && (!!row.postal_code && norm(row.postal_code) === norm(p.postcode)
    || !!row.city && [p.city, p.district, p.county, p.state].some(s => norm(s) === norm(row.city)))

/** Require street-level evidence and corroborate locality before storing a pin. */
export function acceptFeature(row: LocationInput, countryCode: string | null, f: Feature, reverse: boolean): boolean {
  const p = f.properties || {}
  const c = f.geometry?.coordinates
  if (!c || c.length < 2 || !c.every(Number.isFinite) || Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90 || (c[0] === 0 && c[1] === 0)) return false
  if (!p.countrycode || countryContradicts(countryCode, p.countrycode) || postalContradicts(row.postal_code, p.postcode)) return false
  if (reverse) return row.latitude != null && row.longitude != null && haversineKm(Number(row.latitude), Number(row.longitude), c[1], c[0]) <= 0.25
  // An exact named POI with a corroborated locality and postcode can be used
  // even if its source address lacks a house number. Roads and settlements cannot.
  if (exactNamedPlace(row, countryCode, p)) return true
  // Settlement and road centroids are never venue coordinates.
  if (!p.street || !p.housenumber) return false
  const street = norm(p.street)
  if (!street || !norm(row.address).includes(street)) return false
  const numbers = (row.address || '').match(/\d+[a-z]?/gi) || []
  if (!numbers.some(n => norm(n) === norm(p.housenumber))) return false
  if (row.city && ![p.city, p.district, p.name].some(s => norm(s) === norm(row.city))) return false
  // Country alone is insufficient to distinguish identically named streets.
  return !!row.city || !!row.postal_code || (!!p.city && norm(row.address).includes(norm(p.city)))
}

export function selectFeature(row: LocationInput, countryCode: string | null, features: Feature[], reverse: boolean): Feature | undefined {
  const candidates = features.filter(f => acceptFeature(row, countryCode, f, reverse))
  if (!reverse && candidates.length > 1 && exactNamedPlace(row, countryCode, candidates[0].properties || {})) {
    const first = candidates[0].geometry!.coordinates!
    if (candidates.some(f => exactNamedPlace(row, countryCode, f.properties || {})
      && haversineKm(first[1], first[0], f.geometry!.coordinates![1], f.geometry!.coordinates![0]) > 1)) return undefined
  }
  // A nearby waterway/road often ranks first with no postcode. Prefer a validated
  // address result carrying the missing field instead of treating that first hit as final.
  return (!row.postal_code ? candidates.find(f => f.properties?.postcode?.trim()) : undefined) || candidates[0]
}
