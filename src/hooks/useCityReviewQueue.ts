import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CityReviewRow {
  id: string;
  city_id: string;
  field: string;
  proposed_value: { value?: unknown; rationale?: string | null; scale?: string; risk_tier?: string } | null;
  citations: { field?: string; url?: string; quote?: string }[] | null;
  confidence: number | null;
  created_at: string;
  cities: { name: string; slug: string } | null;
}

/** A criminalizing destination — approval requires explicit confirmation (outing safety). */
export const isCriminalizingTier = (tier?: string) => tier === 'high' || tier === 'critical';

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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['city-review-queue'] });
    queryClient.invalidateQueries({ queryKey: ['city-quality-summary'] });
  };

  const decide = useMutation({
    mutationFn: async ({ id, action, note, confirm }: { id: string; action: 'approve' | 'reject'; note?: string; confirm?: boolean }) => {
      if (action === 'reject') {
        const { error } = await supabase.rpc('reject_city_review', { p_id: id, p_note: note ?? null });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.rpc('approve_city_review', { p_id: id, p_note: note ?? null, p_confirm: confirm ?? false });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  // Approve every open safety_notes row the composer marks safe-tier (never criminalizing).
  const batchApproveSafe = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('batch_approve_safe_city_reviews');
      if (error) throw error;
      return (data as { approved?: number } | null)?.approved ?? 0;
    },
    onSuccess: invalidate,
  });

  // Approve every open lgbt_friendly_rating row that is cited + non-criminalizing.
  const batchApproveCitedRatings = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('batch_approve_cited_city_ratings');
      if (error) throw error;
      return (data as { approved?: number } | null)?.approved ?? 0;
    },
    onSuccess: invalidate,
  });

  return { ...query, decide, batchApproveSafe, batchApproveCitedRatings };
}
