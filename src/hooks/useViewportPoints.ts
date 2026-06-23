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
import * as Sentry from '@sentry/react';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom } from '@/integrations/supabase/untyped';
import type { ExploreMapFilters, LayerType } from '@/hooks/useExploreMapData';
import { LAYER_COLORS } from '@/hooks/useExploreMapData';
import { isOpenNow } from '@/utils/openingHours';
import { glyphKeyFor } from '@/components/map/mapIcons';
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
export const POINT_LAYER_TYPES: LayerType[] = ['venues', 'events', 'restrooms', 'hotels'];

export interface PointFeatureProps {
  id: string;
  pointType: LayerType;
  name: string;
  subtitle: string;
  color: string;
  linkTo: string;
  meta: string;
  /** Promoted from is_featured — drives the larger, ringed pin treatment. */
  featured: boolean;
  /** Open-now (venues) / happening-now or liveness=live (events) — drives the pulse. */
  live: boolean;
  /** Map-image id for the category glyph drawn on the pin (see mapGlyphs). */
  iconKey: string;
  /** Tagged client-side in ExploreMap when the point is in the viewer's saved set. */
  favorited?: boolean;
}

export type PointFeature = GeoJSON.Feature<GeoJSON.Point, PointFeatureProps>;
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
  /** Override marker colours per layer (e.g. the MapShell pride palette). */
  palette?: Partial<Record<LayerType, string>>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 200;
const EMPTY_FC: PointCollection = { type: 'FeatureCollection', features: [] };

/** Great-circle distance in km between two [lng,lat] points. */
function haversineKm(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Gated debug logger — matches ExploreMap's mapDebug. Opt in via
// `localStorage.setItem('qg:debug:map', '1')` in prod to inspect the
// data flow without redeploying.
const mapDebug = (...args: unknown[]): void => {
  try {
    if (
      import.meta.env.DEV ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('qg:debug:map') === '1')
    ) {
       
      console.debug('[venues-map]', ...args);
    }
  } catch {
    /* localStorage may throw in some sandboxed contexts */
  }
};

// ── Cache ─────────────────────────────────────────────────────────────────────

const featureCache = new LRUCache<PointFeature[]>(48);

function cacheKey(type: string, bk: string, fh: string): string {
  return `${type}|${bk}|${fh}`;
}

// ── Retry helper ─────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 1000): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
      return withRetry(fn, retries - 1, delayMs);
    }
    throw err;
  }
}

// ── Supabase fetchers ─────────────────────────────────────────────────────────

interface OptimizedAsset {
  optimized_url?: string;
  thumbnail_url?: string;
}

/**
 * Batch-resolve the best R2-mirrored asset (optimized/thumbnail, prefer cover)
 * for a set of entity ids, mirroring useEntityImageAssets. The map's raw
 * `images[0]` URLs are external hotlinks that often 401/404/ORB-block; the
 * optimized copy is always reachable. Best-effort — never blocks the map.
 */
async function fetchOptimizedAssets(
  entityType: 'venue' | 'event',
  ids: string[],
): Promise<Map<string, OptimizedAsset>> {
  const map = new Map<string, OptimizedAsset>();
  if (!ids.length) return map;
  try {
    const { data, error } = await untypedFrom('image_asset_links')
      .select('entity_id, role, image_assets!inner(optimized_url, thumbnail_url, optimization_status, status)')
      .eq('entity_type', entityType)
      .in('entity_id', ids)
      .eq('image_assets.status', 'active');
    if (error || !data) return map;
    type Row = {
      entity_id: string;
      role: string;
      image_assets: { optimized_url: string | null; thumbnail_url: string | null; optimization_status: string | null };
    };
    for (const row of data as unknown as Row[]) {
      const ia = row.image_assets;
      if (!ia) continue;
      if (ia.optimization_status !== 'optimized' && ia.optimization_status !== 'cdn_optimized') continue;
      const existing = map.get(row.entity_id);
      if (existing && row.role !== 'cover') continue; // prefer cover, else first wins
      map.set(row.entity_id, {
        optimized_url: ia.optimized_url ?? undefined,
        thumbnail_url: ia.thumbnail_url ?? undefined,
      });
    }
  } catch {
    /* asset enrichment is optional — ignore failures */
  }
  return map;
}

async function fetchVenuesInBbox(
  bbox: Bbox,
  filters: ExploreMapFilters | undefined,
): Promise<PointFeature[]> {
  let query = supabase
    .from('venues')
    .select(
      'id, slug, name, category, latitude, longitude, city, country, is_featured, images, logo_url, hours, price_range',
    )
    .neq('data_source', 'refuge-restrooms')
    .neq('review_status', 'archived')
    .is('duplicate_of_id', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .gte('latitude', bbox.south)
    .lte('latitude', bbox.north)
    .gte('longitude', bbox.west)
    .lte('longitude', bbox.east)
    .order('is_featured', { ascending: false });

  if (filters?.category) query = query.eq('category', filters.category);
  if (filters?.tags?.length) query = query.overlaps('tags', filters.tags);
  if (filters?.search) {
    query = query.or(
      `name.ilike.%${filters.search}%,description.ilike.%${filters.search}%,address.ilike.%${filters.search}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  const assets = await fetchOptimizedAssets(
    'venue',
    (data ?? []).map((v: Record<string, unknown>) => String(v.id)),
  );

  return (data ?? []).map((v: Record<string, unknown>) => {
    const images = Array.isArray(v.images) ? (v.images as string[]) : [];
    const logoUrl = typeof v.logo_url === 'string' ? v.logo_url : undefined;
    const isLogo = Boolean(logoUrl);
    // Logo-first: when a brand logo exists, show it (contained) and skip the
    // optimized/thumbnail cover-photo assets — those are not the logo.
    const asset = isLogo ? undefined : assets.get(String(v.id));
    const openNow = isOpenNow(v.hours);
    const featured = Boolean(v.is_featured);
    return {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [Number(v.longitude), Number(v.latitude)] },
      properties: {
        id: `venue-${v.id}`,
        pointType: 'venues' as const,
        name: v.name ?? 'Venue',
        subtitle: v.category ?? '',
        color: LAYER_COLORS.venues,
        linkTo: v.slug ? `/venues/${v.slug}` : '',
        featured,
        live: openNow === true,
        iconKey: glyphKeyFor('venues', v.category as string | undefined),
        meta: JSON.stringify({
          city: v.city,
          country: v.country,
          category: v.category,
          featured,
          image: logoUrl ?? images[0] ?? undefined,
          isLogo,
          optimizedImage: asset?.optimized_url,
          thumbImage: asset?.thumbnail_url,
          openNow,
          priceRange: typeof v.price_range === 'number' ? v.price_range : undefined,
        }),
      },
    };
  });
}

async function fetchEventsInBbox(
  bbox: Bbox,
  filters: ExploreMapFilters | undefined,
): Promise<PointFeature[]> {
  let query = supabase
    .from('events')
    .select(
      'id, slug, title, start_date, end_date, event_type, is_featured, images, liveness_status, trust_score, latitude, longitude, city, venue_id, venues!events_venue_id_fkey(name, latitude, longitude)',
    )
    .eq('status', 'active')
    .is('duplicate_of_id', null)
    .gte('start_date', new Date().toISOString())
    .order('is_featured', { ascending: false })
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

  // Keep only events with a usable location inside the bbox.
  const rows = (data ?? [])
    .map((e: Record<string, unknown>) => {
      let lat = e.latitude;
      let lng = e.longitude;
      if (lat == null && e.venues) {
        lat = e.venues.latitude;
        lng = e.venues.longitude;
      }
      if (lat == null || lng == null) return null;
      if (lat < bbox.south || lat > bbox.north || lng < bbox.west || lng > bbox.east) return null;
      return { e, lat: Number(lat), lng: Number(lng) };
    })
    .filter(Boolean) as { e: Record<string, unknown>; lat: number; lng: number }[];

  // Social-proof: going-count per event (best-effort; never blocks the map).
  const goingById = new Map<string, number>();
  const ids = rows.map((r) => String(r.e.id));
  const assets = await fetchOptimizedAssets('event', ids);
  if (ids.length) {
    try {
      const { data: counts } = await supabase.rpc('event_attendee_counts', { event_ids: ids });
      for (const c of (counts ?? []) as { event_id: string; going_count: number }[]) {
        if (c.going_count > 0) goingById.set(c.event_id, c.going_count);
      }
    } catch {
      /* attendee counts are optional — ignore failures */
    }
  }

  return rows.map(({ e, lat, lng }) => {
      const dateStr = e.start_date ? new Date(e.start_date).toLocaleDateString() : '';
      const images = Array.isArray(e.images) ? (e.images as string[]) : [];
      const now = Date.now();
      const startMs = e.start_date ? Date.parse(e.start_date as string) : NaN;
      const endMs = e.end_date ? Date.parse(e.end_date as string) : NaN;
      // "Happening now": within the start/end window, or flagged live, or
      // starting within the next 24h (a near-term event reads as alive).
      const happeningNow =
        e.liveness_status === 'live' ||
        (!Number.isNaN(startMs) &&
          !Number.isNaN(endMs) &&
          startMs <= now &&
          endMs >= now) ||
        (!Number.isNaN(startMs) && startMs >= now && startMs - now < 24 * 60 * 60 * 1000);
      const featured = Boolean(e.is_featured);
      const asset = assets.get(String(e.id));
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [Number(lng), Number(lat)] },
        properties: {
          id: `event-${e.id}`,
          pointType: 'events' as const,
          name: e.title ?? 'Event',
          subtitle: dateStr,
          color: LAYER_COLORS.events,
          linkTo: e.slug ? `/events/${e.slug}` : '',
          featured,
          live: happeningNow,
          iconKey: glyphKeyFor('events'),
          meta: JSON.stringify({
            startDate: e.start_date,
            eventType: e.event_type,
            venueName: e.venues?.name,
            city: e.city,
            image: images[0] ?? undefined,
            optimizedImage: asset?.optimized_url,
            thumbImage: asset?.thumbnail_url,
            trustScore: typeof e.trust_score === 'number' ? e.trust_score : undefined,
            attendeeCount: goingById.get(String(e.id)),
          }),
        },
      };
    }) as PointFeature[];
}

async function fetchHotelsInBbox(bbox: Bbox): Promise<PointFeature[]> {
  const { data, error } = await supabase
    .from('hotels')
    .select('id, slug, name, hotel_type, latitude, longitude, city, country, featured')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .gte('latitude', bbox.south)
    .lte('latitude', bbox.north)
    .gte('longitude', bbox.west)
    .lte('longitude', bbox.east);
  if (error) throw error;
  return (data ?? []).map((h: Record<string, unknown>) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [Number(h.longitude), Number(h.latitude)] },
    properties: {
      id: `hotel-${h.id}`,
      pointType: 'hotels' as const,
      name: (h.name as string) ?? 'Hotel',
      subtitle: (h.hotel_type as string) ?? '',
      color: LAYER_COLORS.hotels,
      linkTo: h.slug ? `/hotels/${h.slug}` : '',
      featured: Boolean(h.featured),
      live: false,
      iconKey: glyphKeyFor('hotels'),
      meta: JSON.stringify({ city: h.city, country: h.country, hotel_type: h.hotel_type, featured: h.featured }),
    },
  }));
}

async function fetchRestroomsInBbox(bbox: Bbox): Promise<PointFeature[]> {
  const lat = (bbox.south + bbox.north) / 2;
  const lng = (bbox.west + bbox.east) / 2;

  // Refuge API caps per_page at 100; higher values 400 (→ edge fn used to 500).
  const { data, error } = await supabase.functions.invoke('get-refuge-restrooms', {
    body: { lat, lng, per_page: 100 },
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
        featured: false,
        live: false,
        iconKey: glyphKeyFor('restrooms'),
        meta: JSON.stringify({ accessible: r.accessible, unisex: r.unisex }),
      },
    }));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useViewportPoints({
  enabledLayers,
  filters,
  palette,
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
  // eslint-disable-next-line react-hooks/refs -- "latest value" ref pattern; doFetch (defined below) reads .current.
  enabledRef.current = enabledLayers;
  const filtersRef = useRef(filters);
  // eslint-disable-next-line react-hooks/refs -- "latest value" ref pattern; doFetch (defined below) reads .current.
  filtersRef.current = filters;
  const paletteRef = useRef(palette);
  // eslint-disable-next-line react-hooks/refs -- "latest value" ref pattern; doFetch (defined below) reads .current.
  paletteRef.current = palette;

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

    mapDebug('fetch:start', { enabled, gen, bucket, bk });
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
          try {
            let features: PointFeature[] = [];
            switch (type) {
              case 'venues':
                features = await withRetry(() => fetchVenuesInBbox(quantized, filtersRef.current));
                break;
              case 'events':
                features = await withRetry(() => fetchEventsInBbox(quantized, filtersRef.current));
                break;
              case 'restrooms':
                features = await withRetry(() => fetchRestroomsInBbox(quantized));
                break;
              case 'hotels':
                features = await withRetry(() => fetchHotelsInBbox(quantized));
                break;
            }
            featureCache.set(ck, features);
            allFeatures.push(...features);
            counts[type] = features.length;
          } catch (layerErr) {
            // Isolate per-layer failures. A single flaky source (e.g. the
            // get-refuge-restrooms edge function returning 500) must NOT blank
            // the whole map — previously one rejection failed the Promise.all
            // and discarded every layer's results. Count it as 0 and let the
            // other layers render.
            counts[type] = 0;
            console.error(
              `[useViewportPoints] ${type} fetch failed:`,
              layerErr instanceof Error ? layerErr.message : layerErr,
            );
          }
        })();

        promises.push(p);
      }

      await Promise.all(promises);

      // Discard if a newer fetch has started while we were waiting
      if (gen !== genRef.current) {
        mapDebug('fetch:stale', { gen, current: genRef.current });
        return;
      }

      // Apply the active palette to every feature. The LRU cache is a shared
      // module singleton, so a MapShell instance (pride palette) and a legacy
      // ExploreMap (base palette) can read the same cached feature objects.
      // Remap unconditionally — defaulting to LAYER_COLORS — so neither
      // instance inherits the other's colours.
      const pal = paletteRef.current ?? LAYER_COLORS;
      for (const f of allFeatures) {
        const c = pal[f.properties.pointType];
        if (c) f.properties.color = c;
      }

      // "Near me" radius filter: applied client-side across all layers so a
      // single control narrows every point type at once. Counts are
      // recomputed from the kept features so the layer panel + result pill
      // reflect the filtered set, not the pre-filter fetch.
      let finalFeatures = allFeatures;
      const nm = filtersRef.current?.nearMe;
      if (nm) {
        finalFeatures = allFeatures.filter(
          (f) =>
            haversineKm(nm.lng, nm.lat, f.geometry.coordinates[0], f.geometry.coordinates[1]) <=
            nm.radiusKm,
        );
        for (const k of Object.keys(counts) as LayerType[]) counts[k] = 0;
        for (const f of finalFeatures) {
          const pt = f.properties.pointType;
          counts[pt] = (counts[pt] ?? 0) + 1;
        }
      }

      // "Open now" filter: keep only currently-open venues / happening-now
      // events (the promoted `live` flag). Counts recomputed from the kept set.
      if (filtersRef.current?.openNow) {
        finalFeatures = finalFeatures.filter((f) => f.properties.live === true);
        for (const k of Object.keys(counts) as LayerType[]) counts[k] = 0;
        for (const f of finalFeatures) {
          const pt = f.properties.pointType;
          counts[pt] = (counts[pt] ?? 0) + 1;
        }
      }

      mapDebug('fetch:resolve', { gen, features: finalFeatures.length, counts });
      // Diagnostic breadcrumb. If pins ever silently stop rendering in
      // prod, the Sentry trail will show "fetch returned N venues" so
      // we know whether the bug is in the data path or the renderer.
      Sentry.addBreadcrumb({
        category: 'venues-map',
        level: 'info',
        message: 'viewport-fetch',
        data: { features: finalFeatures.length, zoom, counts },
      });
      setGeojson({ type: 'FeatureCollection', features: finalFeatures });
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

  // Refetch when layers or filters change (stabilized to avoid infinite loops)
  const layersKey = enabledLayers.slice().sort().join(',');
  const filtersKey = computeFiltersHash(filters ?? {});
  useEffect(() => {
    if (lastRawBboxRef.current) {
      doFetch(lastRawBboxRef.current, lastZoomRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layersKey, filtersKey]);

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
