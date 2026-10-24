import { distanceKm } from './geo-link-guards.ts'
import { normalizeCoordinate } from './venue-pipeline-utils.ts'

export interface RegisteredGayoutVenue {
  id: string; name: string; latitude: number | string | null; longitude: number | string | null
  country_code: string; source_url: string; publisher_venue_id: number
}
const key = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const types = new Set(['LocalBusiness', 'LodgingBusiness', 'Hotel', 'BarOrPub', 'NightClub', 'Restaurant', 'CafeOrCoffeeShop', 'Store', 'Organization', 'Place', 'EventVenue', 'PerformingArtsTheater', 'HealthAndBeautyBusiness', 'SportsActivityLocation'])
function objects(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 8) return []
  if (Array.isArray(value)) return value.slice(0, 1000).flatMap(v => objects(v, depth + 1))
  if (!value || typeof value !== 'object') return []
  const node = value as Record<string, unknown>
  return [node, ...objects(node['@graph'], depth + 1)]
}
function sourceUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' || u.hostname !== 'www.gayout.com' || u.port || u.username || u.password || u.search || u.hash) return null
    return u.href.replace(/\/$/, '')
  } catch { return null }
}
/** A bounded attributable publisher summary, never page chrome or review prose. */
export function gayoutShortDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim(), words = text.split(/\s+/)
  if (text.length < 80 || text.length > 500 || words.length > 25 || words.length < 10
    || /[<>]|lorem ipsum|cookie policy|privacy policy|all rights reserved|click here/i.test(text)) return null
  return text
}
/** Registered listing ID + exact name + country + coordinates establish scope.
 * The provider's own URL is a listing, so it is never returned as a business website.
 */
export function gayoutVenueEvidence(venue: RegisteredGayoutVenue, html: string) {
  if (html.length > 1_000_000) return null
  const nativeLat = normalizeCoordinate(venue.latitude), nativeLon = normalizeCoordinate(venue.longitude)
  if (nativeLat === null || nativeLon === null || Math.abs(nativeLat) > 90 || Math.abs(nativeLon) > 180 || nativeLat === 0 && nativeLon === 0) return null
  const expectedUrl = sourceUrl(venue.source_url)
  const expectedName = key(venue.name)
  if (!expectedUrl || !Number.isSafeInteger(venue.publisher_venue_id) || venue.publisher_venue_id < 1
    || !/^[A-Z]{2}$/.test(venue.country_code) || expectedName.length < 5
    || /^(bar|hotel|club|sauna|shop|restaurant|cafe)$/.test(expectedName) || /^[†‡]/.test(venue.name)) return null
  // This is the primary listing's check-in control, not a nearby-card ID.
  const buttons = [...html.matchAll(/<button\b[^>]*>/gi)].map(m => m[0]).filter(tag => /\bid\s*=\s*["']venue-checkin-btn["']/i.test(tag))
  if (buttons.length !== 1 || !new RegExp(`\\bdata-venue-id\\s*=\\s*["']${venue.publisher_venue_id}["']`, 'i').test(buttons[0])) return null
  const matches: Array<{ node: Record<string, unknown>; text: string }> = []
  for (const script of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed: unknown
    try { parsed = JSON.parse(script[1]) } catch { continue }
    for (const node of objects(parsed)) {
      const type = Array.isArray(node['@type']) ? node['@type'] : [node['@type']]
      if (!type.some(t => typeof t === 'string' && types.has(t)) || sourceUrl(node.url) !== expectedUrl) continue
      if (typeof node.name !== 'string' || key(node.name) !== expectedName) continue
      const address = node.address as Record<string, unknown> | undefined
      const geo = node.geo as Record<string, unknown> | undefined
      const latitude = normalizeCoordinate(geo?.latitude), longitude = normalizeCoordinate(geo?.longitude)
      if (address?.addressCountry !== venue.country_code || latitude === null || longitude === null
        || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || latitude === 0 && longitude === 0) continue
      const distance = distanceKm({ latitude: nativeLat, longitude: nativeLon }, { latitude, longitude })
      if (distance === null || distance > 0.06) continue
      // Capture only the selected identity/contact fields, without reviewer data.
      const selected = { '@type': node['@type'], name: node.name, url: node.url, telephone: node.telephone,
        description: gayoutShortDescription(node.description),
        address: { addressCountry: address.addressCountry, addressLocality: address.addressLocality },
        geo: { latitude: geo?.latitude, longitude: geo?.longitude } }
      matches.push({ node: selected, text: JSON.stringify(selected) })
    }
  }
  if (matches.length !== 1) return null
  const { node, text } = matches[0]
  const phone = typeof node.telephone === 'string' && /^[+()\d\s./-]{7,64}$/.test(node.telephone)
    && node.telephone.replace(/\D/g, '').length >= 7 && node.telephone.replace(/\D/g, '').length <= 15 ? node.telephone.trim() : null
  const description = gayoutShortDescription(node.description)
  if (!phone && !description) return null
  return { publisher_venue_id: venue.publisher_venue_id, source_json_text: text, phone_raw: phone, description,
    human_reviewed: false, contract: 'gayout_registered_venue_details:v1' }
}
