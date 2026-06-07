import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CityReviewRow {
  id: string;
  city_id: string;
  field: string;
  proposed_value: { value?: unknown; rationale?: string | null; scale?: string } | null;
  citations: { field?: string; url?: string; quote?: string }[] | null;
  confidence: number | null;
  created_at: string;
  cities: { name: string; slug: string } | null;
}

/** Open items in the City Truth Engine safety review gate, plus approve/reject. */
export function useCityReviewQueue() {
  const queryClient = useQueryClient();

  const query = useQuery<CityReviewRow[]>({
    queryKey: ['city-review-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('city_review_queue')
        .select('id, city_id, field, proposed_value, citations, confidence, created_at, cities(name, slug)')
        .eq('status', 'open')
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as CityReviewRow[];
    },
    staleTime: 30_000,
  });

  const decide = useMutation({
    mutationFn: async ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note?: string }) => {
      const fn = action === 'approve' ? 'approve_city_review' : 'reject_city_review';
      const { error } = await supabase.rpc(fn, { p_id: id, p_note: note ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['city-review-queue'] });
      queryClient.invalidateQueries({ queryKey: ['city-quality-summary'] });
    },
  });

  return { ...query, decide };
}
