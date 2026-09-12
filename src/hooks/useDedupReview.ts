import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';

/**
 * NOTE — `useDedupReviewQueue` was deleted here (2026-09-12).
 *
 * It implemented the whole dedup review surface — list, approve, reject, the
 * canonical flip via `approve_dedup_review(p_keep_id)`, and `batchApproveSafe`
 * over `approve_dedup_review_batch` — and had ZERO consumers, while the inbox
 * drove the generic `triage_action` path instead. Two implementations of one
 * decision, one of them unreachable, is how the flip stayed unavailable to
 * reviewers for as long as the queue has existed.
 *
 * The inbox is now the single path: `TriageDetailPanel` renders the pair side by
 * side and passes `{ keep_id }` through `triage_action`.
 *
 * STILL UNEXPOSED, deliberately and recorded rather than quietly dropped:
 * `approve_dedup_review_batch(p_min_confidence, p_limit)` exists in the database,
 * already excludes personalities in its own WHERE, and has no caller. The inbox's
 * bulk path loops `triage_action` one row at a time and its "Approve >=90%" button
 * is staging-only. Wiring it is a throughput win and its own change.
 */

/** Open-suggestion count for one entity type — feeds the quality panels' dedup link. */
export function useDedupPendingCount(entityType: string) {
  return useQuery<number>({
    queryKey: ['dedup-pending-count', entityType],
    queryFn: async () => {
      const { count, error } = await untypedFrom('dedup_review_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open')
        .eq('entity_type', entityType);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
  });
}
