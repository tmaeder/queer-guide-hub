/**
 * useReviewCounts — legacy-shaped selector over the shared `useAdminCounts`
 * query. One `get_admin_counts` fetch (query key ['admin-counts']) feeds the
 * sidebar, command palette, cockpit AND the triage view; this hook only
 * reshapes that payload — it performs no fetching of its own, so badge counts
 * can never drift between surfaces.
 */

import { useMemo } from 'react';
import { useAdminCounts, type AdminCounts } from './useAdminCounts';

export interface ReviewCounts {
  staging: number;
  cmsReview: number;
  moderation: number;
  submissions: number;
  automation: number;
  tagSuggestions: number;
  duplicates: number;
  feedback: number;
  total: number;
}

export function toReviewCounts(raw: AdminCounts): ReviewCounts {
  const staging = raw.review_staging ?? 0;
  const cmsReview = raw.review_cms ?? 0;
  const moderation = raw.review_moderation ?? 0;
  const submissions = raw.review_submissions ?? 0;
  const automation = raw.review_automation ?? 0;
  const tagSuggestions = raw.review_tags ?? 0;
  const duplicates = raw.review_duplicates ?? 0;
  const feedback = raw.review_feedback ?? 0;

  return {
    staging,
    cmsReview,
    moderation,
    submissions,
    automation,
    tagSuggestions,
    duplicates,
    feedback,
    total:
      staging +
      cmsReview +
      moderation +
      submissions +
      automation +
      tagSuggestions +
      duplicates +
      feedback,
  };
}

export function useReviewCounts() {
  const query = useAdminCounts();
  const data = useMemo(
    () => (query.data ? toReviewCounts(query.data) : undefined),
    [query.data],
  );
  return { ...query, data };
}
