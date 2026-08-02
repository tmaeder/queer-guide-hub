import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TagVocabularyHealth {
  /** Singular/plural pairs still both active. Should be 0 — the nightly cron drains it. */
  plural_pairs_open: number;
  plural_merges_total: number;
  plural_merges_7d: number;
  /** Pairs a human (or the vocabulary guard) marked as distinct concepts. */
  plural_exclusions: number;
  /** Non-ASCII names whose slug lost characters. Should be 0. */
  slug_corrupt: number;
  /** Informational: mostly proper nouns and English loanwords, not defects. */
  non_ascii_active: number;
  /** Excludes the mat-/vibe-/occ- marketplace facets, which are uncategorized by design. */
  uncategorized_active: number;
  /** Free-text categories outside the governed tree. Should be 0. */
  legacy_category_values: number;
  /** Aliases shadowing a different live tag. Guarded, so non-zero means the guard is gone. */
  shadowing_aliases: number;
  /** Merge proposals whose stored lexical flag predates the current predicate. */
  stale_lexical_flags: number;
  merge_review_pending: number;
  plural_cron_last_success: string | null;
}

/** Vocabulary hygiene counters for the tag glossary (tag_vocabulary_health RPC). */
export function useTagVocabularyHealth() {
  return useQuery<TagVocabularyHealth | null>({
    queryKey: ['tag-vocabulary-health'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('tag_vocabulary_health');
      if (error) throw error;
      return (data ?? null) as TagVocabularyHealth | null;
    },
    staleTime: 60_000,
  });
}
