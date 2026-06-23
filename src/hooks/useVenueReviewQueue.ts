import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VenueReviewRow {
  id: string;
  venue_id: string;
  field: string;
  proposed_value: { value?: unknown } | null;
  citations: { field?: string; quote?: string; source?: string }[] | null;
  confidence: number | null;
  created_at: string;
  venues: { name: string; slug: string } | null;
}

/** Open items in the Amenity Truth Engine accessibility review gate, plus approve/reject. */
export function useVenueReviewQueue() {
  const queryClient = useQueryClient();

  const query = useQuery<VenueReviewRow[]>({
    queryKey: ['venue-review-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venue_review_queue')
        .select('id, venue_id, field, proposed_value, citations, confidence, created_at, venues(name, slug)')
        .eq('status', 'open')
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as VenueReviewRow[];
    },
    staleTime: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['venue-review-queue'] });
    queryClient.invalidateQueries({ queryKey: ['amenity-quality-summary'] });
  };

  const decide = useMutation({
    mutationFn: async ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note?: string }) => {
      const fn = action === 'approve' ? 'approve_venue_review' : 'reject_venue_review';
      const { error } = await supabase.rpc(fn, { p_id: id, p_note: note ?? null });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  // One-click approve of safe items: high confidence + citation-backed. Accessibility
  // stays human-gated — this just collapses twenty clicks into one.
  const batchApproveSafe = useMutation({
    mutationFn: async (minConf = 0.8) => {
      const { data, error } = await supabase.rpc('batch_approve_safe_venue_reviews', { p_min_conf: minConf });
      if (error) throw error;
      return (data as { approved?: number })?.approved ?? 0;
    },
    onSuccess: invalidate,
  });

  return { ...query, decide, batchApproveSafe };
}
