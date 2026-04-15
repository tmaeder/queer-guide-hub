// Hotel/B&B-aware extensions to the venue pipeline.
// Pure functions — importable from pipeline-normalize, -validate, -deduplicate, -quality-score, -commit.
//
// Contract additions on normalized venue payload (when accommodation):
//   accommodation_type: 'hotel'|'bnb'|'hostel'|'resort'|'guesthouse'|'apartment'|'villa'|'campground'
//   booking_url:        string (preferred direct booking URL or OTA listing)
//   star_rating:        number 0..5
//   amenities:          string[] (canonical slugs — see CANONICAL_AMENITIES)
//   platform_ids:       { airbnb?: string; booking?: string; expedia?: string; misterbnb?: string;
//                         tripadvisor?: string; google?: string; foursquare?: string; spartacus?: string }
//   lgbtq_markers:      string[] subset of LGBTQ_MARKERS (from tags + description signals)

import { isValidUrl, isValidCoord, normalizePhone, normalizeEmail, type ValidationOutcome } from './venue-pipeline-utils.ts'

export const ACCOMMODATION_TYPES = [
  'hotel', 'bnb', 'hostel', 'resort', 'guesthouse', 'apartment', 'villa', 'campground',
] as const
export type AccommodationType = typeof ACCOMMODATION_TYPES[number]

export const PLATFORM_KEYS = [
  'airbnb', 'booking', 'expedia', 'misterbnb', 'tripadvisor',
  'google', 'foursquare', 'spartacus', 'agoda', 'hotels',
] as const

export const CANONICAL_AMENITIES = [
  'wifi', 'parking', 'breakfast', 'pool', 'gym', 'spa', 'sauna', 'hot-tub',
  'air-conditioning', 'heating', 'kitchen', 'pets-allowed', 'wheelchair-accessible',
  'bar', 'restaurant', 'room-service', 'laundry', 'family-friendly', 'adults-only',
  'beach-access', 'airport-shuttle', 'ev-charging', 'smoke-free', 'private-bathroom',
] as const

export const LGBTQ_MARKERS = [
  'lgbtq-owned', 'gay-owned', 'lesbian-owned', 'trans-owned',
  'gay-friendly', 'lesbian-friendly', 'trans-friendly', 'queer-friendly',
  'lgbtq-staff', 'gay-popular', 'cruising', 'clothing-optional', 'men-only', 'women-only',
] as const

const ACCOMMODATION_HINTS: Array<[RegExp, AccommodationType]> = [
  [/\b(b&b|bed[- ]?and[- ]?breakfast|bnb)\b/i, 'bnb'],
  [/\bhostel\b/i, 'hostel'],
  [/\bresort\b/i, 'resort'],
  [/\bguest ?house\b/i, 'guesthouse'],
  [/\b(apartment|apt|flat)\b/i, 'apartment'],
  [/\b(villa|chalet)\b/i, 'villa'],
  [/\b(camp ?ground|campsite|rv park)\b/i, 'campground'],
  [/\b(hotel|inn|motel|lodge)\b/i, 'hotel'],
]

const AMENITY_SYNONYMS: Record<string, string> = {
  'free wifi': 'wifi', 'wireless internet': 'wifi', 'internet': 'wifi',
  'free parking': 'parking', 'car park': 'parking', 'garage': 'parking',
  'swimming pool': 'pool', 'outdoor pool': 'pool', 'indoor pool': 'pool',
  'fitness center': 'gym', 'fitness centre': 'gym', 'fitness room': 'gym',
  'jacuzzi': 'hot-tub', 'whirlpool': 'hot-tub',
  'a/c': 'air-conditioning', 'ac': 'air-conditioning', 'aircon': 'air-conditioning',
  'pet friendly': 'pets-allowed', 'dogs allowed': 'pets-allowed',
  'accessible': 'wheelchair-accessible', 'ada': 'wheelchair-accessible',
  'shuttle': 'airport-shuttle',
  'no smoking': 'smoke-free', 'non smoking': 'smoke-free',
  'ensuite': 'private-bathroom', 'en-suite': 'private-bathroom',
}

export function inferAccommodationType(name: string, description?: string, hint?: string): AccommodationType | null {
  const text = `${hint ?? ''} ${name ?? ''} ${description ?? ''}`
  for (const [rx, t] of ACCOMMODATION_HINTS) if (rx.test(text)) return t
  return null
}

export function normalizeAmenities(raw: unknown): string[] {
  if (!raw) return []
  const list = Array.isArray(raw) ? raw : String(raw).split(/[;,|]+/)
  const out = new Set<string>()
  for (const item of list) {
    const s = String(item ?? '').trim().toLowerCase()
    if (!s) continue
    const slug = s.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const mapped = AMENITY_SYNONYMS[s] ?? AMENITY_SYNONYMS[slug] ?? slug
    if ((CANONICAL_AMENITIES as readonly string[]).includes(mapped)) out.add(mapped)
  }
  return [...out].sort()
}

export function normalizeStarRating(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  // Accept 0..5 or 0..10 (halve) or 0..100 (divide by 20).
  let v = n
  if (v > 5 && v <= 10)  v = v / 2
  if (v > 10 && v <= 100) v = v / 20
  if (v < 0 || v > 5) return null
  return Math.round(v * 10) / 10
}

export function normalizePlatformIds(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  const src = raw as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const k of PLATFORM_KEYS) {
    const v = src[k]
    if (v == null) continue
    const s = String(v).trim()
    if (s) out[k] = s
  }
  return out
}

export function detectLgbtqMarkers(tags: unknown, description?: unknown): string[] {
  const found = new Set<string>()
  const tagList = Array.isArray(tags) ? tags.map((t) => String(t).toLowerCase()) : []
  for (const m of LGBTQ_MARKERS) if (tagList.some((t) => t.includes(m.replace(/-/g, ' ')) || t === m)) found.add(m)
  const text = String(description ?? '').toLowerCase()
  if (text) {
    if (/lgbtq[\s-]?owned|gay[\s-]?owned/.test(text))   found.add('lgbtq-owned')
    if (/trans[\s-]?owned/.test(text))                  found.add('trans-owned')
    if (/gay[\s-]?friendly|lgbtq[\s-]?friendly/.test(text)) found.add('gay-friendly')
    if (/trans[\s-]?friendly/.test(text))               found.add('trans-friendly')
    if (/clothing[\s-]?optional/.test(text))            found.add('clothing-optional')
    if (/men[\s-]?only/.test(text))                     found.add('men-only')
    if (/women[\s-]?only/.test(text))                   found.add('women-only')
  }
  return [...found].sort()
}

/** Validate a hotel-shaped normalized payload. Extends venue validation. */
export function validateHotelNormalized(n: Record<string, unknown>): ValidationOutcome {
  const errors: string[] = []
  const warnings: string[] = []
  let quality = 100

  // Hard errors (mirror venue rules + accommodation_type required).
  const name = String(n.name ?? '').trim()
  if (name.length < 2) errors.push('E_MISSING_NAME')

  const loc = (n.location ?? {}) as Record<string, unknown>
  if (loc.lat == null || loc.lng == null) { warnings.push('W_NO_COORDS'); quality -= 10 }
  else if (!isValidCoord(loc.lat, loc.lng)) errors.push('E_BAD_COORDS')

  if (!loc.country) errors.push('E_MISSING_COUNTRY')
  if (!loc.city)    { warnings.push('W_NO_CITY');    quality -= 10 }
  if (!loc.address) { warnings.push('W_NO_ADDRESS'); quality -= 5 }

  const at = String(n.accommodation_type ?? '').toLowerCase()
  if (!at) errors.push('E_MISSING_ACCOMMODATION_TYPE')
  else if (!(ACCOMMODATION_TYPES as readonly string[]).includes(at)) errors.push('E_INVALID_ACCOMMODATION_TYPE')

  // Booking actionability.
  const bookingUrl = n.booking_url
  if (!bookingUrl)            { warnings.push('W_NO_BOOKING_URL');     quality -= 15 }
  else if (!isValidUrl(bookingUrl)) { warnings.push('W_INVALID_BOOKING_URL'); quality -= 10 }

  const stars = normalizeStarRating(n.star_rating)
  if (n.star_rating != null && stars == null) { warnings.push('W_INVALID_STAR_RATING'); quality -= 5 }

  // Amenities completeness.
  const amenities = normalizeAmenities(n.amenities)
  if (amenities.length < 3) { warnings.push('W_FEW_AMENITIES'); quality -= 10 }

  // LGBTQ marker presence.
  const markers = detectLgbtqMarkers(n.tags, n.description)
  if (markers.length === 0) { warnings.push('W_NO_LGBTQ_MARKER'); quality -= 10 }

  // Contacts.
  const c = (n.contacts ?? {}) as Record<string, unknown>
  if (!(c.phone || c.email || c.website)) { warnings.push('W_NO_CONTACT'); quality -= 5 }
  if (c.phone   && !normalizePhone(c.phone))   { warnings.push('W_INVALID_PHONE'); quality -= 3 }
  if (c.email   && !normalizeEmail(c.email))   { warnings.push('W_INVALID_EMAIL'); quality -= 3 }
  if (c.website && !isValidUrl(c.website))     { warnings.push('W_INVALID_URL');   quality -= 3 }

  // Description.
  const desc = String(n.description ?? '').trim()
  if (desc.length < 40) { warnings.push('W_SHORT_DESCRIPTION'); quality -= 5 }

  // Photos.
  const photos = Array.isArray(n.images) ? n.images : []
  if (photos.length === 0) { warnings.push('W_NO_PHOTOS'); quality -= 10 }

  // Price range sanity.
  if (n.price_range != null) {
    const p = Number(n.price_range)
    if (!Number.isFinite(p) || p < 1 || p > 4) { warnings.push('W_INVALID_PRICE_RANGE'); quality -= 3 }
  }

  return { errors, warnings, quality: Math.max(0, Math.min(100, quality)) }
}

/** Hotel-biased quality score (booking actionability + amenities heaviest). */
export function scoreHotelQuality(n: Record<string, unknown>): number {
  let s = 0
  if (String(n.name ?? '').trim().length >= 2) s += 10
  const loc = (n.location ?? {}) as Record<string, unknown>
  if (loc.lat != null && loc.lng != null) s += 10
  if (loc.city)    s += 5
  if (loc.country) s += 5
  if (loc.address) s += 5
  if (n.booking_url && isValidUrl(n.booking_url)) s += 15
  if (normalizeStarRating(n.star_rating) != null) s += 10
  const amenities = normalizeAmenities(n.amenities)
  s += Math.min(15, amenities.length * 2)            // up to 15 pts (≥8 amenities = full)
  const markers = detectLgbtqMarkers(n.tags, n.description)
  s += markers.length > 0 ? 10 : 0
  const photos = Array.isArray(n.images) ? n.images : []
  s += Math.min(10, photos.length * 2)               // up to 10 pts (≥5 photos = full)
  const desc = String(n.description ?? '').trim()
  if (desc.length >= 200) s += 10
  else if (desc.length >= 40) s += 5
  const c = (n.contacts ?? {}) as Record<string, unknown>
  if (c.phone || c.email || c.website) s += 5
  return Math.max(0, Math.min(100, s))
}

/** Disposition based on quality + warnings. */
export function hotelReviewDisposition(outcome: ValidationOutcome, qualityScore: number): 'auto_approve' | 'auto_reject' | 'review' {
  if (outcome.errors.length > 0) return 'auto_reject'
  if (qualityScore < 40)         return 'auto_reject'
  if (qualityScore >= 85 && outcome.warnings.length <= 2) return 'auto_approve'
  return 'review'
}
