import { distanceKm } from '../_shared/geo-link-guards.ts'
import { assertPublicHttpUrl } from '../_shared/ssrf-guard.ts'
import { providerFetch, ProviderUnavailable } from './provider-outcomes.ts'
import { normalizeCoordinate } from '../_shared/venue-pipeline-utils.ts'

/** Validate capture eligibility before reserving a limited provider call. */
export function contactCaptureCoordinates(venue: { category?: unknown; latitude?: unknown; longitude?: unknown }) {
  if (typeof venue.category !== 'string' || !venue.category.trim()
    || ['cruising', 'toilet', 'other'].includes(venue.category)) return null
  const latitude = normalizeCoordinate(venue.latitude), longitude = normalizeCoordinate(venue.longitude)
  if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    || (latitude === 0 && longitude === 0)) return null
  return { latitude, longitude }
}

export type ContactVenue = { id: string; name: string; latitude: number; longitude: number;
  address: string | null; country_code: string; updated_at: string; country_id: string;
  city_id: string | null; organization_id: string | null; city_name?: string }
type Place = { fsq_place_id?: string; name?: string; latitude?: number; longitude?: number;
  location?: { country?: string; address?: string }; date_closed?: string;
  unresolved_flags?: string[]; website?: string; tel?: string }
const key = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const withoutCity = (name: string, city?: string) => {
  const normalized = key(name), locality = city ? key(city) : ''
  return locality ? (` ${normalized} `).replace(` ${locality} `, ' ').trim() : normalized
}

export function matchingContactPlace(venue: ContactVenue, places: Place[]) {
  if (!/^[A-Z]{2}$/.test(venue.country_code) || key(venue.name).length < 3 || /^[†‡]/.test(venue.name)
    || !Number.isFinite(venue.latitude) || !Number.isFinite(venue.longitude)
    || Math.abs(venue.latitude) > 90 || Math.abs(venue.longitude) > 180 || (!venue.latitude && !venue.longitude)) return null
  const core = withoutCity(venue.name, venue.city_name)
  if (['bar', 'hotel', 'club', 'cafe', 'restaurant', 'sauna', 'shop', 'spa'].includes(core) || core.length < 3) return null
  const matches = places.filter(place => {
    if (!/^[a-f0-9]{24}$/.test(place.fsq_place_id ?? '') || !place.name || (key(place.name) !== key(venue.name) && withoutCity(place.name, venue.city_name) !== withoutCity(venue.name, venue.city_name))
      || place.location?.country !== venue.country_code || place.date_closed
      || (place.unresolved_flags !== undefined && (!Array.isArray(place.unresolved_flags) || place.unresolved_flags.length))
      || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)
      || Math.abs(place.latitude!) > 90 || Math.abs(place.longitude!) > 180 || (!place.latitude && !place.longitude)) return false
    const distance = distanceKm(venue, { latitude: place.latitude, longitude: place.longitude })
    if (distance === null || distance > 0.06) return false
    if (venue.address?.trim()) {
      const a = key(venue.address), b = key(place.location?.address ?? '')
      if (b.length < 5 || !(` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `))) return false
    } else if (distance > 0.03) return false
    return true
  })
  if (matches.length !== 1) return null
  const place = matches[0]
  let website: string | null = null
  try {
    if (typeof place.website === 'string' && place.website.length <= 2048) {
      const url = assertPublicHttpUrl(place.website)
      if (!url.username && !url.password) website = url.href
    }
  } catch { /* Unusable source values stay unresolved. */ }
  const phone = typeof place.tel === 'string' && place.tel.length <= 64
    && /^[+()\d\s./-]+$/.test(place.tel) && place.tel.replace(/\D/g, '').length >= 7
    && place.tel.replace(/\D/g, '').length <= 15 ? place.tel : null
  if (!website && !phone) return null
  return { venue_id: venue.id, expected_updated_at: venue.updated_at, name: venue.name,
    latitude: venue.latitude, longitude: venue.longitude, address: venue.address,
    country_id: venue.country_id, country_code: venue.country_code, city_id: venue.city_id, city_name: venue.city_name,
    organization_id: venue.organization_id, website, phone, place,
    source_url: `https://foursquare.com/placemakers/review-place/${place.fsq_place_id}`,
    distance_m: distanceKm(venue, { latitude: place.latitude, longitude: place.longitude })! * 1000, human_reviewed: false }
}

export async function collectContactEvidence(venue: ContactVenue, apiKey: string) {
  const url = new URL('https://places-api.foursquare.com/places/search')
  url.search = new URLSearchParams({ query: venue.name, ll: `${venue.latitude},${venue.longitude}`,
    radius: '100', limit: '50', tel_format: 'E164',
    fields: 'fsq_place_id,name,location,latitude,longitude,website,tel,date_closed,unresolved_flags' }).toString()
  const response = await providerFetch(url.href, { headers: { Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json', 'X-Places-Api-Version': '2025-06-17' } })
  if (!response.body) throw new ProviderUnavailable()
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let total = 0
  while (true) {
    const { done, value } = await reader.read(); if (done) break
    total += value.length
    if (total > 1_000_000) { await reader.cancel(); throw new ProviderUnavailable() }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total); let offset = 0
  for (const value of chunks) { bytes.set(value, offset); offset += value.length }
  const raw = new TextDecoder().decode(bytes), body = JSON.parse(raw)
  if (!Array.isArray(body.results) || body.results.length > 50) throw new ProviderUnavailable()
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('')
  // A full page cannot establish that another matching place was not omitted.
  const proof = body.results.length < 50 ? matchingContactPlace(venue, body.results) : null
  return { venue_id: venue.id, outcome: proof ? 'corroborated' : 'unresolved',
    observed_at: new Date().toISOString(), query_url: url.href, api_version: '2025-06-17',
    payload_sha256: hash, payload_text: raw, proof }
}
