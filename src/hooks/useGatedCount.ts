import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';

export interface GatedCount {
  venues: number;
  events: number;
  organizations: number;
  /**
   * Whether the LOCATION is criminalizing / death-penalty. A different question
   * from whether anything here is gated — see GatedContentNotice. Optional
   * because this bundle can be running against a database where 99991791364430
   * has not applied yet.
   */
  high_risk?: boolean;
}

/**
 * How many venues, events and organisations here are hidden from a signed-out
 * reader. `gated_count_for_location` returns aggregate counts only (no row
 * data), so this is safe to call anonymously. Always zero for a signed-in user.
 */
export function useGatedCount(cityId?: string | null, countryId?: string | null) {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['gated-content-count', cityId ?? null, countryId ?? null],
    queryFn: async (): Promise<GatedCount> => {
      const { data, error } = await untypedRpc<GatedCount>('gated_count_for_location', {
        p_country_id: countryId ?? null,
        p_city_id: cityId ?? null,
      });
      if (error) throw error;
      return data ?? { venues: 0, events: 0, organizations: 0 };
    },
    enabled: !user && (!!cityId || !!countryId),
    staleTime: 5 * 60 * 1000,
  });
  if (user) return { data: undefined, total: 0 };
  const total = (data?.venues ?? 0) + (data?.events ?? 0) + (data?.organizations ?? 0);
  return { data, total };
}
