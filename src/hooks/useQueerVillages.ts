import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type QueerVillage = Database['public']['Tables']['queer_villages']['Row'];

export type QueerVillageWithRelations = QueerVillage & {
  cities?: { id: string; name: string } | null;
  countries?: { id: string; name: string; continent_id?: string } | null;
};

// Stable empty fallback so consumers' memos/effects don't re-run every render.
const NO_VILLAGES: QueerVillageWithRelations[] = [];

/**
 * Queer villages, all of them or one city's districts.
 *
 * `cityId: null` means "the city is not known yet" and stays disabled, so a
 * city page does not fetch the unfiltered list while its own row loads.
 * Omit `cityId` for the whole list.
 */
export function useQueerVillages({ cityId }: { cityId?: string | null } = {}) {
  const byCity = cityId !== undefined;
  const query = useQuery({
    queryKey: ['queer-villages', cityId ?? 'all'],
    enabled: !byCity || !!cityId,
    queryFn: async () => {
      // The unfiltered list feeds VillagesRail, which renders VillageCard fields only;
      // select('*') shipped every village's history and editorial text (~400 KB gzipped
      // per call). A single city's districts still get every column.
      const columns = byCity
        ? '*, cities:city_id(id, name), countries:country_id(id, name, continent_id)'
        : 'id, name, slug, description, image_url, featured, city_id, country_id, cities:city_id(id, name), countries:country_id(id, name, continent_id)';
      let q = supabase
        .from('queer_villages')
        .select(columns)
        .order('featured', { ascending: false })
        .order('name', { ascending: true });
      if (cityId) q = q.eq('city_id', cityId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as QueerVillageWithRelations[];
    },
  });

  return {
    villages: query.data ?? NO_VILLAGES,
    loading: query.isLoading,
    error: query.error ? query.error.message || 'Failed to fetch villages' : null,
  };
}
