import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';

export interface TriageItem {
  id: string;
  queue_type: string;
  content_type: string;
  title: string;
  subtitle: string;
  status: string;
  confidence_score: number | null;
  created_at: string;
  source: string;
  entity_id: string | null;
  entity_table: string | null;
  has_diff: boolean;
  reporter_id: string | null;
  meta: Record<string, unknown>;
  /** Per-item safety gating from the queue view, e.g. {requires_confirm, risk_tier}. */
  risk_flags?: Record<string, unknown>;
}

export interface TriageFilters {
  queueTypes: string[] | null;
  contentTypes: string[] | null;
  search: string;
  sort: 'priority' | 'age' | 'confidence';
  page: number;
  perPage: number;
}

interface TriageResult {
  items: TriageItem[];
  total: number;
  page: number;
  per_page: number;
}

export function useUnifiedTriageQueue(filters: TriageFilters) {
  return useQuery({
    queryKey: ['triage-queue', filters],
    queryFn: async (): Promise<TriageResult> => {
      const { data, error } = await untypedRpc<TriageResult>('get_unified_triage_queue', {
        p_queue_types: filters.queueTypes,
        p_content_types: filters.contentTypes,
        p_search: filters.search || null,
        p_sort: filters.sort,
        p_page: filters.page,
        p_per_page: filters.perPage,
      });
      if (error) throw error;
      return data as TriageResult;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * The confidence at or above which this platform decides without a human.
 *
 * ONE constant because it was two hardcoded literals in this file plus three
 * strings in `TriageView.tsx`, and a threshold spelled in five places drifts.
 * It must stay equal to the bar the engines use — `run_review_queue_autoapprove`
 * (cron `2-59/5`), `run_dedup_review_autoapprove` (cron `30 6 * * *`) and
 * `triage_bulk_approve_high_conf`'s own default — all set to 0.80 by
 * 99991791313293. A UI that offers a different bar than the cron applies is
 * two policies wearing one number.
 *
 * Note what the bar does NOT override: `review_field_registry.batchable` still
 * holds the per-field exclusions (`city.lgbt_friendly_rating`,
 * `city.best_time_to_visit`, `venue.accessibility_*` and the adult-link
 * fields), and personality dedup pairs stay out of auto-merge. Those are data,
 * one UPDATE each — see that migration's header.
 */
export const AUTO_DECISION_MIN_CONFIDENCE = 0.8;

/** Server-side count of ALL staging rows eligible for high-confidence bulk
 * approve (at or above the bar, LLM-rejected excluded) — not limited to the
 * current page. Measured when the bar moved to 0.80: staging's highest
 * confidence is 0.500, so this reads 0 and the lowered bar drains nothing
 * there. */
export function useHighConfCount(contentTypes: string[] | null, enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['triage-high-conf-count', contentTypes],
    queryFn: async (): Promise<number> => {
      const { data, error } = await untypedRpc<{ eligible: number }>(
        'triage_bulk_approve_high_conf',
        {
          p_min_confidence: AUTO_DECISION_MIN_CONFIDENCE,
          p_content_types: contentTypes,
          p_user_id: user?.id,
          p_dry_run: true,
        },
      );
      if (error) throw error;
      return (data as { eligible: number })?.eligible ?? 0;
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** One-shot set-based approve of every eligible staging row (see above). */
export function useBulkApproveHighConf() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (params: {
      contentTypes: string[] | null;
    }): Promise<{ approved: number }> => {
      const { data, error } = await untypedRpc<{ approved: number }>(
        'triage_bulk_approve_high_conf',
        {
          p_min_confidence: AUTO_DECISION_MIN_CONFIDENCE,
          p_content_types: params.contentTypes,
          p_user_id: user?.id,
          p_dry_run: false,
        },
      );
      if (error) throw error;
      return (data as { approved: number }) ?? { approved: 0 };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['triage-queue'] });
      qc.invalidateQueries({ queryKey: ['admin-counts'] });
      qc.invalidateQueries({ queryKey: ['triage-high-conf-count'] });
    },
  });
}

export type TriageActionType = 'approve' | 'reject' | 'skip' | 'reopen';

export function useTriageAction() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      itemId: string;
      queueType: string;
      action: TriageActionType;
      notes?: string;
      cannedSlug?: string;
      notify?: boolean;
      /** Explicit high-risk confirmation (items with risk_flags.requires_confirm). */
      confirm?: boolean;
      /** Queue-specific extras (e.g. chosen merge target). */
      payload?: Record<string, unknown>;
    }) => {
      // p_notes / p_canned_slug are passed as `string | null`, but the generated
      // optional args reject null — route through untypedRpc to keep the null args.
      const { data, error } = await untypedRpc('triage_action', {
        p_item_id: params.itemId,
        p_queue_type: params.queueType,
        p_action: params.action,
        p_user_id: user?.id,
        p_notes: params.notes || null,
        p_canned_slug: params.cannedSlug || null,
        p_notify: params.notify ?? true,
        p_confirm: params.confirm ?? false,
        p_payload: params.payload ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['triage-queue'] });
      qc.invalidateQueries({ queryKey: ['admin-counts'] });
    },
  });
}
