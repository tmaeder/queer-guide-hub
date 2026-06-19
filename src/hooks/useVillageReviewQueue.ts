import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VillageReviewRow {
  id: string;
  village_id: string;
  field: string;
  proposed_value: { value?: unknown } | null;
  citations: { field?: string; url?: string; quote?: string }[] | null;
  confidence: number | null;
  created_at: string;
  queer_villages: { name: string; slug: string } | null;
}

/** Open items in the Village Truth Engine review gate, plus approve/reject. */
export function useVillageReviewQueue() {
  const queryClient = useQueryClient();

  const query = useQuery<VillageReviewRow[]>({
    queryKey: ['village-review-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('village_review_queue')
        .select('id, village_id, field, proposed_value, citations, confidence, created_at, queer_villages(name, slug)')
        .eq('status', 'open')
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as VillageReviewRow[];
    },
    staleTime: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['village-review-queue'] });
    queryClient.invalidateQueries({ queryKey: ['village-quality-summary'] });
  };

  const decide = useMutation({
    mutationFn: async ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note?: string }) => {
      const fn = action === 'approve' ? 'approve_village_review' : 'reject_village_review';
      const { error } = await supabase.rpc(fn, { p_id: id, p_note: note ?? null });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { ...query, decide };
}
