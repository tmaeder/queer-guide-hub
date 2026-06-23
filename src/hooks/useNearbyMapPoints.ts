/**
 * Nearby place-anchored points for a detail-page map. Given a focus
 * coordinate, returns clickable secondary markers for venues, events and
 * hotels within a small radius — so a single event/venue/hotel/org map also
 * shows what else is around it. RLS handles safety-gating automatically
 * (gated rows never reach anon callers), so no extra filtering is needed.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LAYER_COLORS } from '@/hooks/useExploreMapData';
import type { EntityMapMarker } from '@/components/map/EntityMap';

type ExcludeType = 'venue' | 'event' | 'hotel';

interface NearbyOpts {
  lat?: number | null;
  lng?: number | null;
  /** The focus entity itself — excluded from results. */
  excludeType?: ExcludeType;
  excludeId?: string | null;
  /** Search radius in km (default 3). */
  radiusKm?: number;
  /** Max total markers returned (default 24). */
  limit?: number;
  enabled?: boolean;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

interface Row {
  id: string;
  slug: string | null;
  name?: string | null;
  title?: string | null;
  latitude: number | null;
  longitude: number | null;
}

async function fetchNearby(o: NearbyOpts): Promise<EntityMapMarker[]> {
  const { lat, lng, excludeType, excludeId, radiusKm = 3, limit = 24 } = o;
  if (typeof lat !== 'number' || typeof lng !== 'number') return [];

  const latPad = radiusKm / 111;
  const lngPad = radiusKm / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  const minLat = lat - latPad;
  const maxLat = lat + latPad;
  const minLng = lng - lngPad;
  const maxLng = lng + lngPad;
  const perType = 40;
  const nowIso = new Date().toISOString();
  // events with no end_date: keep if they started within the last 12h
  const graceIso = new Date(Date.now() - 12 * 3_600_000).toISOString();

  const bbox = <T,>(q: T): T =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (q as any)
      .gte('latitude', minLat)
      .lte('latitude', maxLat)
      .gte('longitude', minLng)
      .lte('longitude', maxLng)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .limit(perType);

  const venuesQ = bbox(supabase.from('venues').select('id, slug, name, latitude, longitude'));
  const eventsQ = bbox(
    supabase
      .from('events')
      .select('id, slug, title, latitude, longitude, end_date, start_date')
      .eq('status', 'active')
      .or(`end_date.gte.${nowIso},and(end_date.is.null,start_date.gte.${graceIso})`),
  );
  const hotelsQ = bbox(supabase.from('hotels').select('id, slug, name, latitude, longitude'));

  const [venues, events, hotels] = await Promise.all([
    venuesQ.then((r) => (r.data ?? []) as Row[]).catch(() => [] as Row[]),
    eventsQ.then((r) => (r.data ?? []) as Row[]).catch(() => [] as Row[]),
    hotelsQ.then((r) => (r.data ?? []) as Row[]).catch(() => [] as Row[]),
  ]);

  const build = (
    rows: Row[],
    kind: ExcludeType,
    type: EntityMapMarker['type'],
    path: string,
    color: string,
  ): Array<EntityMapMarker & { _d: number }> =>
    rows
      .filter((r) => !(excludeType === kind && r.id === excludeId))
      .map((r) => {
        const mLat = Number(r.latitude);
        const mLng = Number(r.longitude);
        return {
          id: `${kind}:${r.id}`,
          lat: mLat,
          lng: mLng,
          name: r.name ?? r.title ?? '',
          type,
          color,
          linkTo: `${path}/${r.slug || r.id}`,
          _d: haversineKm(lat, lng, mLat, mLng),
        };
      })
      .filter((m) => m.name && m._d <= radiusKm);

  const all = [
    ...build(venues, 'venue', 'venues', '/venues', LAYER_COLORS.venues),
    ...build(events, 'event', 'events', '/events', LAYER_COLORS.events),
    ...build(hotels, 'hotel', undefined, '/hotels', LAYER_COLORS.hotels),
  ].sort((a, b) => a._d - b._d);

  return all.slice(0, limit).map(({ _d: _drop, ...m }) => m);
}

export function useNearbyMapPoints(opts: NearbyOpts): EntityMapMarker[] {
  const { lat, lng, enabled = true, radiusKm = 3, limit = 24 } = opts;
  const ready = enabled && typeof lat === 'number' && typeof lng === 'number';
  const { data } = useQuery({
    queryKey: [
      'nearby-map-points',
      lat?.toFixed(3),
      lng?.toFixed(3),
      opts.excludeType,
      opts.excludeId,
      radiusKm,
      limit,
    ],
    queryFn: () => fetchNearby(opts),
    enabled: ready,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
  return data ?? [];
}
