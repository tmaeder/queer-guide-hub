import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LAYER_COLORS } from '@/hooks/useExploreMapData';
import type { EntityMapMarker } from '@/components/map/EntityMap';

interface Options {
  /** Venue ids to drop from results (the focused venue, or an org's own set). */
  excludeVenueIds?: string[];
  lat: number | null;
  lng: number | null;
  /** Search radius for venues (km). Events/hotels use a slightly wider box. */
  radiusKm?: number;
  enabled?: boolean;
}

interface RankedRow {
  venue: { id: string; slug: string | null; name: string; latitude: number | null; longitude: number | null; category: string | null };
  distance_m: number | null;
}

interface NearbyEventRow {
  id: string;
  slug: string | null;
  title: string;
  latitude: number | null;
  longitude: number | null;
  start_date: string | null;
}

interface NearbyHotelRow {
  id: string;
  slug: string | null;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

/** Degrees of latitude/longitude that span ~`km` at the given latitude. */
function bbox(lat: number, lng: number, km: number) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

/**
 * Other venues + upcoming events around a point, as map markers (non-primary).
 * Nearby venues come from the RLS-safe `rpc_venues_ranked` (distance sort);
 * events from a bounding-box query. Both honour the safety gate, so high-risk
 * gated rows only appear for signed-in users. Returns `[]` until coords resolve.
 */
export function useNearbyMapPoints({
  excludeVenueIds,
  lat,
  lng,
  radiusKm = 2,
  enabled = true,
}: Options): EntityMapMarker[] {
  const ready = enabled && lat != null && lng != null;
  const excludeKey = (excludeVenueIds ?? []).join(',');
  const excluded = useMemo(() => new Set(excludeVenueIds ?? []), [excludeVenueIds]);

  const { data: venues = [] } = useQuery({
    queryKey: ['nearby-map-venues', lat, lng, radiusKm, excludeKey],
    enabled: ready,
    staleTime: 300_000,
    queryFn: async (): Promise<EntityMapMarker[]> => {
      const { data, error } = await (
        supabase as unknown as {
          rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: RankedRow[] | null; error: unknown }>;
        }
      ).rpc('rpc_venues_ranked', {
        p_user_id: null,
        p_lat: lat,
        p_lng: lng,
        p_filters: { radiusKm },
        p_sort: 'distance',
        p_limit: 16,
        p_offset: 0,
      });
      if (error || !data) return [];
      return data
        .map((r) => r.venue)
        .filter(
          (v) =>
            !excluded.has(v.id) &&
            v.slug &&
            typeof v.latitude === 'number' &&
            typeof v.longitude === 'number',
        )
        .slice(0, 12)
        .map((v) => ({
          id: v.id,
          lat: Number(v.latitude),
          lng: Number(v.longitude),
          name: v.name,
          subtitle: v.category ?? undefined,
          type: 'venues' as const,
          color: LAYER_COLORS.venues,
          linkTo: `/venues/${v.slug}`,
        }));
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ['nearby-map-events', lat, lng, radiusKm],
    enabled: ready,
    staleTime: 300_000,
    queryFn: async (): Promise<EntityMapMarker[]> => {
      const box = bbox(lat as number, lng as number, radiusKm + 1);
      const { data, error } = await supabase
        .from('events')
        .select('id, slug, title, latitude, longitude, start_date')
        .gte('latitude', box.minLat)
        .lte('latitude', box.maxLat)
        .gte('longitude', box.minLng)
        .lte('longitude', box.maxLng)
        .gte('start_date', new Date().toISOString())
        .neq('status', 'archived')
        .order('start_date', { ascending: true })
        .limit(10);
      if (error || !data) return [];
      return (data as NearbyEventRow[])
        .filter((e) => e.slug && typeof e.latitude === 'number' && typeof e.longitude === 'number')
        .map((e) => ({
          id: e.id,
          lat: Number(e.latitude),
          lng: Number(e.longitude),
          name: e.title,
          subtitle: e.start_date ? new Date(e.start_date).toLocaleDateString() : undefined,
          type: 'events' as const,
          color: LAYER_COLORS.events,
          linkTo: `/events/${e.slug}`,
        }));
    },
  });

  const { data: hotels = [] } = useQuery({
    queryKey: ['nearby-map-hotels', lat, lng, radiusKm],
    enabled: ready,
    staleTime: 300_000,
    queryFn: async (): Promise<EntityMapMarker[]> => {
      const box = bbox(lat as number, lng as number, radiusKm + 1);
      const { data, error } = await supabase
        .from('hotels')
        .select('id, slug, name, latitude, longitude')
        .gte('latitude', box.minLat)
        .lte('latitude', box.maxLat)
        .gte('longitude', box.minLng)
        .lte('longitude', box.maxLng)
        .limit(6);
      if (error || !data) return [];
      return (data as NearbyHotelRow[])
        .filter((h) => h.slug && typeof h.latitude === 'number' && typeof h.longitude === 'number')
        .map((h) => ({
          id: h.id,
          lat: Number(h.latitude),
          lng: Number(h.longitude),
          name: h.name,
          type: 'hotels' as const,
          color: LAYER_COLORS.hotels,
          linkTo: `/hotels/${h.slug}`,
        }));
    },
  });

  return useMemo(() => [...venues, ...events, ...hotels], [venues, events, hotels]);
}
