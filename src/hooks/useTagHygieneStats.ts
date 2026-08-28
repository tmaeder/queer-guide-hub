import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Every key outside `totals` is a COUNT OF THINGS THAT SHOULD BE ZERO. The
 * shape is fixed by `tag_hygiene_stats()` — see the migration chain starting at
 * 20260823080819. Adding a counter there without adding it here is caught by
 * `src/lib/__tests__/tagHygienePanelMetrics.test.ts`, which reads the same
 * baseline file the CI ratchet does.
 */
export interface TagHygieneStats {
  totals: {
    active_tags: number;
    categories: number;
    assignments: number;
  };
  uncategorized_active: number;
  dangling_category_id: number;
  /** Glossary photography retired 2026-08-28 — any active tag carrying an
   *  image_url means a writer regrew the corpus the retirement cleared. */
  active_tags_with_image_url: number;
  /** Legacy trio: 0 since the retirement; kept transitionally so the
   *  prod-measuring CI gate stayed green across the merge window. */
  image_without_license: number;
  commons_image_without_license: number;
  image_alt_column_empty: number;
  assignment_to_non_active_tag: number;
  nonclean_entity_type: number;
  duplicate_active_name: number;
  redirect_to_non_canonical: number;
  merged_but_not_status_merged: number;
  sensitive_without_description: number;
  indexable_without_description: number;
  event_tag_strings_unresolved: number;
  events_with_tags_unlinked: number;
}

/**
 * Live tag data-quality counters (`tag_hygiene_stats` RPC, admin-gated by
 * `assert_admin_or_internal()`).
 *
 * The same RPC backs the CI ratchet in `scripts/check-tag-hygiene.mjs`. This
 * hook exists because the ratchet is the only reader of six advisory metrics
 * that CI deliberately WARNS on rather than fails — a warning on a passing run
 * is a log line nobody reads.
 *
 * `retry: false` on purpose: the function reads the whole `events` corpus and
 * used to sit on PostgREST's 8s `statement_timeout` (fixed by 20260928143000).
 * Retrying a query that is slow by nature just multiplies the load; the panel
 * shows the failure instead of hiding it behind a spinner.
 */
export function useTagHygieneStats() {
  return useQuery<TagHygieneStats>({
    queryKey: ['tag-hygiene-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('tag_hygiene_stats');
      if (error) throw error;
      return data as unknown as TagHygieneStats;
    },
    staleTime: 300_000,
    retry: false,
  });
}
