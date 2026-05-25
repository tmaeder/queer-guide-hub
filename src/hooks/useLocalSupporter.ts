import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface LocalSupporterScore {
  score: number;
  tier: 'Visitor' | 'Local' | 'Local Supporter' | 'Champion';
  favorites: number;
  guide_reads: number;
  reviews: number;
  weeks_decay: number;
  last_active_at: string | null;
}

export interface LocalSupporterCity {
  city_id: string;
  city_name: string;
  score: number;
  tier: LocalSupporterScore['tier'];
}

/**
 * Local Supporter score for the signed-in user in a specific city.
 * Anon / no city → null.
 */
export function useLocalSupporter(cityId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['local-supporter', user?.id, cityId],
    queryFn: async (): Promise<LocalSupporterScore | null> => {
      if (!user || !cityId) return null;
      const { data, error } = await supabase.rpc('local_supporter_score', {
        p_user_id: user.id,
        p_city_id: cityId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as LocalSupporterScore | null) ?? null;
    },
    enabled: !!user && !!cityId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * All cities where the signed-in user has any Local Supporter activity.
 * Powers the /marketplace/missions per-city list.
 */
export function useLocalSupporterCities() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['local-supporter-cities', user?.id],
    queryFn: async (): Promise<LocalSupporterCity[]> => {
      if (!user) return [];
      const { data, error } = await supabase.rpc('user_local_supporter_cities', {
        p_user_id: user.id,
      });
      if (error) throw error;
      return (data as LocalSupporterCity[] | null) ?? [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
