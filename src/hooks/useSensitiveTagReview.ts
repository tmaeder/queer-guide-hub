import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SensitiveTag {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  is_sensitive: boolean;
  is_adult: boolean;
  usage_count: number | null;
  quality_score: number | null;
}

/**
 * Active sensitive/adult tags awaiting human review. The SEO sensitivity gate
 * (enforce_tag_seo_sensitivity_gate) keeps these out of the search index until
 * human_reviewed=true, so this queue is the surface that releases them.
 * Highest-exposure (most-used) tags first.
 */
export function useSensitiveTagReview(limit = 50) {
  const qc = useQueryClient();

  const query = useQuery<SensitiveTag[]>({
    queryKey: ['sensitive-tag-review', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('unified_tags')
        .select('id, name, category, description, is_sensitive, is_adult, usage_count, quality_score')
        .eq('status', 'active')
        .or('is_sensitive.eq.true,is_adult.eq.true')
        .not('human_reviewed', 'is', true)
        .order('usage_count', { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as SensitiveTag[];
    },
    staleTime: 30_000,
  });

  /** Approve a tag: human_reviewed=true releases the SEO gate; index it. */
  const approve = useMutation({
    mutationFn: async ({ id, index }: { id: string; index: boolean }) => {
      const { error } = await supabase
        .from('unified_tags')
        .update({ human_reviewed: true, seo_indexable: index, verification_status: 'reviewed' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sensitive-tag-review'] });
      qc.invalidateQueries({ queryKey: ['tag-quality-scorecard'] });
    },
    onError: () => toast.error('Failed to update tag'),
  });

  return { ...query, approve };
}
