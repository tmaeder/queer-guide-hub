import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export interface PassportStats {
  countries_visited: number;
  total_countries: number;
  cities_visited: number;
  venues_visited: number;
  events_visited: number;
  villages_visited: number;
  continents_touched: number;
  pride_events: number;
}

export interface PassportData {
  stats: PassportStats | null;
  visitedCountryIds: Set<string>;
  visitedCityIds: Set<string>;
  visitedVillageIds: Set<string>;
}

const EMPTY: PassportData = {
  stats: null,
  visitedCountryIds: new Set(),
  visitedCityIds: new Set(),
  visitedVillageIds: new Set(),
};

export function usePlacesPassport() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery<PassportData>({
    queryKey: ['places-passport', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<PassportData> => {
      if (!userId) return EMPTY;

      const [statsRes, marksRes] = await Promise.all([
        supabase.rpc('footprint_stats', { p_user_id: userId }),
        supabase
          .from('user_place_marks')
          .select('entity_type, entity_id, city_id')
          .eq('user_id', userId)
          .eq('mark_type', 'visited'),
      ]);

      const statsRow = (statsRes.data as PassportStats[] | null)?.[0] ?? null;
      const marks = (marksRes.data ?? []) as Array<{
        entity_type: 'venue' | 'event' | 'village';
        entity_id: string;
        city_id: string | null;
      }>;

      const visitedCityIds = new Set<string>();
      const visitedVillageIds = new Set<string>();
      for (const m of marks) {
        if (m.city_id) visitedCityIds.add(m.city_id);
        if (m.entity_type === 'village') visitedVillageIds.add(m.entity_id);
      }

      // Derive visited country IDs by looking up the countries for visited cities.
      let visitedCountryIds = new Set<string>();
      if (visitedCityIds.size > 0) {
        const { data: cityRows } = await supabase
          .from('cities')
          .select('country_id')
          .in('id', Array.from(visitedCityIds));
        visitedCountryIds = new Set(
          (cityRows ?? [])
            .map((r) => (r as { country_id: string | null }).country_id)
            .filter(Boolean) as string[],
        );
      }

      return {
        stats: statsRow,
        visitedCountryIds,
        visitedCityIds,
        visitedVillageIds,
      };
    },
  });
}
