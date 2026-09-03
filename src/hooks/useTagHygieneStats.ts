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
  assignment_to_non_active_tag: number;
  nonclean_entity_type: number;
  duplicate_active_name: number;
  redirect_to_non_canonical: number;
  merged_but_not_status_merged: number;
  sensitive_without_description: number;
  indexable_without_description: number;
  /** The junction names a category, `unified_tags.category_id` names none. The
   *  junction is the source of truth and the column is derived from it, so
   *  non-zero means a writer inserted an assignment without letting the denorm
   *  follow — which is how doxy-pep and naloxone shipped. */
  denorm_category_missing: number;
  /** A bulk-import stamp ("Sexual activity tag", "Toys tag") published as a
   *  definition. Deliberately NOT covered by `indexable_without_description`,
   *  which only sees an empty column — a stamp is not empty, so it passed every
   *  check while /tags/anal-sex served four words as its lead paragraph. */
  placeholder_description_active: number;
  event_tag_strings_unresolved: number;
  /** Resolvable (event, tag) pairs with no assignment row — THE gauge for
   *  run_event_tag_link, and a true zero-invariant. Events older than an hour
   *  only, so a normal 10-minute cron lag does not register. */
  event_tag_pairs_unlinked: number;
  /** Coverage only, and its floor is NOT 0: ~3,856 events carry only strings the
   *  ambiguity guard blocks by design, so it can never empty. It claimed
   *  "non-zero means the job stopped" while the linker sat wedged for 1,106
   *  consecutive runs reading exactly that. Read event_tag_pairs_unlinked. */
  events_with_tags_unlinked: number;
  /** An alias identical to its own tag's name asserts nothing. */
  alias_equals_name: number;
  /** U+FFFD in an alias is transport corruption, never a spelling. */
  alias_mojibake: number;
  /** "No information available" stamps / LLM refusal essays published as prose. */
  refusal_prose_active: number;
  /** Typed (non-multilingual) aliases still review_status='auto' — displayed
   *  nowhere, trusted by nothing, awaiting human review. */
  unreviewed_typed_alias: number;
  /** tag_relations awaiting review: LLM-proposed 'pending' + legacy 'auto'
   *  related rows the display gate hides. A queue depth, not an invariant. */
  relations_pending_review: number;
  /** Active prose-bearing tags the mode='prose' truth+voice pass has not
   *  visited yet. Drains ~300/day; new tags refill it. */
  prose_unreviewed: number;
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
