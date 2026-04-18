import { slugify, safeUrl, canonicalCountry, dedupeStrings } from '../utils/text.js'
import { parseDate, inferTimezone } from '../utils/date.js'
import type { SourceRawEntity, NormalizedEvent } from './schema.js'

export function normalizeEvent(
  raw: SourceRawEntity,
  existingSlugSuffix = ''
): NormalizedEvent | null {
  const startDatetime = parseDate(raw.startDatetime)
  if (!startDatetime) return null // Events without a start date are unusable

  const now = new Date()
  const dateTag = startDatetime.toISOString().slice(0, 10)
  const baseSlug = slugify(
    [raw.name, raw.city, raw.country, dateTag].filter(Boolean).join('-')
  )
  const slug = existingSlugSuffix ? `${baseSlug}-${existingSlugSuffix}` : baseSlug

  const timezone =
    raw.timezone ?? inferTimezone(raw.country)

  return {
    entityType: 'event',
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
    startDatetime,
    endDatetime: parseDate(raw.endDatetime),
    timezone,
    venueId: null, // resolved in orchestrator if possible
    ticketUrl: safeUrl(raw.ticketUrl),
    priceRange: raw.priceRange?.trim() ?? null,
    sourceUrl: raw.url,
    firstSeenAt: now,
    lastSeenAt: now,
  }
}
