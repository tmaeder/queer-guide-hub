import { useMemo } from 'react';
import { useOptimizedVenues } from '@/hooks/useOptimizedVenues';
import { useOptimizedEvents } from '@/hooks/useOptimizedEvents';
import { useOptimizedCities, useOptimizedCountries } from '@/hooks/useOptimizedPlaces';

// ── Types ──────────────────────────────────────────────────────────────────────

export type LayerType =
  | 'venues'
  | 'events'
  | 'cities'
  | 'countries'
  | 'restrooms'
  | 'hotels'
  | 'neighbourhoods';

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
  meta?: Record<string, any>;
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
}

// ── Layer colours ──────────────────────────────────────────────────────────────

export const LAYER_COLORS: Record<LayerType, string> = {
  venues: '#6366f1',       // indigo
  events: '#ec4899',       // pink
  cities: '#3b82f6',       // blue
  countries: '#dc2626',    // red
  restrooms: '#10b981',    // emerald
  hotels: '#f59e0b',       // amber
  neighbourhoods: '#8b5cf6', // violet
};

// ── Hook ───────────────────────────────────────────────────────────────────────

interface UseExploreMapDataOptions {
  enabledLayers: LayerType[];
  viewport: MapViewport;
  filters?: ExploreMapFilters;
}

export function useExploreMapData({
  enabledLayers,
  viewport,
  filters,
}: UseExploreMapDataOptions) {
  // ── Venues ─────────────────────────────────────────────────────────────────
  const venuesEnabled = enabledLayers.includes('venues');
  const { venues: rawVenues = [], isFetching: venuesFetching } =
    useOptimizedVenues(
      venuesEnabled
        ? {
            limit: 500,
            ...(filters?.search ? { search: filters.search } : {}),
            ...(filters?.category ? { category: filters.category } : {}),
            ...(filters?.tags?.length ? { tags: filters.tags } : {}),
          }
        : { limit: 0 },
    );

  const venueMarkers = useMemo<MapMarker[]>(() => {
    if (!venuesEnabled) return [];
    return (rawVenues as any[])
      .filter((v) => typeof v?.latitude === 'number' && typeof v?.longitude === 'number')
      .map((v) => ({
        id: `venue-${v.id}`,
        type: 'venues' as const,
        lat: Number(v.latitude),
        lng: Number(v.longitude),
        name: v.name ?? 'Venue',
        subtitle: v.category ?? undefined,
        color: LAYER_COLORS.venues,
        linkTo: `/venues/${v.id}`,
        meta: { city: v.city, country: v.country, category: v.category, featured: v.featured },
      }));
  }, [rawVenues, venuesEnabled]);

  // ── Events ─────────────────────────────────────────────────────────────────
  const eventsEnabled = enabledLayers.includes('events');
  const { events: rawEvents = [], isFetching: eventsFetching } =
    useOptimizedEvents(
      eventsEnabled
        ? {
            limit: 300,
            ...(filters?.search ? { search: filters.search } : {}),
            ...(filters?.dateRange ? { dateRange: filters.dateRange } : {}),
          }
        : { limit: 0 },
    );

  const eventMarkers = useMemo<MapMarker[]>(() => {
    if (!eventsEnabled) return [];
    return (rawEvents as any[])
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

        const startDate = e.start_date
          ? new Date(e.start_date).toLocaleDateString()
          : '';

        return {
          id: `event-${e.id}`,
          type: 'events' as const,
          lat,
          lng,
          name: e.title ?? 'Event',
          subtitle: startDate,
          color: LAYER_COLORS.events,
          linkTo: `/events/${e.id}`,
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
  const { cities: rawCities = [], isFetching: citiesFetching } =
    useOptimizedCities(
      citiesEnabled
        ? {
            limit: 500,
            ...(filters?.search ? { search: filters.search } : {}),
          }
        : { limit: 0 },
    );

  const cityMarkers = useMemo<MapMarker[]>(() => {
    if (!citiesEnabled) return [];
    return (rawCities as any[])
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
        linkTo: `/city/${c.id}`,
        meta: {
          population: c.population,
          countryName: c.country_name,
          isCapital: c.is_capital,
        },
      }));
  }, [rawCities, citiesEnabled]);

  // ── Countries ──────────────────────────────────────────────────────────────
  const countriesEnabled = enabledLayers.includes('countries');
  const { countries: rawCountries = [], isFetching: countriesFetching } =
    useOptimizedCountries(
      countriesEnabled
        ? {
            limit: 250,
            ...(filters?.search ? { search: filters.search } : {}),
          }
        : { limit: 0 },
    );

  const countryMarkers = useMemo<MapMarker[]>(() => {
    if (!countriesEnabled) return [];
    return (rawCountries as any[])
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
        linkTo: `/country/${c.id}`,
        meta: {
          capital: c.capital,
          code: c.code,
          population: c.population,
          continent: c.continent,
        },
      }));
  }, [rawCountries, countriesEnabled]);

  // ── Restrooms (stub — requires viewport-based API fetch) ──────────────────
  // Restrooms use the Refuge API which requires lat/lng. We keep this as a
  // placeholder; Phase 2 will wire up debounced viewport-based fetching.
  const restroomMarkers = useMemo<MapMarker[]>(() => [], []);

  // ── Hotels & Neighbourhoods (empty tables) ────────────────────────────────
  const hotelMarkers = useMemo<MapMarker[]>(() => [], []);
  const neighbourhoodMarkers = useMemo<MapMarker[]>(() => [], []);

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
    [venueMarkers, eventMarkers, cityMarkers, countryMarkers, restroomMarkers, hotelMarkers, neighbourhoodMarkers],
  );

  const isFetching =
    venuesFetching || eventsFetching || citiesFetching || countriesFetching;

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
