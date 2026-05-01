import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface UseEntityDetailOptions {
  /** Supabase table name, e.g. 'venues' */
  table: string;
  /** Slug from URL params; query is disabled while undefined */
  slug: string | undefined;
  /** Optional select string; defaults to '*' */
  joinSpec?: string;
  /** React Query key prefix; combined with table+slug for cache uniqueness */
  queryKey: string;
}

/**
 * Generic detail-page data hook. Fetches a single row from `table` matched on
 * `slug`. Foundation for the EntityDetailLayout abstraction (ARCH-1) — pages
 * can adopt this in follow-up PRs to replace per-page fetch boilerplate.
 */
export function useEntityDetail<T>(opts: UseEntityDetailOptions): UseQueryResult<T | null> {
  const { table, slug, joinSpec, queryKey } = opts;

  return useQuery<T | null>({
    queryKey: [queryKey, table, slug],
    enabled: Boolean(slug),
    staleTime: 60_000,
    queryFn: async () => {
      if (!slug) return null;
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(table as any)
        .select(joinSpec ?? '*')
        .eq('slug', slug)
        .single();

      if (error) {
        // PGRST116 = no rows found; treat as null instead of throwing
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return (data as unknown as T) ?? null;
    },
  });
}
