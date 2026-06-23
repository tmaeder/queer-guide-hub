import { supabase } from '@/integrations/supabase/client';

/**
 * Geo + naming context for a venue/event, used to build a `trip_places` row.
 * Search hits and recommendation-engine rows only carry `objectID/type/city`
 * (a display string), not the structured `city_id`/`country_id`/lat/lng that
 * `addPlace`/`addPlacesBulk` want for map pins and per-country safety scoring.
 * This batch-resolves those columns from the source tables in one query each.
 */
export interface EntityGeo {
  id: string;
  type: 'venue' | 'event';
  name: string;
  city_id: string | null;
  country_id: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  category: string | null;
}

export interface EntityRef {
  type: 'venue' | 'event';
  id: string;
}

/**
 * Batch-resolve geo for a mixed list of venue/event refs. Returns a Map keyed
 * by entity id (ids are UUIDs, unique across the two tables in practice). At
 * most two round-trips regardless of input size.
 */
export async function resolveEntityGeo(refs: EntityRef[]): Promise<Map<string, EntityGeo>> {
  const out = new Map<string, EntityGeo>();
  const venueIds = refs.filter((r) => r.type === 'venue').map((r) => r.id);
  const eventIds = refs.filter((r) => r.type === 'event').map((r) => r.id);

  const [venuesRes, eventsRes] = await Promise.all([
    venueIds.length > 0
      ? supabase
          .from('venues')
          .select('id, name, category, address, latitude, longitude, city_id, country_id')
          .in('id', venueIds)
      : Promise.resolve({ data: [], error: null }),
    eventIds.length > 0
      ? supabase
          .from('events')
          .select('id, title, event_type, latitude, longitude, city_id, country_id')
          .in('id', eventIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (venuesRes.error) throw venuesRes.error;
  if (eventsRes.error) throw eventsRes.error;

  for (const v of (venuesRes.data ?? []) as Array<Record<string, unknown>>) {
    out.set(v.id as string, {
      id: v.id as string,
      type: 'venue',
      name: (v.name as string) ?? '',
      city_id: (v.city_id as string) ?? null,
      country_id: (v.country_id as string) ?? null,
      latitude: (v.latitude as number) ?? null,
      longitude: (v.longitude as number) ?? null,
      address: (v.address as string) ?? null,
      category: (v.category as string) ?? null,
    });
  }
  for (const e of (eventsRes.data ?? []) as Array<Record<string, unknown>>) {
    out.set(e.id as string, {
      id: e.id as string,
      type: 'event',
      name: (e.title as string) ?? '',
      city_id: (e.city_id as string) ?? null,
      country_id: (e.country_id as string) ?? null,
      latitude: (e.latitude as number) ?? null,
      longitude: (e.longitude as number) ?? null,
      address: null,
      category: (e.event_type as string) ?? null,
    });
  }
  return out;
}

/** Build a `trip_places` insert row from resolved geo. */
export function tripPlaceRowFromGeo(geo: EntityGeo) {
  return {
    day_id: null,
    venue_id: geo.type === 'venue' ? geo.id : null,
    event_id: geo.type === 'event' ? geo.id : null,
    hotel_id: null,
    custom_name: null,
    custom_address: geo.address,
    latitude: geo.latitude,
    longitude: geo.longitude,
    city_id: geo.city_id,
    country_id: geo.country_id,
    start_time: null,
    end_time: null,
    duration_minutes: null,
    notes: null,
    category: geo.type,
    sort_order: 0,
  };
}
