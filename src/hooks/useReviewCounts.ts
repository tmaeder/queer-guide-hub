/**
 * useReviewCounts — Aggregate badge counts across all review queues.
 * Used by the admin sidebar and unified review dashboard.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ReviewCounts {
  staging: number;
  cmsReview: number;
  moderation: number;
  tagSuggestions: number;
  total: number;
}

async function fetchReviewCounts(): Promise<ReviewCounts> {
  const [stagingRes, cmsRes, modRes, tagRes] = await Promise.all([
    // Staging items pending review
    supabase
      .from('ingestion_staging' as any)
      .select('id', { count: 'exact', head: true })
      .eq('review_status', 'pending_review')
      .eq('disposition', 'pending'),
    // CMS content in review state
    supabase
      .from('cms_content_metadata' as any)
      .select('id', { count: 'exact', head: true })
      .eq('workflow_state', 'review'),
    // Open moderation flags
    supabase
      .from('moderation_flags' as any)
      .select('id', { count: 'exact', head: true })
      .eq('status', 'OPEN'),
    // Pending tag suggestions
    supabase
      .from('tag_suggestions' as any)
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);

  const staging = stagingRes.count ?? 0;
  const cmsReview = cmsRes.count ?? 0;
  const moderation = modRes.count ?? 0;
  const tagSuggestions = tagRes.count ?? 0;

  return {
    staging,
    cmsReview,
    moderation,
    tagSuggestions,
    total: staging + cmsReview + moderation + tagSuggestions,
  };
}

export function useReviewCounts() {
  return useQuery({
    queryKey: ['review-counts'],
    queryFn: fetchReviewCounts,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
