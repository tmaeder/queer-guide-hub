import { useQuery } from '@tanstack/react-query';

const GEO_WORKER_URL = 'https://geo-boundaries.maeder-tobiassimon.workers.dev';

type Resolution = '110m' | '50m';

/** Select boundary resolution based on map zoom level */
function resolveResolution(zoom: number): Resolution {
  return zoom >= 5 ? '50m' : '110m';
}

/**
 * Fetches country boundary GeoJSON from the R2-backed CF Worker.
 * Automatically switches between 110m (world view) and 50m (zoomed) resolution.
 * Both resolutions are cached independently by React Query.
 */
export function useCountryBoundaries(enabled: boolean, zoom: number) {
  const resolution = resolveResolution(zoom);

  return useQuery<GeoJSON.FeatureCollection>({
    queryKey: ['country_boundaries', resolution],
    queryFn: async () => {
      const res = await fetch(`${GEO_WORKER_URL}/countries-${resolution}.geojson`);
      if (!res.ok) throw new Error(`Failed to load country boundaries: ${res.status}`);
      return res.json() as Promise<GeoJSON.FeatureCollection>;
    },
    enabled,
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * Fetches city boundary GeoJSON from the R2-backed CF Worker.
 * Single file — already simplified server-side via polygon_threshold.
 */
export function useCityBoundaries(enabled: boolean) {
  return useQuery<GeoJSON.FeatureCollection>({
    queryKey: ['city_boundaries'],
    queryFn: async () => {
      const res = await fetch(`${GEO_WORKER_URL}/cities-boundaries.geojson`);
      if (!res.ok) throw new Error(`Failed to load city boundaries: ${res.status}`);
      return res.json() as Promise<GeoJSON.FeatureCollection>;
    },
    enabled,
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * Fetches neighbourhood (queer village) boundary GeoJSON from the R2-backed CF Worker.
 */
export function useNeighbourhoodBoundaries(enabled: boolean) {
  return useQuery<GeoJSON.FeatureCollection>({
    queryKey: ['neighbourhood_boundaries'],
    queryFn: async () => {
      const res = await fetch(`${GEO_WORKER_URL}/neighbourhoods-boundaries.geojson`);
      if (!res.ok) throw new Error(`Failed to load neighbourhood boundaries: ${res.status}`);
      return res.json() as Promise<GeoJSON.FeatureCollection>;
    },
    enabled,
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
