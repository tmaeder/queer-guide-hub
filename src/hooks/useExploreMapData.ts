import { useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import { useOptimizedCities, useOptimizedCountries } from '@/hooks/usePlaces';
import { ink, trackColor } from '@/lib/mapTokens';
import { ROUTE_BULLET_MAP, type Track } from '@/components/transit/routeBulletMap';
// Value import; `mapLayers` only imports TYPES back from here, so there is no
// runtime cycle.
import { AREA_LAYERS as AREA_LAYER_TYPES } from '@/config/mapLayers';

// ── Types ──────────────────────────────────────────────────────────────────────

export type LayerType =
  'venues' | 'events' | 'cities' | 'countries' | 'restrooms' | 'hotels' | 'neighbourhoods';

export interface MapMarker {
  id: string;
  type: LayerType;
  lat: number;
  lng: number;
  name: string;
  subtitle?: string;
  color: string;
  scale?: number;
  linkTo?: string;
  meta?: Record<string, unknown>;
}

export interface MapViewport {
  center: [number, number]; // [lng, lat]
  zoom: number;
}

export interface ExploreMapFilters {
  search?: string;
  category?: string;
  tags?: string[];
  dateRange?: { start: string; end: string };
  accessible?: boolean;
  /** Geo radius filter: keep only points within radiusKm of (lat, lng). */
  nearMe?: { lat: number; lng: number; radiusKm: number };
  /** Keep only open-now venues / happening-now events (the `live` flag). */
  openNow?: boolean;
}

// ── Layer colours ──────────────────────────────────────────────────────────────

/**
 * Layer → subway track. This is a projection of `ROUTE_BULLET_MAP`, not a
 * second palette: an entity carries the same colour on the map that its route
 * bullet carries in a list, a card or a search result.
 *
 * The four POINT layers take the four tracks, one each, so no two pin types
 * share a hue. The three AREA layers are deliberately NOT tracks — they render
 * as translucent discs and boundary lines under the pins, and geography is not
 * a line on this map. They take ink, which also keeps them from competing with
 * the pins for attention.
 *
 * Until 2026-08-10 this was Tailwind's stock palette (`#6366f1` indigo,
 * `#ec4899`, `#3b82f6`, `#dc2626`, `#10b981`, `#f59e0b`) — six chromatic hues
 * unrelated to the design system, one of which was the destructive red sitting
 * on a layer that carries no danger meaning.
 */
/** Layer → the `ROUTE_BULLET_MAP` key describing the same entity type. */
const LAYER_BULLET_KEY: Record<LayerType, string> = {
  venues: 'venue',
  events: 'event',
  hotels: 'hotel',
  restrooms: 'restroom',
  cities: 'city',
  countries: 'country',
  neighbourhoods: 'queer_village',
};

const LAYER_TRACKS: Record<LayerType, Track | 'ink'> = Object.fromEntries(
  (Object.keys(LAYER_BULLET_KEY) as LayerType[]).map((layer) => [
    layer,
    AREA_LAYER_TYPES.includes(layer)
      ? 'ink'
      : (ROUTE_BULLET_MAP[LAYER_BULLET_KEY[layer]]?.track ?? 'pink'),
  ]),
) as Record<LayerType, Track | 'ink'>;

/**
 * Resolved layer colours, keyed exactly like the old constant.
 *
 * Reads through to the live CSS custom properties on every access instead of
 * freezing hexes at module scope, for two reasons: `/admin/design` can
 * repaint any track at runtime, and module-eval would run before the
 * stylesheet exists (returning empty strings that MapLibre rejects as invalid
 * paint values). Every read here happens inside an effect, long after paint.
 */
export const LAYER_COLORS: Record<LayerType, string> = new Proxy({} as Record<LayerType, string>, {
  get: (_t, key: string) => {
    const track = LAYER_TRACKS[key as LayerType];
    if (!track) return undefined;
    return track === 'ink' ? ink() : trackColor(track);
  },
  has: (_t, key: string) => key in LAYER_TRACKS,
  ownKeys: () => Object.keys(LAYER_TRACKS),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

/** Density ramp alpha stops `[density, inkAlpha][]`. */
const HEAT_ALPHAS: [number, number][] = [
  [0, 0],
  [0.2, 0.1],
  [0.4, 0.2],
  [0.6, 0.32],
  [0.8, 0.44],
  [1, 0.55],
];

/** Monochrome ink density ramp `[density, color][]` — the single source of
 *  truth for BOTH the canvas heatmap expression and the legend's gradient
 *  swatch, so the two can never drift apart. A function, not a constant: it
 *  resolves `--foreground` live, and a module-scope read would run before the
 *  stylesheet exists. (Was a literal `rgba(0,0,0,…)` ramp, which assumed the
 *  ink is pure black — it is `0 0% 6.7%`.) */
export const monoHeatStops = (): [number, string][] => HEAT_ALPHAS.map(([d, a]) => [d, ink(a)]);

// ── Hook ───────────────────────────────────────────────────────────────────────

interface UseExploreMapDataOptions {
  enabledLayers: LayerType[];
  viewport: MapViewport;
  filters?: ExploreMapFilters;
}

export function useExploreMapData({ enabledLayers, viewport, filters }: UseExploreMapDataOptions) {
  // ── Calculate viewport bounds for geographic filtering ────────────────────
  // At zoom level 5+, restrict queries to visible map bounds
  // Below zoom 5, fetch globally to show broader context
  const shouldUseBounds = viewport.zoom >= 5;
  const centerLng = viewport.center[0];
  const centerLat = viewport.center[1];
  const viewportBounds = useMemo(() => {
    if (!shouldUseBounds) return undefined;

    // Calculate bounds from viewport center and zoom
    // Simplified: at zoom level 5, roughly ±40 degrees; adjust accordingly
    const zoomFactor = Math.pow(2, 5 - Math.max(viewport.zoom, 1));
    const latDelta = 80 / zoomFactor;
    const lngDelta = 180 / zoomFactor;

    return {
      minLat: Math.max(-90, centerLat - latDelta),
      maxLat: Math.min(90, centerLat + latDelta),
      minLng: centerLng - lngDelta,
      maxLng: centerLng + lngDelta,
    };
  }, [shouldUseBounds, centerLng, centerLat, viewport.zoom]);

  // ── Venues ─────────────────────────────────────────────────────────────────
  const venuesEnabled = enabledLayers.includes('venues');
  const {
    venues: rawVenues = [],
    isFetching: venuesFetching,
    fetchVenues,
  } = useVenues(false, { skipDatasetTotal: true });
  const fetchVenuesRef = useRef(fetchVenues);
  // eslint-disable-next-line react-hooks/refs -- "latest value" ref pattern; effect below reads .current.
  fetchVenuesRef.current = fetchVenues;
  const tagsKey = filters?.tags?.length ? filters.tags.join(',') : '';

  useEffect(() => {
    if (!venuesEnabled) return;
    fetchVenuesRef.current({
      limit: shouldUseBounds ? 200 : 500, // Reduce limit when using bounds
      ...(filters?.search ? { search: filters.search } : {}),
      ...(filters?.category ? { category: filters.category } : {}),
      ...(tagsKey ? { tags: tagsKey.split(',') } : {}),
      ...(viewportBounds ? { bounds: viewportBounds } : {}),
    });
  }, [venuesEnabled, filters?.search, filters?.category, tagsKey, shouldUseBounds, viewportBounds]);

  const venueMarkers = useMemo<MapMarker[]>(() => {
    if (!venuesEnabled) return [];
    return (rawVenues as Record<string, unknown>[])
      .filter((v) => typeof v?.latitude === 'number' && typeof v?.longitude === 'number')
      .map((v) => ({
        id: `venue-${v.id}`,
        type: 'venues' as const,
        lat: Number(v.latitude),
        lng: Number(v.longitude),
        name: v.name ?? 'Venue',
        subtitle: v.category ?? undefined,
        color: LAYER_COLORS.venues,
        linkTo: `/venues/${v.slug}`,
        meta: { city: v.city, country: v.country, category: v.category, featured: v.is_featured },
      }));
  }, [rawVenues, venuesEnabled]);

  // ── Events ─────────────────────────────────────────────────────────────────
  const eventsEnabled = enabledLayers.includes('events');
  const {
    events: rawEvents = [],
    isFetching: eventsFetching,
    fetchEvents,
  } = useEvents(false, { skipDatasetTotal: true });
  const dateRangeKey = filters?.dateRange
    ? `${filters.dateRange.start}|${filters.dateRange.end}`
    : '';
  const dateRangeStart = filters?.dateRange?.start;
  const dateRangeEnd = filters?.dateRange?.end;

  useEffect(() => {
    if (!eventsEnabled) return;
    fetchEvents({
      limit: shouldUseBounds ? 150 : 300,
      ...(filters?.search ? { search: filters.search } : {}),
      ...(dateRangeStart && dateRangeEnd
        ? { dateRange: { start: dateRangeStart, end: dateRangeEnd } }
        : {}),
      ...(viewportBounds ? { bounds: viewportBounds } : {}),
    });
  }, [
    eventsEnabled,
    filters?.search,
    dateRangeKey,
    dateRangeStart,
    dateRangeEnd,
    shouldUseBounds,
    viewportBounds,
    fetchEvents,
  ]);

  const eventMarkers = useMemo<MapMarker[]>(() => {
    if (!eventsEnabled) return [];
    return (rawEvents as unknown as Record<string, unknown>[])
      .map((e) => {
        // Try event's own coords, then venue's coords, then city coords
        let lat: number | null = null;
        let lng: number | null = null;

        if (typeof e.latitude === 'number' && typeof e.longitude === 'number') {
          lat = e.latitude;
          lng = e.longitude;
        } else if (e.venues && typeof e.venues.latitude === 'number') {
          lat = e.venues.latitude;
          lng = e.venues.longitude;
        }

        if (lat === null || lng === null) return null;

        const startDate = e.start_date ? new Date(e.start_date).toLocaleDateString() : '';

        return {
          id: `event-${e.id}`,
          type: 'events' as const,
          lat,
          lng,
          name: e.title ?? 'Event',
          subtitle: startDate,
          color: LAYER_COLORS.events,
          linkTo: `/events/${e.slug}`,
          meta: {
            startDate: e.start_date,
            endDate: e.end_date,
            eventType: e.event_type,
            venueName: e.venues?.name,
            city: e.city ?? e.venues?.city,
          },
        };
      })
      .filter(Boolean) as MapMarker[];
  }, [rawEvents, eventsEnabled]);

  // ── Cities ─────────────────────────────────────────────────────────────────
  const citiesEnabled = enabledLayers.includes('cities');
  const { cities: rawCities = [], isFetching: citiesFetching } = useOptimizedCities({
    enabled: citiesEnabled,
    limit: 500,
    ...(filters?.search ? { search: filters.search } : {}),
  });

  const cityMarkers = useMemo<MapMarker[]>(() => {
    if (!citiesEnabled) return [];
    return (rawCities as Record<string, unknown>[])
      .filter((c) => typeof c?.latitude === 'number' && typeof c?.longitude === 'number')
      .map((c) => ({
        id: `city-${c.id}`,
        type: 'cities' as const,
        lat: Number(c.latitude),
        lng: Number(c.longitude),
        name: c.name ?? 'City',
        subtitle: c.country_name ?? undefined,
        color: LAYER_COLORS.cities,
        scale: 0.85,
        linkTo: `/city/${c.slug}`,
        meta: {
          population: c.population,
          countryName: c.country_name,
          isCapital: c.is_capital,
        },
      }));
  }, [rawCities, citiesEnabled]);

  // ── Countries ──────────────────────────────────────────────────────────────
  const countriesEnabled = enabledLayers.includes('countries');
  const { countries: rawCountries = [], isFetching: countriesFetching } = useOptimizedCountries({
    enabled: countriesEnabled,
    limit: 250,
    ...(filters?.search ? { search: filters.search } : {}),
  });

  const countryMarkers = useMemo<MapMarker[]>(() => {
    if (!countriesEnabled) return [];
    return (rawCountries as Record<string, unknown>[])
      .filter((c) => typeof c?.latitude === 'number' && typeof c?.longitude === 'number')
      .map((c) => ({
        id: `country-${c.id}`,
        type: 'countries' as const,
        lat: Number(c.latitude),
        lng: Number(c.longitude),
        name: c.name ?? 'Country',
        subtitle: c.capital ?? undefined,
        color: LAYER_COLORS.countries,
        scale: 0.75,
        linkTo: `/country/${c.slug}`,
        meta: {
          capital: c.capital,
          code: c.code,
          population: c.population,
          continent: c.continent,
        },
      }));
  }, [rawCountries, countriesEnabled]);

  // ── Restrooms (Refuge API, viewport-based) ─────────────────────────────────
  const restroomsEnabled = enabledLayers.includes('restrooms');
  const [lat, lng] = [viewport.center[1], viewport.center[0]]; // center is [lng, lat]

  const { data: rawRestrooms = [], isFetching: restroomsFetching } = useQuery({
    queryKey: ['restrooms_map', Math.round(lat * 10) / 10, Math.round(lng * 10) / 10],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('get-refuge-restrooms', {
        body: { lat, lng, per_page: 100 },
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: number;
        name: string;
        street: string;
        city: string;
        state: string;
        latitude: number;
        longitude: number;
        accessible: boolean;
        unisex: boolean;
      }>;
    },
    enabled: restroomsEnabled && !(lat === 0 && lng === 0),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const restroomMarkers = useMemo<MapMarker[]>(() => {
    if (!restroomsEnabled) return [];
    return rawRestrooms
      .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number')
      .map((r) => ({
        id: `restroom-${r.id}`,
        type: 'restrooms' as const,
        lat: r.latitude,
        lng: r.longitude,
        name: r.name || `Restroom at ${r.street || 'Unknown'}`,
        subtitle: [r.city, r.state].filter(Boolean).join(', ') || undefined,
        color: LAYER_COLORS.restrooms,
        meta: { accessible: r.accessible, unisex: r.unisex },
      }));
  }, [rawRestrooms, restroomsEnabled]);

  // ── Hotels (stub) ─────────────────────────────────────────────────────────
  const hotelMarkers = useMemo<MapMarker[]>(() => [], []);

  // ── Neighbourhoods / Queer Villages ──────────────────────────────────────
  const neighbourhoodsEnabled = enabledLayers.includes('neighbourhoods');
  const { data: rawVillages = [], isFetching: villagesFetching } = useQuery({
    queryKey: ['queer_villages_map', filters?.search],
    queryFn: async () => {
      let query = supabase
        .from('queer_villages')
        .select('id, name, slug, latitude, longitude, description, featured, cities:city_id(name)')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('featured', { ascending: false })
        .order('name', { ascending: true })
        .limit(500);
      if (filters?.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: neighbourhoodsEnabled,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const neighbourhoodMarkers = useMemo<MapMarker[]>(() => {
    if (!neighbourhoodsEnabled) return [];
    return rawVillages
      .filter(
        (v: Record<string, unknown>) =>
          typeof v?.latitude === 'number' && typeof v?.longitude === 'number',
      )
      .map((v: Record<string, unknown>) => ({
        id: `neighbourhood-${v.id}`,
        type: 'neighbourhoods' as const,
        lat: Number(v.latitude),
        lng: Number(v.longitude),
        name: v.name ?? 'Neighbourhood',
        subtitle: v.cities?.name ?? undefined,
        color: LAYER_COLORS.neighbourhoods,
        scale: 0.85,
        linkTo: `/villages/${v.slug}`,
        meta: { city: v.cities?.name, featured: v.featured, description: v.description },
      }));
  }, [rawVillages, neighbourhoodsEnabled]);

  // ── Merged output ─────────────────────────────────────────────────────────
  const allMarkers = useMemo<MapMarker[]>(
    () => [
      ...venueMarkers,
      ...eventMarkers,
      ...cityMarkers,
      ...countryMarkers,
      ...restroomMarkers,
      ...hotelMarkers,
      ...neighbourhoodMarkers,
    ],
    [
      venueMarkers,
      eventMarkers,
      cityMarkers,
      countryMarkers,
      restroomMarkers,
      hotelMarkers,
      neighbourhoodMarkers,
    ],
  );

  const isFetching =
    venuesFetching ||
    eventsFetching ||
    citiesFetching ||
    countriesFetching ||
    restroomsFetching ||
    villagesFetching;

  const layerCounts: Record<LayerType, number> = {
    venues: venueMarkers.length,
    events: eventMarkers.length,
    cities: cityMarkers.length,
    countries: countryMarkers.length,
    restrooms: restroomMarkers.length,
    hotels: hotelMarkers.length,
    neighbourhoods: neighbourhoodMarkers.length,
  };

  return { markers: allMarkers, isFetching, layerCounts };
}
