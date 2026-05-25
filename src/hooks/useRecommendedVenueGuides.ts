import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type GuideRow = Database['public']['Tables']['venue_guides']['Row'];

export type VenueGuideBoostReason =
  | 'home_city'
  | 'interest'
  | 'category_affinity'
  | 'featured'
  | 'continue_reading';

export interface RecommendedVenueGuide
  extends Pick<
    GuideRow,
    | 'id'
    | 'slug'
    | 'title'
    | 'dek'
    | 'hero_image_path'
    | 'category'
    | 'city_id'
    | 'audience_tags'
    | 'reading_time_min'
    | 'pick_count'
    | 'published_at'
  > {
  boost_reason: VenueGuideBoostReason | null;
}

interface RecommendResponse {
  guides: RecommendedVenueGuide[];
  count: number;
  personalized: boolean;
}

interface UseRecommendedVenueGuidesOptions {
  limit?: number;
  enabled?: boolean;
}

export function useRecommendedVenueGuides({
  limit = 10,
  enabled = true,
}: UseRecommendedVenueGuidesOptions = {}) {
  return useQuery({
    queryKey: ['venue-guide-recommend', limit],
    queryFn: async (): Promise<RecommendedVenueGuide[]> => {
      const { data, error } = await supabase.functions.invoke<RecommendResponse>(
        'venue-guide-recommend',
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
