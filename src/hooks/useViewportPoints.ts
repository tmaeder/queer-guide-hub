/**
 * Viewport-aware fetching of point elements (venues, events, restrooms)
 * for the explore map. Returns a GeoJSON FeatureCollection suitable
 * for a MapLibre GeoJSON source with built-in clustering.
 *
 * Key features:
 *  - Fetches only within the current viewport bbox + padding
 *  - Debounces on moveend/zoomend (200ms)
 *  - Stale-request detection via generation counter (no AbortController noise)
 *  - LRU cache keyed by (zoomBucket, bboxKey, filtersHash)
 *  - Returns combined GeoJSON for all enabled point layer types
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ExploreMapFilters, LayerType } from '@/hooks/useExploreMapData';
import { LAYER_COLORS } from '@/hooks/useExploreMapData';
import {
  type Bbox,
  LRUCache,
  bboxExceedsPadded,
  bboxKey,
  clampBbox,
  filtersHash as computeFiltersHash,
  getZoomBucket,
  isBboxValid,
  padBbox,
  quantizeBbox,
} from '@/utils/mapViewport';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Point layer types handled by this hook */
export const POINT_LAYER_TYPES: LayerType[] = ['venues', 'events', 'restrooms'];

export interface PointFeatureProps {
  id: string;
  pointType: LayerType;
  name: string;
  subtitle: string;
  color: string;
  linkTo: string;
  meta: string;
}

type PointFeature = GeoJSON.Feature<GeoJSON.Point, PointFeatureProps>;
type PointCollection = GeoJSON.FeatureCollection<GeoJSON.Point, PointFeatureProps>;

export interface ViewportPointsResult {
  geojson: PointCollection;
  totalCount: number;
  isFetching: boolean;
  layerCounts: Partial<Record<LayerType, number>>;
}

interface UseViewportPointsOptions {
  enabledLayers: LayerType[];
  filters?: ExploreMapFilters;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 200;
const EMPTY_FC: PointCollection = { type: 'FeatureCollection', features: [] };

// ── Cache ─────────────────────────────────────────────────────────────────────

const featureCache = new LRUCache<PointFeature[]>(48);

function cacheKey(type: string, bk: string, fh: string): string {
  return `${type}|${bk}|${fh}`;
}

// ── Supabase fetchers ─────────────────────────────────────────────────────────

async function fetchVenuesInBbox(
  bbox: Bbox,
  filters: ExploreMapFilters | undefined,
): Promise<PointFeature[]> {
  let query = supabase
    .from('venues')
    .select('id, slug, name, category, latitude, longitude, city, country, featured')
    .neq('data_source', 'refuge_restrooms')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .gte('latitude', bbox.south)
    .lte('latitude', bbox.north)
    .gte('longitude', bbox.west)
    .lte('longitude', bbox.east)
    .order('featured', { ascending: false });

  if (filters?.category) query = query.eq('category', filters.category);
  if (filters?.tags?.length) query = query.overlaps('tags', filters.tags);
  if (filters?.search) {
    query = query.or(
      `name.ilike.%${filters.search}%,description.ilike.%${filters.search}%,address.ilike.%${filters.search}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((v: Record<string, unknown>) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [Number(v.longitude), Number(v.latitude)] },
    properties: {
      id: `venue-${v.id}`,
      pointType: 'venues' as const,
      name: v.name ?? 'Venue',
      subtitle: v.category ?? '',
      color: LAYER_COLORS.venues,
      linkTo: `/venues/${v.slug}`,
      meta: JSON.stringify({
        city: v.city,
        country: v.country,
        category: v.category,
        featured: v.featured,
      }),
    },
  }));
}

async function fetchEventsInBbox(
  bbox: Bbox,
  filters: ExploreMapFilters | undefined,
): Promise<PointFeature[]> {
  let query = supabase
    .from('events')
    .select(
      'id, slug, title, start_date, event_type, latitude, longitude, city, venue_id, venues(name, latitude, longitude)',
    )
    .eq('status', 'active')
    .gte('start_date', new Date().toISOString())
    .order('featured', { ascending: false })
    .order('start_date', { ascending: true });

  if (filters?.search) {
    query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  }
  if (filters?.dateRange) {
    query = query
      .gte('start_date', filters.dateRange.start)
      .lte('start_date', filters.dateRange.end);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? [])
    .map((e: Record<string, unknown>) => {
      let lat = e.latitude;
      let lng = e.longitude;
      if (lat == null && e.venues) {
        lat = e.venues.latitude;
        lng = e.venues.longitude;
      }
      if (lat == null || lng == null) return null;
      if (lat < bbox.south || lat > bbox.north || lng < bbox.west || lng > bbox.east) return null;

      const dateStr = e.start_date ? new Date(e.start_date).toLocaleDateString() : '';
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [Number(lng), Number(lat)] },
        properties: {
          id: `event-${e.id}`,
          pointType: 'events' as const,
          name: e.title ?? 'Event',
          subtitle: dateStr,
          color: LAYER_COLORS.events,
          linkTo: `/events/${e.slug}`,
          meta: JSON.stringify({
            startDate: e.start_date,
            eventType: e.event_type,
            venueName: e.venues?.name,
            city: e.city,
          }),
        },
      };
    })
    .filter(Boolean) as PointFeature[];
}

async function fetchRestroomsInBbox(bbox: Bbox): Promise<PointFeature[]> {
  const lat = (bbox.south + bbox.north) / 2;
  const lng = (bbox.west + bbox.east) / 2;

  const { data, error } = await supabase.functions.invoke('get-refuge-restrooms', {
    body: { lat, lng, per_page: 500 },
  });
  if (error) throw error;

  return ((data ?? []) as Record<string, unknown>[])
    .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number')
    .filter(
      (r) =>
        r.latitude >= bbox.south &&
        r.latitude <= bbox.north &&
        r.longitude >= bbox.west &&
        r.longitude <= bbox.east,
    )
    .map((r) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [Number(r.longitude), Number(r.latitude)] },
      properties: {
        id: `restroom-${r.id}`,
        pointType: 'restrooms' as const,
        name: r.name || `Restroom at ${r.street || 'Unknown'}`,
        subtitle: [r.city, r.state].filter(Boolean).join(', '),
        color: LAYER_COLORS.restrooms,
        linkTo: '',
        meta: JSON.stringify({ accessible: r.accessible, unisex: r.unisex }),
      },
    }));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useViewportPoints({
  enabledLayers,
  filters,
}: UseViewportPointsOptions): ViewportPointsResult & {
  onViewportChange: (bbox: Bbox, zoom: number) => void;
} {
  const [geojson, setGeojson] = useState<PointCollection>(EMPTY_FC);
  const [isFetching, setIsFetching] = useState(false);
  const [layerCounts, setLayerCounts] = useState<Partial<Record<LayerType, number>>>({});

  // Generation counter: incremented on each fetch, stale results are discarded
  const genRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRawBboxRef = useRef<Bbox | null>(null);
  const lastZoomRef = useRef<number>(2);

  const enabledRef = useRef(enabledLayers);
  enabledRef.current = enabledLayers;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const doFetch = useCallback(async (rawBbox: Bbox, zoom: number) => {
    const enabled = enabledRef.current.filter((l) => POINT_LAYER_TYPES.includes(l));
    if (enabled.length === 0) {
      setGeojson(EMPTY_FC);
      setLayerCounts({});
      return;
    }

    // Clamp to valid geo ranges — guards against MapLibre garbage on init/certain devices
    const bbox = clampBbox(rawBbox);

    // Bump generation — any in-flight request with an older gen will be discarded
    const gen = ++genRef.current;

    const bucket = getZoomBucket(zoom);
    const padded = padBbox(bbox, 0.15);
    const quantized = quantizeBbox(padded, bucket);
    const bk = bboxKey(quantized);
    const fh = computeFiltersHash(filtersRef.current ?? {});

    setIsFetching(true);

    try {
      const allFeatures: PointFeature[] = [];
      const counts: Partial<Record<LayerType, number>> = {};
      const promises: Promise<void>[] = [];

      for (const type of enabled) {
        const ck = cacheKey(type, bk, fh);
        const cached = featureCache.get(ck);
        if (cached) {
          allFeatures.push(...cached);
          counts[type] = cached.length;
          continue;
        }

        const p = (async () => {
          let features: PointFeature[] = [];
          switch (type) {
            case 'venues':
              features = await fetchVenuesInBbox(quantized, filtersRef.current);
              break;
            case 'events':
              features = await fetchEventsInBbox(quantized, filtersRef.current);
              break;
            case 'restrooms':
              features = await fetchRestroomsInBbox(quantized);
              break;
          }
          featureCache.set(ck, features);
          allFeatures.push(...features);
          counts[type] = features.length;
        })();

        promises.push(p);
      }

      await Promise.all(promises);

      // Discard if a newer fetch has started while we were waiting
      if (gen !== genRef.current) return;

      setGeojson({ type: 'FeatureCollection', features: allFeatures });
      setLayerCounts(counts);
      lastRawBboxRef.current = bbox;
    } catch (err: unknown) {
      if (gen !== genRef.current) return; // Stale error — ignore
      console.error('[useViewportPoints] fetch error:', err instanceof Error ? err.message : err);
    } finally {
      if (gen === genRef.current) setIsFetching(false);
    }
  }, []);

  const onViewportChange = useCallback(
    (bbox: Bbox, zoom: number) => {
      if (!isBboxValid(bbox)) return;

      const prevBucket = getZoomBucket(lastZoomRef.current);
      const newBucket = getZoomBucket(zoom);
      lastZoomRef.current = zoom;

      // Skip refetch if still inside padded region and zoom bucket unchanged
      if (
        lastRawBboxRef.current &&
        prevBucket === newBucket &&
        !bboxExceedsPadded(bbox, padBbox(lastRawBboxRef.current, 0.15))
      ) {
        return;
      }

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doFetch(bbox, zoom), DEBOUNCE_MS);
    },
    [doFetch],
  );

  // Refetch when layers or filters change
  useEffect(() => {
    if (lastRawBboxRef.current) {
      doFetch(lastRawBboxRef.current, lastZoomRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledLayers, filters]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    geojson,
    totalCount: geojson.features.length,
    isFetching,
    layerCounts,
    onViewportChange,
  };
}
