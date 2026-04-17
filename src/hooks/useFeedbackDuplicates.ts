import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DuplicateSuggestion } from '@/components/admin/feedback/types';

/** All open duplicate suggestions, keyed by the submission they touch. */
export function useFeedbackDuplicateSuggestions() {
  return useQuery<DuplicateSuggestion[]>({
    queryKey: ['admin-feedback-duplicates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feedback_duplicate_suggestions')
        .select('id,a_id,b_id,similarity,dismissed')
        .eq('dismissed', false)
        .order('similarity', { ascending: false });
      if (error) throw error;
      return (data || []) as DuplicateSuggestion[];
    },
    staleTime: 60_000,
  });
}

/**
 * Build a lookup from submission-id → list of partner-id + score for the open
 * suggestions, so the drawer can show "Possible duplicate of #X (78%)".
 */
export function buildDuplicateMap(
  suggestions: DuplicateSuggestion[],
): Record<string, Array<{ partnerId: string; suggestionId: string; similarity: number }>> {
  const map: Record<string, Array<{ partnerId: string; suggestionId: string; similarity: number }>> = {};
  for (const s of suggestions) {
    (map[s.a_id] ??= []).push({
      partnerId: s.b_id,
      suggestionId: s.id,
      similarity: s.similarity,
    });
    (map[s.b_id] ??= []).push({
      partnerId: s.a_id,
      suggestionId: s.id,
      similarity: s.similarity,
    });
  }
  return map;
}

export function useDismissDuplicateSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const { error } = await supabase
        .from('feedback_duplicate_suggestions')
        .update({ dismissed: true, dismissed_at: new Date().toISOString() })
        .eq('id', suggestionId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-feedback-duplicates'] }),
  });
}

/**
 * Merge `duplicateId` into `canonicalId`:
 * - sets duplicate_of on the duplicate
 * - dismisses the matching suggestion
 * The admin picks which of the pair is canonical in the UI.
 */
export function useMergeDuplicate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      duplicateId,
      canonicalId,
      suggestionId,
    }: {
      duplicateId: string;
      canonicalId: string;
      suggestionId: string;
    }) => {
      const { error: updErr } = await supabase
        .from('community_submissions')
        .update({ duplicate_of: canonicalId })
        .eq('id', duplicateId);
      if (updErr) throw updErr;

      const { error: dismErr } = await supabase
        .from('feedback_duplicate_suggestions')
        .update({ dismissed: true, dismissed_at: new Date().toISOString() })
        .eq('id', suggestionId);
      if (dismErr) throw dismErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-feedback-board'] });
      qc.invalidateQueries({ queryKey: ['admin-feedback-duplicates'] });
    },
  });
}
