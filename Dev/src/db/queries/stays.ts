import { getDb } from '../client.js'
import type { NormalizedStay } from '../../normalize/schema.js'

export async function upsertStay(s: NormalizedStay): Promise<string> {
  const db = getDb()
  const rows = await db<{ id: string }[]>`
    INSERT INTO stays (
      slug, name, description, tags, city, region, country,
      address, geo, website, phone, images,
      price_per_night, price_currency, amenities,
      rating, review_count, source_url, last_seen_at
    ) VALUES (
      ${s.slug}, ${s.name}, ${s.description ?? null}, ${s.tags},
      ${s.city ?? null}, ${s.region ?? null}, ${s.country ?? null},
      ${s.address ?? null}, ${s.geo ? JSON.stringify(s.geo) : null},
      ${s.website ?? null}, ${s.phone ?? null}, ${s.images},
      ${s.pricePerNight ?? null}, ${s.priceCurrency ?? null}, ${s.amenities},
      ${s.rating ?? null}, ${s.reviewCount ?? null},
      ${s.sourceUrl}, ${s.lastSeenAt}
    )
    ON CONFLICT (slug) DO UPDATE SET
      name            = EXCLUDED.name,
      description     = COALESCE(EXCLUDED.description, stays.description),
      tags            = EXCLUDED.tags,
      city            = COALESCE(EXCLUDED.city, stays.city),
      country         = COALESCE(EXCLUDED.country, stays.country),
      geo             = COALESCE(EXCLUDED.geo, stays.geo),
      website         = COALESCE(EXCLUDED.website, stays.website),
      images          = CASE WHEN array_length(EXCLUDED.images,1) > 0
                         THEN EXCLUDED.images ELSE stays.images END,
      price_per_night = COALESCE(EXCLUDED.price_per_night, stays.price_per_night),
      price_currency  = COALESCE(EXCLUDED.price_currency, stays.price_currency),
      amenities       = CASE WHEN array_length(EXCLUDED.amenities,1) > 0
                         THEN EXCLUDED.amenities ELSE stays.amenities END,
      rating          = COALESCE(EXCLUDED.rating, stays.rating),
      review_count    = COALESCE(EXCLUDED.review_count, stays.review_count),
      source_url      = EXCLUDED.source_url,
      last_seen_at    = EXCLUDED.last_seen_at,
      updated_at      = NOW()
    RETURNING id
  `
  return rows[0]!.id
}
