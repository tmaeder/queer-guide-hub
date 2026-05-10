import { slugify, safeUrl, canonicalCountry, dedupeStrings } from '../utils/text.js'
import type { SourceRawEntity, NormalizedPlace } from './schema.js'

export function normalizePlace(raw: SourceRawEntity, existingSlugSuffix = ''): NormalizedPlace {
  const now = new Date()
  const baseSlug = slugify(
    [raw.name, raw.city, raw.country].filter(Boolean).join('-')
  )
  const slug = existingSlugSuffix ? `${baseSlug}-${existingSlugSuffix}` : baseSlug

  return {
    entityType: 'place',
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
    images: raw.images,
    placeType: raw.placeType?.toLowerCase().trim() ?? 'gay village',
    wikipediaUrl: safeUrl(raw.wikipediaUrl),
    sourceUrl: raw.url,
    firstSeenAt: now,
    lastSeenAt: now,
  }
}
