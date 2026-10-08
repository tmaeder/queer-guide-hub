import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';

/** One row of `public.city_nearest_airports` (migration 99991791495267). */
export interface CityNearestAirport {
  iata_code: string;
  /** OurAirports municipality — the place the airport sits in. */
  city: string | null;
  airport_name: string;
  country_code: string;
  /** `numeric` — PostgREST serialises it as a string ("26.6"). */
  distance_km: number | string;
}

/**
 * The nearest scheduled-passenger airports to a city, measured from the city
 * and ACROSS borders (Aachen: MST, LGG, DUS). The city's own airports are
 * excluded server-side, since the page names those in the separate "Airport"
 * fact.
 */
export function useCityNearestAirports(cityId: string | null | undefined, limit = 3) {
  return useQuery({
    queryKey: ['city-nearest-airports', cityId, limit],
    enabled: !!cityId,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await untypedRpc<CityNearestAirport[]>('city_nearest_airports', {
        p_city_id: cityId,
        p_limit: limit,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
