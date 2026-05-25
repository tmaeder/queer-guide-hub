import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CitySummary {
  id: string;
  name: string;
  slug: string | null;
  image_url: string | null;
  countries: {
    name: string | null;
    flag_emoji: string | null;
    equality_score: number | null;
  } | null;
}

/**
 * Batch-fetch cities by id for rails that consume the recommendation engine
 * (BecauseYouRail, NearbyTriptych, etc.). Stable on the id-set so multiple
 * rails on /travel deduplicate naturally via React Query.
 */
export function useCitiesByIds(ids: string[]) {
  const key = [...ids].sort().join(',');
  return useQuery({
    queryKey: ['cities-by-ids', key],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CitySummary[]> => {
      const { data, error } = await supabase
        .from('cities')
        .select('id, name, slug, image_url, countries(name, flag_emoji, equality_score)')
        .in('id', ids);
      if (error) throw error;
      return (data as unknown as CitySummary[]) ?? [];
    },
  });
}
