// Pure record-builder for the legacy commit fallback path.
// Per-entity SQL batch RPCs (commit_venue_staging_batch etc.) are the
// canonical path; this helper is only hit when target isn't in
// SIMPLE_COMMIT_TARGETS. Kept pure so it can be unit-tested.

export function buildRecord(
  table: string,
  normalized: Record<string, unknown>,
  enriched: Record<string, unknown>,
  _entityType: string | null,
  // injectable so tests are deterministic (kept for signature stability)
  _now: () => string = () => new Date().toISOString(),
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
      // Logos are no longer assigned at commit: a raw logo.dev URL embeds the API
      // token and is an unverified monogram. The daily enrich-logos job fetches
      // only real logos and mirrors them to R2 (token-free). Leaving logo_url null
      // keeps the row eligible for that job.
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
      if (meta.publisher_name || meta.source_name) record.publisher_name = meta.publisher_name || meta.source_name
      if (meta.published_at) record.published_at = meta.published_at
      break

    case 'organizations': {
      record.name = normalized.name
      record.description = normalized.description || enriched.description
      // Explicit identity allowlist: a submission cannot set claims, trust or visibility.
      const allowedRoles = new Set(['venue', 'organizer', 'community', 'support', 'advocacy', 'publisher', 'seller', 'hotel', 'brand', 'affiliate_partner'])
      const roles = Array.isArray(meta.roles) ? meta.roles.filter((role): role is string => typeof role === 'string' && allowedRoles.has(role)) : []
      record.roles = roles.length ? [...new Set(roles)] : ['community']
      for (const field of ['website', 'email', 'phone']) {
        if (typeof meta[field] === 'string' && meta[field]) record[field] = meta[field]
      }
      const base = String(normalized.name ?? 'organisation').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'organisation'
      record.slug = `${base}-${crypto.randomUUID().slice(0, 8)}`
      record.status = 'active' // Only reached after the pipeline's approval gates.
      break
    }

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
