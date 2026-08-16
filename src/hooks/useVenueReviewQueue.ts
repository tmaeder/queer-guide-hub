import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';

export type ReviewKind = 'category' | 'nonvenue';

export interface VenueReviewCandidate {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  website: string | null;
  description: string | null;
  /** Category kind only. */
  suggested: string | null;
  confidence: number | null;
  /** Non-venue kind only — why the heuristic flagged it. */
  reason: string | null;
  /** The raw provider tags the engine itself read. This is the single most
   *  useful column on the screen: "Movie Theater,Save,mixed" decides a row that
   *  the name alone ("Cine Hoyts") cannot. */
  source_tags: string | null;
  data_source: string | null;
}

export interface VenueReviewCounts {
  category_pending: number;
  nonvenue_pending: number;
  no_signal: number;
  unexamined: number;
  other_total: number;
}

export function useVenueReviewCounts() {
  return useQuery({
    queryKey: ['venue-review-counts'],
    staleTime: 60_000,
    queryFn: async (): Promise<VenueReviewCounts> => {
      const { data, error } = await untypedRpc<VenueReviewCounts>('venue_review_counts');
      if (error) throw error;
      return (
        data ?? {
          category_pending: 0,
          nonvenue_pending: 0,
          no_signal: 0,
          unexamined: 0,
          other_total: 0,
        }
      );
    },
  });
}

export function useVenueReviewCandidates(kind: ReviewKind, limit = 25) {
  return useQuery({
    queryKey: ['venue-review-candidates', kind, limit],
    staleTime: 30_000,
    queryFn: async (): Promise<VenueReviewCandidate[]> => {
      const { data, error } = await untypedRpc<VenueReviewCandidate[]>('venue_review_candidates', {
        p_kind: kind,
        p_limit: limit,
        p_offset: 0,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Both decision paths invalidate the same keys, so the row leaves the list and
 *  the counts move together — a decided row that lingers reads as a failed save. */
function useDecisionInvalidation() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['venue-review-candidates'] });
    void qc.invalidateQueries({ queryKey: ['venue-review-counts'] });
    void qc.invalidateQueries({ queryKey: ['category-coverage'] });
  };
}

export function useDecideVenueCategory() {
  const invalidate = useDecisionInvalidation();
  return useMutation({
    mutationFn: async (v: {
      venueId: string;
      accept: boolean;
      /** Set to override the engine's suggestion with the reviewer's own call. */
      category?: string | null;
      note?: string | null;
    }) => {
      const { data, error } = await untypedRpc('decide_venue_category', {
        p_venue_id: v.venueId,
        p_accept: v.accept,
        p_category: v.category ?? null,
        p_note: v.note ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDecideVenueNonvenue() {
  const invalidate = useDecisionInvalidation();
  return useMutation({
    mutationFn: async (v: { venueId: string; confirm: boolean; note?: string | null }) => {
      const { data, error } = await untypedRpc('decide_venue_nonvenue', {
        p_venue_id: v.venueId,
        p_confirm: v.confirm,
        p_note: v.note ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}
