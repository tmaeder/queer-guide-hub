import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type GuideRow = Database['public']['Tables']['marketplace_guides']['Row'];

export type GuideBoostReason =
  | 'home_city'
  | 'interest'
  | 'category_affinity'
  | 'featured'
  | 'continue_reading';

export interface RecommendedGuide
  extends Pick<
    GuideRow,
    | 'id'
    | 'slug'
    | 'title'
    | 'dek'
    | 'hero_image_path'
    | 'category_slug'
    | 'city_id'
    | 'audience_tags'
    | 'reading_time_min'
    | 'pick_count'
    | 'published_at'
  > {
  boost_reason: GuideBoostReason | null;
}

interface RecommendResponse {
  guides: RecommendedGuide[];
  count: number;
  phase: number;
}

interface UseRecommendedGuidesOptions {
  limit?: number;
  enabled?: boolean;
}

export function useRecommendedGuides({
  limit = 10,
  enabled = true,
}: UseRecommendedGuidesOptions = {}) {
  return useQuery({
    queryKey: ['marketplace-recommend', limit],
    queryFn: async (): Promise<RecommendedGuide[]> => {
      const { data, error } = await supabase.functions.invoke<RecommendResponse>(
        'marketplace-recommend',
        { body: { limit } },
      );
      if (error) throw error;
      return data?.guides ?? [];
    },
    enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
