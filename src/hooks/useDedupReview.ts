import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';

export interface DedupReviewMember {
  id: string;
  title: string;
}

export interface DedupReviewRow {
  id: string;
  entity_type: string;
  keep_id: string;
  drop_id: string;
  cluster: {
    keep?: DedupReviewMember;
    drop?: DedupReviewMember;
    distance_m?: number | null;
    match_type?: string;
    auto_eligible?: boolean;
  } | null;
  confidence: number | null;
  reason: string;
  created_at: string;
  citations?: null;
}

/**
 * Open suggestions in the Dedup Truth Engine review gate (dedup_review_queue,
 * written by the nightly run_dedup_truth_sweep), plus approve/reject/batch.
 * Approving executes the reversible merge cores server-side.
 */
export function useDedupReviewQueue(entityType?: string) {
  const queryClient = useQueryClient();

  const query = useQuery<DedupReviewRow[]>({
    queryKey: ['dedup-review-queue', entityType ?? 'all'],
    queryFn: async () => {
      let q = untypedFrom('dedup_review_queue')
        .select('id, entity_type, keep_id, drop_id, cluster, confidence, reason, created_at')
        .eq('status', 'open')
        .order('confidence', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(100);
      if (entityType) q = q.eq('entity_type', entityType);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as DedupReviewRow[];
    },
    staleTime: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['dedup-review-queue'] });
    queryClient.invalidateQueries({ queryKey: ['admin-counts'] });
    queryClient.invalidateQueries({ queryKey: ['dup-clusters'] });
    queryClient.invalidateQueries({ queryKey: ['fuzzy-dup-clusters'] });
  };

  const decide = useMutation({
    mutationFn: async ({
      id,
      action,
      keepId,
      note,
    }: {
      id: string;
      action: 'approve' | 'reject';
      /** Optional canonical flip — must be one of the pair's ids. */
      keepId?: string;
      note?: string;
    }) => {
      const { error } =
        action === 'approve'
          ? await untypedRpc('approve_dedup_review', { p_id: id, p_keep_id: keepId ?? null })
          : await untypedRpc('reject_dedup_review', { p_id: id, p_note: note ?? null });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  // Bulk-approve provably-safe suggestions (high confidence; the RPC itself
  // excludes personalities — namesake merges stay individually confirmed).
  const batchApproveSafe = useMutation({
    mutationFn: async (minConf = 0.95) => {
      const { data, error } = await untypedRpc<{ approved?: number }>(
        'approve_dedup_review_batch',
        { p_min_confidence: minConf, p_limit: 100 },
      );
      if (error) throw error;
      return data?.approved ?? 0;
    },
    onSuccess: invalidate,
  });

  return { ...query, decide, batchApproveSafe };
}

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
