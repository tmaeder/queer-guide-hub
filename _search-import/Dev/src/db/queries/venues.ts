import { getDb } from '../client.js'
import type { NormalizedVenue } from '../../normalize/schema.js'

export async function upsertVenue(v: NormalizedVenue): Promise<string> {
  const db = getDb()
  const rows = await db<{ id: string }[]>`
    INSERT INTO venues (
      slug, name, description, tags, city, region, country,
      address, geo, website, phone, images, venue_type,
      opening_hours, price_range, source_url, last_seen_at
    ) VALUES (
      ${v.slug}, ${v.name}, ${v.description ?? null}, ${v.tags},
      ${v.city ?? null}, ${v.region ?? null}, ${v.country ?? null},
      ${v.address ?? null}, ${v.geo ? JSON.stringify(v.geo) : null},
      ${v.website ?? null}, ${v.phone ?? null}, ${v.images},
      ${v.venueType ?? null}, ${v.openingHours ?? null},
      ${v.priceRange ?? null}, ${v.sourceUrl}, ${v.lastSeenAt}
    )
    ON CONFLICT (slug) DO UPDATE SET
      name          = EXCLUDED.name,
      description   = COALESCE(EXCLUDED.description, venues.description),
      tags          = EXCLUDED.tags,
      city          = COALESCE(EXCLUDED.city, venues.city),
      region        = COALESCE(EXCLUDED.region, venues.region),
      country       = COALESCE(EXCLUDED.country, venues.country),
      address       = COALESCE(EXCLUDED.address, venues.address),
      geo           = COALESCE(EXCLUDED.geo, venues.geo),
      website       = COALESCE(EXCLUDED.website, venues.website),
      phone         = COALESCE(EXCLUDED.phone, venues.phone),
      images        = CASE WHEN array_length(EXCLUDED.images,1) > 0
                        THEN EXCLUDED.images ELSE venues.images END,
      venue_type    = COALESCE(EXCLUDED.venue_type, venues.venue_type),
      opening_hours = COALESCE(EXCLUDED.opening_hours, venues.opening_hours),
      price_range   = COALESCE(EXCLUDED.price_range, venues.price_range),
      source_url    = EXCLUDED.source_url,
      last_seen_at  = EXCLUDED.last_seen_at,
      updated_at    = NOW()
    RETURNING id
  `
  return rows[0]!.id
}

export async function findVenueBySlug(slug: string) {
  const db = getDb()
  const rows = await db<{ id: string; name: string }[]>`
    SELECT id, name FROM venues WHERE slug = ${slug} LIMIT 1
  `
  return rows[0] ?? null
}

export async function findVenuesByCity(city: string, country?: string) {
  const db = getDb()
  if (country) {
    return db<{ id: string; name: string; slug: string }[]>`
      SELECT id, name, slug FROM venues
      WHERE lower(city) = lower(${city})
        AND lower(country) = lower(${country})
    `
  }
  return db<{ id: string; name: string; slug: string }[]>`
    SELECT id, name, slug FROM venues
    WHERE lower(city) = lower(${city})
  `
}
