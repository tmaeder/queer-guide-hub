import { useQuery } from '@tanstack/react-query';
import { untypedSupabase } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import type { GuideFormat } from '@/hooks/useGuides';
import type { GuideEntityType } from '@/lib/guidePickAdapters';

export type GuideBoostReason =
  | 'home_city'
  | 'interest'
  | 'category_affinity'
  | 'featured'
  | 'continue_reading'
  | 'active_quest';

export interface RecommendedGuide {
  id: string;
  format: GuideFormat;
  slug: string;
  title: string;
  dek: string | null;
  hero_image_path: string | null;
  category: string | null;
  primary_entity_type: GuideEntityType | null;
  city_id: string | null;
  audience_tags: string[];
  reading_time_min: number | null;
  pick_count: number;
  published_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  score: number;
  boost_reason: GuideBoostReason | null;
}

interface UseRecommendedGuidesOptions {
  limit?: number;
  format?: GuideFormat;
  category?: string;
  enabled?: boolean;
}

/**
 * Unified recommender: calls the guides_recommend RPC directly (the old
 * per-type recommend edge functions were thin RPC wrappers and are gone).
 * Anonymous sessions get freshness + featured; the RPC excludes
 * safety-gated guides for anon internally.
 */
export function useRecommendedGuides({
  limit = 10,
  format,
  category,
  enabled = true,
}: UseRecommendedGuidesOptions = {}) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['guides-recommend', user?.id ?? 'anon', limit, format ?? null, category ?? null],
    queryFn: async (): Promise<RecommendedGuide[]> => {
      const { data, error } = await untypedSupabase.rpc('guides_recommend', {
        p_user_id: user?.id ?? null,
        p_limit: limit,
        p_format: format ?? null,
        p_category: category ?? null,
      });
      if (error) throw error;
      return (data ?? []) as unknown as RecommendedGuide[];
    },
    enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
