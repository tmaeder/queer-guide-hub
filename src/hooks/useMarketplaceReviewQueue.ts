import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MarketplaceReviewRow {
  id: string;
  listing_id: string;
  field: string;
  proposed_value: {
    subcategory?: string;
    from_rating?: string;
    to_rank?: number;
    rationale?: string;
  } | null;
  citations: { field?: string; quote?: string; source?: string }[] | null;
  confidence: number | null;
  model: string | null;
  created_at: string;
  marketplace_listings: { title: string; subcategory_slug: string | null; content_rating: string | null } | null;
}

/** Open items in the marketplace tag engine's rating-downgrade gate, plus approve/reject. */
export function useMarketplaceReviewQueue() {
  const queryClient = useQueryClient();

  const query = useQuery<MarketplaceReviewRow[]>({
    queryKey: ['marketplace-review-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketplace_review_queue')
        .select('id, listing_id, field, proposed_value, citations, confidence, model, created_at, marketplace_listings(title, subcategory_slug, content_rating)')
        .eq('status', 'open')
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as MarketplaceReviewRow[];
    },
    staleTime: 30_000,
  });

  const decide = useMutation({
    mutationFn: async ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note?: string }) => {
      const fn = action === 'approve' ? 'approve_marketplace_review' : 'reject_marketplace_review';
      const { error } = await supabase.rpc(fn, { p_id: id, p_note: note ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-review-queue'] });
    },
  });

  return { ...query, decide };
}
