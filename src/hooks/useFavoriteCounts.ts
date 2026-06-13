import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const FAVORITE_TABLES = [
  { table: 'venue_favorites', label: 'venues' },
  { table: 'event_favorites', label: 'events' },
  { table: 'city_favorites', label: 'cities' },
  { table: 'marketplace_favorites', label: 'shop' },
  { table: 'news_favorites', label: 'news' },
] as const;

export interface FavoriteCount {
  label: string;
  count: number;
}

/** Non-zero saved-item counts per content type for the profile Travel tab. */
export function useFavoriteCounts(userId: string | undefined) {
  return useQuery({
    queryKey: ['favorite-counts', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<FavoriteCount[]> => {
      const results = await Promise.all(
        FAVORITE_TABLES.map(({ table }) =>
          supabase
            .from(table as 'venue_favorites')
            .select('user_id', { count: 'exact', head: true })
            .eq('user_id', userId!),
        ),
      );
      return FAVORITE_TABLES.map(({ label }, i) => ({
        label,
        count: results[i].count ?? 0,
      })).filter((r) => r.count > 0);
    },
  });
}
