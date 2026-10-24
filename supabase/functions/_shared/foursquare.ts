import { FOURSQUARE_DISCOVERY_TERM } from './foursquare-discovery-filter.ts'
import type { NormalizedItem, RawItem } from './source-adapter.ts'
import { extractDomain, normalizeEmail, normalizeName, normalizePhone } from './venue-pipeline-utils.ts'

export const FOURSQUARE_API_BASE = 'https://places-api.foursquare.com'
export const FOURSQUARE_API_VERSION = '2025-06-17'

// Pro-only response fields. Premium fields (photos, rating, hours, attributes,
// description, popularity, price, stats, tastes, tips, veracity_rating) are
// deliberately excluded: requesting one turns Search into a billable Premium
// call, which violates this integration's zero-spend contract.
export const FOURSQUARE_SEARCH_FIELDS = [
  'fsq_place_id',
  'name',
  'latitude',
  'longitude',
  'location',
  'categories',
  'tel',
  'website',
  'email',
  'social_media',
  'date_closed',
  'placemaker_url',
  'unresolved_flags',
].join(',')

export type FoursquareSource = 'foursquare' | 'foursquare_os'

export interface FoursquareCategory {
  fsq_category_id?: string
  category_id?: string
  name?: string
  short_name?: string
  category_name?: string
  category_label?: string
}

export interface FoursquarePlace {
  fsq_place_id?: string
  fsq_id?: string
  name?: string
  latitude?: number | string | null
  longitude?: number | string | null
  geocodes?: { main?: { latitude?: number; longitude?: number } }
  location?: Record<string, unknown>
  address?: string
  locality?: string
  region?: string
  postcode?: string
  country?: string
  categories?: FoursquareCategory[]
  fsq_category_ids?: string[]
  fsq_category_labels?: string[]
  description?: string
  tel?: string
  website?: string
  email?: string
  hours?: unknown
  rating?: number | string
  price?: number | string
  photos?: Array<Record<string, unknown>>
  attributes?: Record<string, unknown>
  features?: Record<string, unknown>
  tastes?: string[]
  social_media?: Record<string, unknown>
  stats?: Record<string, unknown>
  popularity?: number | string
  date_created?: string
  date_refreshed?: string
  date_closed?: string
  placemaker_url?: string
  unresolved_flags?: string[]
  facebook_id?: string
  instagram?: string
  twitter?: string
  _search_city?: string
  _search_term?: string
  _is_accommodation?: boolean
  _source_release_id?: string
  _requires_editorial_review?: boolean
  [key: string]: unknown
}

export interface CategoryDecision {
  venueCategory: string
  accommodationType?: string
  labels: string[]
}

const asFinite = (value: unknown): number | null => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const cleanStrings = (values: unknown[]): string[] => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const cleaned = value.trim()
    const key = cleaned.toLowerCase()
    if (!cleaned || seen.has(key)) continue
    seen.add(key)
    result.push(cleaned)
  }
  return result
}

export function foursquarePlaceId(place: FoursquarePlace): string | null {
  const value = place.fsq_place_id ?? place.fsq_id
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function categoryLabels(place: FoursquarePlace): string[] {
  return cleanStrings([
    ...(place.fsq_category_labels ?? []),
    ...(place.categories ?? []).flatMap((category) => [
      category.category_label,
      category.category_name,
      category.name,
      category.short_name,
    ]),
  ])
}

export function categoryIds(place: FoursquarePlace): string[] {
  return cleanStrings([
    ...(place.fsq_category_ids ?? []),
    ...(place.categories ?? []).map((category) => category.fsq_category_id ?? category.category_id),
  ])
}

export function classifyFoursquareCategories(place: FoursquarePlace): CategoryDecision {
  const labels = categoryLabels(place)
  const joined = labels.join(' > ').toLowerCase()

  if (/(bed\s*(and|&)\s*breakfast|\bb&b\b)/.test(joined)) {
    return { venueCategory: 'hotel', accommodationType: 'bnb', labels }
  }
  if (/\bhostel\b/.test(joined)) return { venueCategory: 'hotel', accommodationType: 'hostel', labels }
  if (/\bresort\b/.test(joined)) return { venueCategory: 'hotel', accommodationType: 'resort', labels }
  if (/(guest\s*house|guesthouse)/.test(joined)) {
    return { venueCategory: 'hotel', accommodationType: 'guesthouse', labels }
  }
  if (/\b(apartment|apart-hotel|aparthotel)\b/.test(joined)) {
    return { venueCategory: 'hotel', accommodationType: 'apartment', labels }
  }
  if (/\bvilla\b/.test(joined)) return { venueCategory: 'hotel', accommodationType: 'villa', labels }
  if (/(campground|camping)/.test(joined)) {
    return { venueCategory: 'hotel', accommodationType: 'campground', labels }
  }
  if (place._is_accommodation || /(hotel|motel|lodging|inn\b)/.test(joined)) {
    return { venueCategory: 'hotel', accommodationType: 'hotel', labels }
  }
  if (/(night\s*club|dance\s*club|disco)/.test(joined)) return { venueCategory: 'club', labels }
  if (/(\bbar\b|\bpub\b|cocktail|beer garden|wine bar)/.test(joined)) {
    return { venueCategory: 'bar', labels }
  }
  if (/(restaurant|cafe|coffee shop|diner|food court)/.test(joined)) {
    return { venueCategory: 'restaurant', labels }
  }
  if (/sauna|bathhouse/.test(joined)) return { venueCategory: 'sauna', labels }
  if (/(theat(er|re)|performing arts)/.test(joined)) return { venueCategory: 'theater', labels }
  if (/(art gallery|gallery|museum)/.test(joined)) return { venueCategory: 'gallery', labels }
  if (/(community cent(er|re)|community and government)/.test(joined)) {
    return { venueCategory: 'community_center', labels }
  }
  if (/(non-profit|nonprofit|organization|association)/.test(joined)) {
    return { venueCategory: 'organization', labels }
  }
  if (/(event venue|concert hall|music venue|convention cent(er|re))/.test(joined)) {
    return { venueCategory: 'event-venue', labels }
  }
  return { venueCategory: 'other', labels }
}

export function foursquarePhotoUrls(
  photos: Array<Record<string, unknown>> | undefined,
  size = '300x300',
): string[] {
  if (!Array.isArray(photos)) return []
  return photos.slice(0, 3).flatMap((photo) => {
    const prefix = typeof photo.prefix === 'string' ? photo.prefix : ''
    const suffix = typeof photo.suffix === 'string' ? photo.suffix : ''
    return prefix && suffix ? [`${prefix}${size}${suffix}`] : []
  })
}

export function queerDiscoveryEvidence(place: FoursquarePlace): string[] {
  const evidence: string[] = []
  const signals: Array<[string, unknown]> = [
    ['name', place.name],
    ['description', place.description],
    ['website', place.website],
    ['instagram', place.instagram ?? place.social_media?.instagram],
    ['categories', categoryLabels(place).join(' ')],
    ['tastes', (place.tastes ?? []).join(' ')],
  ]
  // Terms are deliberately narrow. "pride" and "rainbow" alone produce many
  // unrelated businesses; they stay discovery search terms but are not evidence.
  const queerTerm = FOURSQUARE_DISCOVERY_TERM
  for (const [field, value] of signals) {
    if (typeof value === 'string' && queerTerm.test(value)) evidence.push(field)
  }
  return evidence
}

export function normalizeFoursquareAggregateStats(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('aggregate_stats must be an object')
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length > 50) throw new Error('aggregate_stats exceeds 50 counters')
  const normalized: Record<string, number> = {}
  for (const [key, raw] of entries) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) throw new Error(`invalid aggregate counter: ${key}`)
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || !Number.isInteger(raw)) {
      throw new Error(`aggregate counter ${key} must be a non-negative integer`)
    }
    normalized[key] = raw
  }
  return normalized
}

export function normalizeFoursquarePlace(
  raw: RawItem,
  sourceName: FoursquareSource = 'foursquare',
): NormalizedItem {
  const place = raw.data as FoursquarePlace
  const location = (place.location ?? {}) as Record<string, unknown>
  const legacyGeo = place.geocodes?.main ?? {}
  const decision = classifyFoursquareCategories(place)
  const ids = categoryIds(place)
  const lat = asFinite(place.latitude ?? legacyGeo.latitude)
  const lng = asFinite(place.longitude ?? legacyGeo.longitude)
  const countryRaw = String(location.country ?? place.country ?? '').trim()
  const countryCode = countryRaw.length === 2 ? countryRaw.toUpperCase() : ''
  const attributes = place.attributes ?? place.features ?? {}
  const labels = decision.labels
  const tags = cleanStrings([...(place.tastes ?? []), ...labels]).map((value) => value.toLowerCase()).slice(0, 15)
  const evidence = queerDiscoveryEvidence(place)
  const socialMedia = {
    ...(place.social_media ?? {}),
    ...(place.facebook_id ? { facebook_id: place.facebook_id } : {}),
    ...(place.instagram ? { instagram: place.instagram } : {}),
    ...(place.twitter ? { twitter: place.twitter } : {}),
  }

  return {
    entityType: 'venue',
    sourceId: raw.sourceId,
    sourceName,
    name: String(place.name ?? '').trim().slice(0, 200),
    description: String(place.description ?? '').trim(),
    category: decision.venueCategory,
    location: {
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      address: String(location.formatted_address ?? location.address ?? place.address ?? '').trim(),
      city: String(location.locality ?? place.locality ?? location.region ?? place.region ?? place._search_city ?? '').trim(),
      country: countryRaw,
      countryCode,
    },
    urls: place.website ? [String(place.website)] : [],
    images: foursquarePhotoUrls(place.photos),
    tags,
    contacts: {
      phone: place.tel ? String(place.tel) : undefined,
      website: place.website ? String(place.website) : undefined,
      email: place.email ? String(place.email) : undefined,
    },
    metadata: {
      foursquare_id: raw.sourceId,
      foursquare_rating: asFinite(place.rating),
      price_range: asFinite(place.price),
      categories: labels,
      category_ids: ids,
      attributes,
      social_media: socialMedia,
      stats: place.stats ?? {},
      popularity: asFinite(place.popularity),
      date_created: place.date_created,
      date_refreshed: place.date_refreshed,
      date_closed: place.date_closed,
      placemaker_url: place.placemaker_url,
      unresolved_flags: place.unresolved_flags ?? [],
      source_release_id: place._source_release_id,
      requires_editorial_review: place._requires_editorial_review === true,
      discovery_evidence: evidence,
      search_term: place._search_term,
      platform_ids: { foursquare: raw.sourceId },
      data_source: sourceName,
    },
    ...(decision.accommodationType ? { accommodation_type: decision.accommodationType } : {}),
    ...(place.hours ? { hours: place.hours } : {}),
    ...(Object.keys(attributes).length ? { amenities: foursquareAttributesToAmenities(attributes) } : {}),
    platform_ids: { foursquare: raw.sourceId },
    lgbtq_markers: evidence.map((field) => `foursquare-${field}`),
  } as NormalizedItem
}

export function foursquareAttributesToAmenities(attributes: Record<string, unknown>): string[] {
  const amenities: string[] = []
  if (attributes.restroom === true) amenities.push('restroom')
  if (attributes.outdoor_seating === true) amenities.push('outdoor-seating')
  if (attributes.has_parking === true) amenities.push('parking')
  if (attributes.delivery === true) amenities.push('delivery')
  if (attributes.reservations === true) amenities.push('reservations')
  if (attributes.takes_credit_card === true) amenities.push('credit-cards')
  if (typeof attributes.wifi === 'string' && attributes.wifi.toLowerCase() !== 'no') amenities.push('wifi')
  return amenities
}

export interface SearchRequest {
  query: string
  near?: string
  latitude?: number
  longitude?: number
  radius?: number
  limit?: number
  categoryIds?: string[]
}

export function buildFoursquareSearchUrl(input: SearchRequest): string {
  const params = new URLSearchParams({
    query: input.query,
    limit: String(Math.max(1, Math.min(input.limit ?? 20, 50))),
    fields: FOURSQUARE_SEARCH_FIELDS,
  })
  if (input.near) params.set('near', input.near)
  if (Number.isFinite(input.latitude) && Number.isFinite(input.longitude)) {
    params.set('ll', `${input.latitude},${input.longitude}`)
    params.set('radius', String(Math.max(0, Math.min(input.radius ?? 30_000, 100_000))))
  }
  if (input.categoryIds?.length) params.set('fsq_category_ids', input.categoryIds.join(','))
  return `${FOURSQUARE_API_BASE}/places/search?${params}`
}

export const FSQ_DELTA_ORDER = ['add', 'update', 'merge', 'remove'] as const
export type FoursquareDeltaAction = typeof FSQ_DELTA_ORDER[number]

export interface FoursquareDeltaRecord {
  fsq_place_id: string
  action: FoursquareDeltaAction
  redirect?: string | null
  place?: FoursquarePlace
}

export function orderFoursquareDeltas(records: FoursquareDeltaRecord[]): FoursquareDeltaRecord[] {
  const rank = new Map(FSQ_DELTA_ORDER.map((action, index) => [action, index]))
  return [...records].sort((a, b) => (rank.get(a.action) ?? 99) - (rank.get(b.action) ?? 99))
}

export interface MatchableVenue {
  id: string
  name: string
  latitude?: number | null
  longitude?: number | null
  address?: string | null
  city?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  foursquare_id?: string | null
  platform_ids?: Record<string, unknown> | null
}

export interface PlaceMatchDecision {
  venueId: string | null
  confidence: number
  disposition: 'auto_match' | 'review' | 'no_match'
  reasons: string[]
  ambiguous: boolean
}

function distanceMetres(a: FoursquarePlace, b: MatchableVenue): number | null {
  const lat1 = asFinite(a.latitude ?? a.geocodes?.main?.latitude)
  const lng1 = asFinite(a.longitude ?? a.geocodes?.main?.longitude)
  const lat2 = asFinite(b.latitude)
  const lng2 = asFinite(b.longitude)
  if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) return null
  const radians = (degrees: number) => degrees * Math.PI / 180
  const dLat = radians(lat2 - lat1)
  const dLng = radians(lng2 - lng1)
  const q = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q))
}

function scoreCandidate(place: FoursquarePlace, venue: MatchableVenue): { score: number; reasons: string[] } {
  const placeId = foursquarePlaceId(place)
  const knownId = String(venue.foursquare_id ?? venue.platform_ids?.foursquare ?? '')
  if (placeId && knownId === placeId) return { score: 1, reasons: ['foursquare_id'] }

  const reasons: string[] = []
  const distance = distanceMetres(place, venue)
  const sameName = normalizeName(place.name) !== '' && normalizeName(place.name) === normalizeName(venue.name)
  const samePhone = normalizePhone(place.tel) !== null && normalizePhone(place.tel) === normalizePhone(venue.phone)
  const sameEmail = normalizeEmail(place.email) !== null && normalizeEmail(place.email) === normalizeEmail(venue.email)
  const sameDomain = extractDomain(place.website) !== null && extractDomain(place.website) === extractDomain(venue.website)
  const placeAddress = String(place.location?.formatted_address ?? place.location?.address ?? place.address ?? '')
  const sameAddress = normalizeName(placeAddress) !== '' && normalizeName(placeAddress) === normalizeName(venue.address)
  const sameCity = normalizeName(place.locality ?? place.location?.locality) !== ''
    && normalizeName(place.locality ?? place.location?.locality) === normalizeName(venue.city)

  if (samePhone) reasons.push('phone')
  if (sameEmail) reasons.push('email')
  if (sameDomain) reasons.push('website_domain')
  if (sameName) reasons.push('name')
  if (sameAddress) reasons.push('address')
  if (distance !== null && distance <= 75) reasons.push('distance_75m')

  if ((samePhone || sameEmail) && (distance === null || distance <= 5_000)) return { score: 0.99, reasons }
  if (sameDomain && sameName && (distance === null || distance <= 1_000)) return { score: 0.98, reasons }
  if (sameName && distance !== null && distance <= 75) return { score: 0.96, reasons }
  if (sameName && sameAddress) return { score: 0.94, reasons }
  if (sameName && sameCity) return { score: 0.78, reasons: [...reasons, 'city'] }
  return { score: 0, reasons }
}

export function matchFoursquarePlace(
  place: FoursquarePlace,
  venues: MatchableVenue[],
): PlaceMatchDecision {
  const ranked = venues
    .map((venue) => ({ venue, ...scoreCandidate(place, venue) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
  const best = ranked[0]
  if (!best) return { venueId: null, confidence: 0, disposition: 'no_match', reasons: [], ambiguous: false }
  const ambiguous = Boolean(ranked[1] && best.score - ranked[1].score < 0.05)
  const disposition = best.score >= 0.95 && !ambiguous
    ? 'auto_match'
    : best.score >= 0.75 ? 'review' : 'no_match'
  return {
    venueId: disposition === 'no_match' ? null : best.venue.id,
    confidence: best.score,
    disposition,
    reasons: best.reasons,
    ambiguous,
  }
}
