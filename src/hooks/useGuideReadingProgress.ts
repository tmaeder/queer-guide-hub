import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Database } from '@/integrations/supabase/types';

type GuideRow = Database['public']['Tables']['marketplace_guides']['Row'];

export interface InProgressGuide {
  guide_id: string;
  scroll_pct: number;
  started_at: string;
  guide: Pick<
    GuideRow,
    'id' | 'slug' | 'title' | 'dek' | 'hero_image_path' | 'category_slug' | 'pick_count' | 'reading_time_min' | 'audience_tags' | 'city_id' | 'published_at'
  >;
}

/**
 * Guides the signed-in user has started but not yet completed.
 * Powers the "Continue reading" rail on /marketplace.
 */
export function useContinueReadingGuides(limit = 4) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['marketplace-continue-reading', user?.id, limit],
    queryFn: async (): Promise<InProgressGuide[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('marketplace_guide_reads')
        .select(
          `guide_id, scroll_pct, started_at,
           guide:marketplace_guides!inner(id, slug, title, dek, hero_image_path, category_slug, pick_count, reading_time_min, audience_tags, city_id, published_at, status)`,
        )
        .eq('user_id', user.id)
        .is('completed_at', null)
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return ((data ?? []) as unknown as InProgressGuide[]).filter(
        (r) => (r.guide as unknown as { status: string }).status === 'published',
      );
    },
    enabled: !!user,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Consecutive-ISO-weeks streak with ≥1 completed guide read.
 * Returns 0 when the user has no recent activity — UI hides the caption
 * when streak < 2 (no shaming).
 */
export function useReadingStreak() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['marketplace-reading-streak', user?.id],
    queryFn: async (): Promise<number> => {
      if (!user) return 0;
      const { data, error } = await supabase.rpc(
        'marketplace_guide_reading_streak',
        { p_user_id: user.id },
      );
      if (error) throw error;
      return (data as number | null) ?? 0;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
