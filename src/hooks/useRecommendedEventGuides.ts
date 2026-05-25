import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type GuideRow = Database['public']['Tables']['event_guides']['Row'];

export type EventGuideBoostReason =
  | 'home_city'
  | 'interest'
  | 'featured';

export interface RecommendedEventGuide
  extends Pick<
    GuideRow,
    | 'id'
    | 'slug'
    | 'title'
    | 'dek'
    | 'hero_image_path'
    | 'event_type'
    | 'city_id'
    | 'audience_tags'
    | 'reading_time_min'
    | 'pick_count'
    | 'published_at'
  > {
  boost_reason: EventGuideBoostReason | null;
}

interface RecommendResponse {
  guides: RecommendedEventGuide[];
  count: number;
  personalized: boolean;
}

export function useRecommendedEventGuides({ limit = 10, enabled = true } = {}) {
  return useQuery({
    queryKey: ['event-guide-recommend', limit],
    queryFn: async (): Promise<RecommendedEventGuide[]> => {
      const { data, error } = await supabase.functions.invoke<RecommendResponse>(
        'event-guide-recommend',
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
