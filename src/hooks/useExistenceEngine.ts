import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ExistenceEntityType = 'venue' | 'event' | 'marketplace';

export interface ExistenceOverview {
  [k: string]: { flagged: number; auto_archived_7d: number; open_archives: number; dead_signal_entities: number };
}

export interface ExistenceAuditRow {
  audit_id: number;
  entity_type: ExistenceEntityType;
  entity_id: string;
  label: string | null;
  slug: string | null;
  reason: string;
  signals: Record<string, unknown> | null;
  created_at: string;
}

export interface BlindSpotRow {
  entity_type: ExistenceEntityType;
  entity_id: string;
  label: string | null;
  slug: string | null;
}

/** Existence Truth Engine admin surface: overview, review queue, recent archives, blind spots + actions. */
export function useExistenceEngine() {
  const qc = useQueryClient();

  const overview = useQuery<ExistenceOverview>({
    queryKey: ['existence-overview'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('existence_overview');
      if (error) throw error;
      return (data ?? {}) as ExistenceOverview;
    },
    staleTime: 30_000,
  });

  const reviewQueue = useQuery<ExistenceAuditRow[]>({
    queryKey: ['existence-review-queue'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('existence_review_queue', { p_entity_type: null, p_limit: 100 });
      if (error) throw error;
      return (data ?? []) as ExistenceAuditRow[];
    },
    staleTime: 30_000,
  });

  const recentArchives = useQuery<ExistenceAuditRow[]>({
    queryKey: ['existence-recent-archives'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('existence_recent_archives', { p_entity_type: null, p_limit: 100 });
      if (error) throw error;
      return (data ?? []) as ExistenceAuditRow[];
    },
    staleTime: 30_000,
  });

  const blindSpots = useQuery<BlindSpotRow[]>({
    queryKey: ['existence-blind-spots'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('existence_blind_spots', { p_entity_type: null, p_limit: 50 });
      if (error) throw error;
      return (data ?? []) as BlindSpotRow[];
    },
    staleTime: 60_000,
  });

  const invalidate = () => {
    ['existence-overview', 'existence-review-queue', 'existence-recent-archives'].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
  };

  const approve = useMutation({
    mutationFn: async (auditId: number) => {
      const { error } = await supabase.rpc('existence_approve_archive', { p_audit_id: auditId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: async (auditId: number) => {
      const { error } = await supabase.rpc('existence_reject_archive', { p_audit_id: auditId, p_reason: 'admin_says_alive' });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const reopen = useMutation({
    mutationFn: async ({ entityType, entityId }: { entityType: ExistenceEntityType; entityId: string }) => {
      const { error } = await supabase.rpc('existence_reopen', { p_entity_type: entityType, p_entity_id: entityId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const batchApproveSafe = useMutation({
    mutationFn: async (entityType: ExistenceEntityType) => {
      const { data, error } = await supabase.rpc('batch_approve_safe_existence', {
        p_entity_type: entityType, p_limit: 100, p_dry_run: false,
      });
      if (error) throw error;
      return (data as { approved?: number })?.approved ?? 0;
    },
    onSuccess: invalidate,
  });

  return { overview, reviewQueue, recentArchives, blindSpots, approve, reject, reopen, batchApproveSafe };
}
