import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';

/**
 * What the nightly jobs will clear, and what is left for a person.
 *
 * /admin/inbox told the operator "Everything that needs you, across queues"
 * over a number that was mostly not that. Measured on prod: of 1,319 staging
 * rows at pending_review, 575 had already been dispositioned by the pipeline
 * (428 committed and published, 147 rejected) and only the status column
 * lagged; of 3,997 open review rows, 1,409 sit at or above the auto-approval
 * threshold. One number that only grows reads as "nothing here ever moves",
 * which is exactly how a working pipeline comes to look stuck.
 */
export interface ReviewAutomationStatus {
  review_queue: {
    open: number;
    /** Applied by run_review_queue_autoapprove on its next pass. */
    auto_applies: number;
    /** Rejected unread: the entity is unreachable, or the note names the wrong country. */
    auto_closes: number;
    /** Below the threshold — genuinely a person's call. */
    needs_human: number;
  };
  staging: {
    pending: number;
    /** Already committed or already rejected; only review_status lagged. */
    auto_reconciles: number;
    needs_human: number;
  };
  dedup: { open: number };
  /**
   * Enabled/schedule per job slug. Present so the card can say a job is OFF
   * rather than quietly promising a drain that will never run — the
   * auto-pause-erases-its-own-evidence failure, where a disabled job is
   * indistinguishable from a deliberate retirement.
   */
  jobs: Record<string, { enabled: boolean; schedule: string | null }>;
  generated_at: string;
}

/**
 * Admin/moderator only, aggregates only. The RPC gates on the role inside its
 * own body and returns `{}` to anyone else rather than raising, so an
 * unauthorised caller gets the same answer RLS would give. An empty object is
 * therefore "not allowed to look", NOT "nothing to do" — callers must treat a
 * missing payload as unknown and say so, never render it as a clean queue.
 */
export function useReviewAutomationStatus(enabled = true) {
  return useQuery({
    queryKey: ['review-automation-status'],
    enabled,
    queryFn: async (): Promise<ReviewAutomationStatus | null> => {
      const { data, error } = await untypedRpc<ReviewAutomationStatus>(
        'review_automation_status',
        {},
      );
      if (error) throw error;
      if (!data || !(data as ReviewAutomationStatus).review_queue) return null;
      return data as ReviewAutomationStatus;
    },
    staleTime: 60_000,
  });
}
