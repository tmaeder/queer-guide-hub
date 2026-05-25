import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CityComparison {
  id: string;
  name: string;
  slug: string | null;
  population: number | null;
  timezone: string | null;
  local_language: string | null;
  major_airport_code: string | null;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  is_capital: boolean | null;
  is_major_city: boolean | null;
  countries: {
    id: string;
    name: string | null;
    slug: string | null;
    code: string | null;
    flag_emoji: string | null;
    equality_score: number | null;
    currency: string | null;
  } | null;
}

/**
 * Batch-fetches the rich city payload required by the /cities/compare page.
 * Stable on the sorted id-set so reload + URL share are cache-equivalent.
 */
export function useCityCompareData(ids: string[]) {
  const stableKey = [...ids].sort().join(',');
  return useQuery({
    queryKey: ['city-compare-data', stableKey],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CityComparison[]> => {
      const { data, error } = await supabase
        .from('cities')
        .select(
          'id, name, slug, population, timezone, local_language, major_airport_code, latitude, longitude, image_url, is_capital, is_major_city, countries(id, name, slug, code, flag_emoji, equality_score, currency)',
        )
        .in('id', ids);
      if (error) throw error;
      return (data as unknown as CityComparison[]) ?? [];
    },
  });
}
