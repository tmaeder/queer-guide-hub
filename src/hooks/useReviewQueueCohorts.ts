import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';

/**
 * One campaign of quality-review work: every open proposal for the same
 * (entity_type, field).
 *
 * The inbox showed 3,997 rows behind a single "Quality" chip, which hid that
 * the queue is really a dozen unrelated jobs of very different tractability —
 * 1,735 adult-profile identity riddles averaging 0.60 confidence next to 749
 * venue accessibility proposals averaging 0.88. A reviewer picking work needs
 * to see the campaigns, not a flat list sorted across all of them.
 */
export interface ReviewQueueCohort {
  entity_type: string;
  field: string;
  queue_key: string;
  /** Open rows in this cohort. */
  n: number;
  /**
   * Rows a reviewer can actually finish right now: the field has an active
   * registry row, and approving does not require the outing-safety confirm.
   * Deliberately separate from `n` — a cohort of 692 where 346 need a
   * confirmation is not the same work as one where none do.
   */
  decidable: number;
  /** Rows whose approval raises 42501 unless the confirm flag is sent. */
  risk_gated: number;
  /** Whether `approve_entity_review_batch` will act on this field at all. */
  batchable: boolean;
  avg_confidence: number | null;
  oldest_at: string | null;
}

/**
 * Admin/moderator only. The RPC is role-gated in its own WHERE clause, so a
 * caller without the role gets an empty array rather than an error — same
 * answer RLS would give.
 */
export function useReviewQueueCohorts(enabled = true) {
  return useQuery({
    queryKey: ['review-queue-cohorts'],
    enabled,
    queryFn: async (): Promise<ReviewQueueCohort[]> => {
      const { data, error } = await untypedRpc<ReviewQueueCohort[]>('review_queue_cohorts', {});
      if (error) throw error;
      return (data ?? []) as ReviewQueueCohort[];
    },
    staleTime: 60_000,
  });
}
