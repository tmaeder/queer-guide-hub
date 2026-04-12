import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calculateDistanceKm } from '@/utils/calculateDistance';

interface NearestAirport {
  iata_code: string;
  city_name: string;
  country_code: string;
  distanceKm: number;
}

interface UseNearestAirportParams {
  latitude: number | null;
  longitude: number | null;
  hasAirport: boolean;
}

async function findNearestAirport(
  lat: number,
  lon: number,
  degreeRange: number,
): Promise<NearestAirport | null> {
  const { data, error } = await supabase
    .from('airports')
    .select('iata_code, city_name, country_code, latitude, longitude')
    .gte('latitude', lat - degreeRange)
    .lte('latitude', lat + degreeRange)
    .gte('longitude', lon - degreeRange)
    .lte('longitude', lon + degreeRange);

  if (error || !data?.length) return null;

  let closest: NearestAirport | null = null;
  let minDist = Infinity;

  for (const airport of data) {
    if (!airport.latitude || !airport.longitude) continue;
    const dist = calculateDistanceKm(lat, lon, airport.latitude, airport.longitude);
    if (dist < minDist) {
      minDist = dist;
      closest = {
        iata_code: airport.iata_code,
        city_name: airport.city_name ?? '',
        country_code: airport.country_code ?? '',
        distanceKm: Math.round(dist),
      };
    }
  }

  return closest;
}

export function useNearestAirport({ latitude, longitude, hasAirport }: UseNearestAirportParams) {
  const { data: nearestAirport = null, isLoading } = useQuery({
    queryKey: ['nearest-airport', latitude, longitude],
    queryFn: async () => {
      const lat = latitude!;
      const lon = longitude!;
      // Try ~300km first, widen to ~660km if empty
      const result = await findNearestAirport(lat, lon, 3);
      if (result) return result;
      return findNearestAirport(lat, lon, 6);
    },
    enabled: !hasAirport && latitude != null && longitude != null,
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 2,
  });

  return { nearestAirport, loading: isLoading };
}
