/**
 * useReviewCounts -- Aggregate badge counts across all review queues.
 * Uses a single RPC call instead of multiple HEAD requests to avoid
 * PostgREST connection pool exhaustion.
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/integrations/api/client';

export interface ReviewCounts {
  staging: number;
  cmsReview: number;
  moderation: number;
  automation: number;
  tagSuggestions: number;
  duplicates: number;
  total: number;
}

async function fetchReviewCounts(): Promise<ReviewCounts> {
  const { data, error } = await api.rpc('get_admin_counts');

  if (error || !data) {
    return {
      staging: 0,
      cmsReview: 0,
      moderation: 0,
      automation: 0,
      tagSuggestions: 0,
      duplicates: 0,
      total: 0,
    };
  }

  const raw = data as Record<string, number>;
  const staging = raw.review_staging ?? 0;
  const cmsReview = raw.review_cms ?? 0;
  const moderation = raw.review_moderation ?? 0;
  const automation = 0; // content_flags table does not exist
  const tagSuggestions = raw.review_tags ?? 0;
  const duplicates = raw.review_duplicates ?? 0;

  return {
    staging,
    cmsReview,
    moderation,
    automation,
    tagSuggestions,
    duplicates,
    total: staging + cmsReview + moderation + automation + tagSuggestions + duplicates,
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
