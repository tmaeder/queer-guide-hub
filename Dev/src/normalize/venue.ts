import { slugify, safeUrl, canonicalCountry, dedupeStrings } from '../utils/text.js'
import type { SourceRawEntity, NormalizedVenue } from './schema.js'

export function normalizeVenue(raw: SourceRawEntity, existingSlugSuffix = ''): NormalizedVenue {
  const now = new Date()
  const canonCountry = raw.country ? canonicalCountry(raw.country) : null
  const baseSlug = slugify(
    [raw.name, raw.city, canonCountry].filter(Boolean).join('-')
  )
  const slug = existingSlugSuffix ? `${baseSlug}-${existingSlugSuffix}` : baseSlug

  return {
    entityType: 'venue',
    slug,
    name: raw.name.trim(),
    description: raw.description?.trim() ?? null,
    tags: dedupeStrings(raw.tags),
    city: raw.city?.trim() ?? null,
    region: raw.region?.trim() ?? null,
    country: canonCountry,
    address: raw.address?.trim() ?? null,
    geo: raw.geo ?? null,
    website: safeUrl(raw.website),
    phone: raw.phone?.trim() ?? null,
    images: raw.images.slice(0, 20), // cap image list
    venueType: raw.venueType?.toLowerCase().trim() ?? null,
    openingHours: raw.openingHours?.trim() ?? null,
    priceRange: raw.priceRange?.trim() ?? null,
    sourceUrl: raw.url,
    firstSeenAt: now,
    lastSeenAt: now,
  }
}
