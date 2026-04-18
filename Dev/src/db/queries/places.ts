import { getDb } from '../client.js'
import type { NormalizedPlace } from '../../normalize/schema.js'

export async function upsertPlace(p: NormalizedPlace): Promise<string> {
  const db = getDb()
  const rows = await db<{ id: string }[]>`
    INSERT INTO places (
      slug, name, description, tags, city, region, country,
      address, geo, website, phone, images,
      place_type, wikipedia_url, source_url, last_seen_at
    ) VALUES (
      ${p.slug}, ${p.name}, ${p.description ?? null}, ${p.tags},
      ${p.city ?? null}, ${p.region ?? null}, ${p.country ?? null},
      ${p.address ?? null}, ${p.geo ? JSON.stringify(p.geo) : null},
      ${p.website ?? null}, ${p.phone ?? null}, ${p.images},
      ${p.placeType ?? null}, ${p.wikipediaUrl ?? null},
      ${p.sourceUrl}, ${p.lastSeenAt}
    )
    ON CONFLICT (slug) DO UPDATE SET
      name          = EXCLUDED.name,
      description   = COALESCE(EXCLUDED.description, places.description),
      tags          = EXCLUDED.tags,
      city          = COALESCE(EXCLUDED.city, places.city),
      region        = COALESCE(EXCLUDED.region, places.region),
      country       = COALESCE(EXCLUDED.country, places.country),
      address       = COALESCE(EXCLUDED.address, places.address),
      geo           = COALESCE(EXCLUDED.geo, places.geo),
      website       = COALESCE(EXCLUDED.website, places.website),
      images        = CASE WHEN array_length(EXCLUDED.images,1) > 0
                       THEN EXCLUDED.images ELSE places.images END,
      place_type    = COALESCE(EXCLUDED.place_type, places.place_type),
      wikipedia_url = COALESCE(EXCLUDED.wikipedia_url, places.wikipedia_url),
      source_url    = EXCLUDED.source_url,
      last_seen_at  = EXCLUDED.last_seen_at,
      updated_at    = NOW()
    RETURNING id
  `
  return rows[0]!.id
}
