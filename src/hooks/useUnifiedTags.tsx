import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface UnifiedTag {
  id: string;
  name: string;
  slug: string;
  description?: string;
  image_url?: string;
  usage_count: number;
  category?: string;
  created_at: string;
  updated_at: string;
}

const NO_TAGS: UnifiedTag[] = [];

/**
 * Active tags, most-used first. The only consumer is the venue filter bar.
 *
 * Keyed on the viewer: RLS (`unified_tags_public_gated_read`) hides sensitive
 * tags from anon, and the query cache survives sign-out, so an unkeyed list
 * would show a signed-in viewer's tags to the next anonymous one.
 *
 * The CRUD helpers this hook used to carry had no callers; tag writes go
 * through the CMS editor and `useCentralizedTags`.
 */
export const useUnifiedTags = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const query = useQuery<UnifiedTag[]>({
    queryKey: ['unified-tags', 'active', user?.id ?? 'anon'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('unified_tags')
        // Only the UnifiedTag fields: select('*') also shipped every tag's full
        // long_description, ~630 KB gzipped per call, for a filter that uses id + name.
        .select(
          'id, name, slug, description, image_url, usage_count, category, created_at, updated_at',
        )
        .eq('status', 'active')
        .order('usage_count', { ascending: false });
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        throw error;
      }
      return (data ?? []) as UnifiedTag[];
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    tags: query.data ?? NO_TAGS,
    loading: query.isLoading,
    error: query.error ? query.error.message : null,
    refresh: () => void query.refetch(),
  };
};
