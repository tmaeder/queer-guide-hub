import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { untypedSupabase, untypedRpc } from '@/integrations/supabase/untyped';
import type { ReviewItem } from './useAdminReview';

export interface ReviewCaseInfo {
  id: string;
  family: 'artwork' | 'venue' | 'city_identity' | 'business_link' | 'record';
  stage: 'ready' | 'research' | 'blocked';
  fingerprint: string;
  member_count: number;
}
export interface ReviewCaseDetails {
  id: string;
  family: ReviewCaseInfo['family'];
  fingerprint: string;
  members: Array<ReviewItem & { current_record?: Record<string, unknown> | null }>;
  candidates?: Record<string, unknown>[] | null;
  city_context?: Record<string, unknown> | null;
  research_enabled?: boolean;
  research: {
    status: string;
    attempts: number;
    last_attempt_at: string | null;
    next_attempt_at: string | null;
    outcome: Record<string, unknown>;
  } | null;
}
export const reviewCaseInfo = (item: ReviewItem) => item.meta.review_case as ReviewCaseInfo;
export function useReviewCase(id: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['review-case-details', user?.id, id],
    enabled: !!user?.id,
    queryFn: async ({ signal }): Promise<ReviewCaseDetails | null> => {
      const { data, error } = await untypedSupabase
        .rpc('get_admin_review_case_details', { p_case_id: id })
        .abortSignal(signal);
      if (error) throw new Error(error.message);
      return data as ReviewCaseDetails | null;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
export function useRetryReviewResearch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedRpc('retry_admin_review_research', { p_case_id: id });
      if (error) throw new Error(error.message);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['review-case-details'] });
      void client.invalidateQueries({ queryKey: ['admin-review'] });
      void client.invalidateQueries({ queryKey: ['admin-review-summary'] });
    },
  });
}
