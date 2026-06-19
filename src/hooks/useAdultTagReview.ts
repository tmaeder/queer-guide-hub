import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AdultTagCandidate {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  sensitive_topics: string[] | null;
  usage_count: number | null;
  quality_score: number | null;
  likely_false_positive: boolean;
}

/**
 * Active is_adult tags awaiting a human verdict. The selector floats civic/
 * generic names ("Freedom Of Speech", "Music", "Prison") to the top via a
 * heuristic — but the heuristic only RANKS; an operator confirms each clear.
 * Clearing is reversible (tag_adult_false_positive_backup + restore RPC).
 */
export function useAdultTagReview(limit = 200) {
  const qc = useQueryClient();

  const query = useQuery<AdultTagCandidate[]>({
    queryKey: ['adult-tag-review', limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('tags_adult_review_candidates', {
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as AdultTagCandidate[];
    },
    staleTime: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['adult-tag-review'] });
    qc.invalidateQueries({ queryKey: ['sensitive-tag-review'] });
    qc.invalidateQueries({ queryKey: ['tag-quality-scorecard'] });
  };

  /** Operator confirms the tag is not adult: clear flags + restore indexing. */
  const clear = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await supabase.rpc('clear_tag_adult_false_positive', {
        p_tag_id: id,
        p_reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => toast.error('Failed to clear adult flag'),
  });

  /** Operator confirms the tag IS adult: human_reviewed, keep it gated. */
  const keepFlagged = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('unified_tags')
        .update({ human_reviewed: true, seo_indexable: false, verification_status: 'reviewed' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => toast.error('Failed to update tag'),
  });

  return { ...query, clear, keepFlagged };
}
