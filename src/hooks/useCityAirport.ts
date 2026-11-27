import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** The main airport (IATA) we hold for a city, or null. */
export function useCityAirport(cityId: string | null | undefined) {
  return useQuery({
    queryKey: ['city-airport', cityId],
    enabled: !!cityId,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('cities')
        .select('major_airport_code')
        .eq('id', cityId!)
        .maybeSingle();
      return (data?.major_airport_code as string | null) ?? null;
    },
  });
}
