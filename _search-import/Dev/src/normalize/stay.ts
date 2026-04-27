import { slugify, safeUrl, canonicalCountry, dedupeStrings } from '../utils/text.js'
import type { SourceRawEntity, NormalizedStay } from './schema.js'

export function normalizeStay(raw: SourceRawEntity, existingSlugSuffix = ''): NormalizedStay {
  const now = new Date()
  const baseSlug = slugify(
    [raw.name, raw.city, raw.country].filter(Boolean).join('-')
  )
  const slug = existingSlugSuffix ? `${baseSlug}-${existingSlugSuffix}` : baseSlug

  return {
    entityType: 'stay',
    slug,
    name: raw.name.trim(),
    description: raw.description?.trim() ?? null,
    tags: dedupeStrings(raw.tags),
    city: raw.city?.trim() ?? null,
    region: raw.region?.trim() ?? null,
    country: raw.country ? canonicalCountry(raw.country) : null,
    address: raw.address?.trim() ?? null,
    geo: raw.geo ?? null,
    website: safeUrl(raw.website),
    phone: raw.phone?.trim() ?? null,
    images: raw.images.slice(0, 20),
    pricePerNight: raw.pricePerNight ?? null,
    priceCurrency: raw.priceCurrency?.toUpperCase() ?? null,
    amenities: dedupeStrings(raw.amenities),
    rating: raw.rating ?? null,
    reviewCount: raw.reviewCount ?? null,
    sourceUrl: raw.url,
    firstSeenAt: now,
    lastSeenAt: now,
  }
}
