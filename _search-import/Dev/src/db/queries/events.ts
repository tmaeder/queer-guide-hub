import { getDb } from '../client.js'
import type { NormalizedEvent } from '../../normalize/schema.js'

export async function upsertEvent(e: NormalizedEvent): Promise<string> {
  const db = getDb()
  const rows = await db<{ id: string }[]>`
    INSERT INTO events (
      slug, name, description, tags, city, region, country,
      address, geo, website, phone, images,
      start_datetime, end_datetime, timezone,
      venue_id, ticket_url, price_range, source_url, last_seen_at
    ) VALUES (
      ${e.slug}, ${e.name}, ${e.description ?? null}, ${e.tags},
      ${e.city ?? null}, ${e.region ?? null}, ${e.country ?? null},
      ${e.address ?? null}, ${e.geo ? JSON.stringify(e.geo) : null},
      ${e.website ?? null}, ${e.phone ?? null}, ${e.images},
      ${e.startDatetime}, ${e.endDatetime ?? null}, ${e.timezone ?? null},
      ${e.venueId ?? null}, ${e.ticketUrl ?? null},
      ${e.priceRange ?? null}, ${e.sourceUrl}, ${e.lastSeenAt}
    )
    ON CONFLICT (slug) DO UPDATE SET
      name           = EXCLUDED.name,
      description    = COALESCE(EXCLUDED.description, events.description),
      tags           = EXCLUDED.tags,
      city           = COALESCE(EXCLUDED.city, events.city),
      region         = COALESCE(EXCLUDED.region, events.region),
      country        = COALESCE(EXCLUDED.country, events.country),
      address        = COALESCE(EXCLUDED.address, events.address),
      geo            = COALESCE(EXCLUDED.geo, events.geo),
      website        = COALESCE(EXCLUDED.website, events.website),
      images         = CASE WHEN array_length(EXCLUDED.images,1) > 0
                         THEN EXCLUDED.images ELSE events.images END,
      start_datetime = EXCLUDED.start_datetime,
      end_datetime   = COALESCE(EXCLUDED.end_datetime, events.end_datetime),
      timezone       = COALESCE(EXCLUDED.timezone, events.timezone),
      venue_id       = COALESCE(EXCLUDED.venue_id, events.venue_id),
      ticket_url     = COALESCE(EXCLUDED.ticket_url, events.ticket_url),
      price_range    = COALESCE(EXCLUDED.price_range, events.price_range),
      source_url     = EXCLUDED.source_url,
      last_seen_at   = EXCLUDED.last_seen_at,
      updated_at     = NOW()
    RETURNING id
  `
  return rows[0]!.id
}

/** Return upcoming events within the next `days` days. */
export async function getUpcomingEvents(days = 90) {
  const db = getDb()
  return db<{ id: string; name: string; start_datetime: Date; city: string | null }[]>`
    SELECT id, name, start_datetime, city
    FROM events
    WHERE start_datetime BETWEEN NOW() AND NOW() + make_interval(days => ${days})
    ORDER BY start_datetime
  `
}
