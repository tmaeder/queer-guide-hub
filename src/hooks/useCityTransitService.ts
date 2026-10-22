import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';
import type { CityTransitRow } from '@/lib/cityTransit';

/**
 * Derived timetable facts for a city (`get_city_transit_service`). Empty for a
 * city with no feed or an expired one — the server refuses to serve an expired
 * timetable, so an empty list never means "no service".
 */
export function useCityTransitService(cityId: string | null | undefined) {
  return useQuery({
    queryKey: ['city-transit-service', cityId],
    enabled: !!cityId,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await untypedRpc<CityTransitRow[]>('get_city_transit_service', {
        p_city_id: cityId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
