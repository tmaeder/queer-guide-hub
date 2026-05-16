// Pure record-builder for the legacy commit fallback path.
// Per-entity SQL batch RPCs (commit_venue_staging_batch etc.) are the
// canonical path; this helper is only hit when target isn't in
// SIMPLE_COMMIT_TARGETS. Kept pure so it can be unit-tested.

import { logoUrlFromWebsite } from '../_shared/logo-enrichment.ts'

export function buildRecord(
  table: string,
  normalized: Record<string, unknown>,
  enriched: Record<string, unknown>,
  _entityType: string | null,
  // injectable so tests are deterministic
  now: () => string = () => new Date().toISOString(),
): Record<string, unknown> {
  const meta = (normalized.metadata ?? {}) as Record<string, unknown>
  const loc  = (normalized.location ?? {}) as Record<string, unknown>
  const record: Record<string, unknown> = {}

  switch (table) {
    case 'events':
      record.title       = normalized.name
      record.description = normalized.description || enriched.description
      record.start_date  = (normalized.dates as Record<string, unknown>)?.start
      record.end_date    = (normalized.dates as Record<string, unknown>)?.end
      if (loc.city) record.location = loc.city
      if (meta.url) record.url = meta.url
      {
        const site = meta.website || meta.url || ((normalized.urls as string[]) ?? [])[0]
        if (site) {
          const logo = logoUrlFromWebsite(site as string)
          if (logo) {
            record.logo_url = logo
            record.logo_fetched_at = now()
          }
        }
      }
      break

    case 'personalities':
      record.name = normalized.name
      record.bio  = normalized.description || enriched.description
      if (meta.birth_date)  record.birth_date  = meta.birth_date
      if (meta.nationality) record.nationality = meta.nationality
      if (meta.profession)  record.profession  = meta.profession
      break

    case 'news_articles':
      record.title     = normalized.name
      record.content   = normalized.description
      record.url       = ((normalized.urls as string[]) ?? [])[0]
      record.image_url = ((normalized.images as string[]) ?? [])[0]
      if (meta.source_name)  record.publisher_name = meta.source_name
      if (meta.published_at) record.published_at = meta.published_at
      break

    case 'countries':
      record.name = normalized.name
      record.code = meta.code || meta.cca2
      break

    default:
      if (normalized.name)        record.name        = normalized.name
      if (normalized.description) record.description = normalized.description
      Object.assign(record, meta)
  }

  return record
}
