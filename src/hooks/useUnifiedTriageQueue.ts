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

export type TriageActionType = 'approve' | 'reject' | 'skip' | 'flag' | 'reopen';

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
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['triage-queue'] });
      qc.invalidateQueries({ queryKey: ['review-counts'] });
    },
  });
}
