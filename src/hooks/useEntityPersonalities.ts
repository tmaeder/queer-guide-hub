import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Personality } from '@/hooks/usePersonalities';

interface EntityScope {
  cityId?: string | null;
  countryId?: string | null;
  /** Defaults to 8. */
  limit?: number;
}

/**
 * Returns personalities tied to a given city or country via either the birth
 * relation (`city_id` / `country_id`) or the death relation
 * (`death_city_id` / `death_country_id`). City lookups are preferred — a
 * country lookup is the natural fallback for villages and for entities that
 * lack a sufficient by-city corpus.
 */
export function useEntityPersonalities({ cityId, countryId, limit = 8 }: EntityScope) {
  return useQuery({
    queryKey: ['entity-personalities', { cityId, countryId, limit }],
    enabled: Boolean(cityId || countryId),
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Personality[]> => {
      let query = supabase
        .from('personalities')
        .select(
          'id, slug, name, image_url, birth_date, death_date, is_living, profession, tags, is_featured, view_count',
        )
        .eq('visibility', 'public')
        .order('is_featured', { ascending: false })
        .order('view_count', { ascending: false })
        .limit(limit);

      if (cityId) {
        query = query.or(`city_id.eq.${cityId},death_city_id.eq.${cityId}`);
      } else if (countryId) {
        query = query.or(`country_id.eq.${countryId},death_country_id.eq.${countryId}`);
      } else {
        return [];
      }

      const { data, error } = await query;
      if (error) throw error;
      // Cast — these rows are a subset of Personality fields, enough for the rail card.
      return (data ?? []) as unknown as Personality[];
    },
  });
}
