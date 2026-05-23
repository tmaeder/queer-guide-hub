import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getContentType } from '@/config/contentTypes';

/**
 * Fetch a single row of any registered content type by id. Used by
 * the admin side sheet to lazy-load a row's data when the caller
 * didn't seed `currentData`. Lives as a hook to satisfy the
 * `queerguide/no-supabase-from-in-pages` ESLint rule.
 */
export function useContentRow(contentType: string, contentId: string, enabled: boolean) {
  const config = getContentType(contentType);
  return useQuery({
    queryKey: ['admin-content-row', contentType, contentId],
    enabled: enabled && Boolean(config) && Boolean(contentId),
    queryFn: async () => {
      if (!config) return null;
      const { data, error } = await supabase
        .from(config.tableName as 'venues')
        .select('*')
        .eq('id', contentId)
        .maybeSingle();
      if (error) throw error;
      return (data as Record<string, unknown> | null) ?? null;
    },
    staleTime: 30_000,
  });
}
