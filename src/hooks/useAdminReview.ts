import { useAuth } from '@/hooks/useAuth';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { untypedFrom, untypedRpc, untypedSupabase } from '@/integrations/supabase/untyped';
import type { TriageItem } from '@/hooks/useUnifiedTriageQueue';
import { callSearchIntelligence, createTagFromProposal } from '@/hooks/useSearchIntelligence';
import { isVenueMatchReview } from '@/components/admin/review-workspace/reviewContracts';
import { parseTagProposal } from '@/components/admin/search-intelligence/tagProposal';

export interface ReviewItem extends TriageItem {
  source_label: string;
  risk: 'routine' | 'integrity' | 'safety';
  overdue: boolean;
  sla_hours?: number | null;
  public_impact: boolean;
  can_reopen: boolean;
}
export interface ReviewSource {
  key: string;
  label: string;
  count: number;
  overdue: number;
  risk: ReviewItem['risk'];
  can_reopen: boolean;
  can_bulk?: boolean;
}
export interface ReviewPage {
  items: ReviewItem[];
  total: number;
  all_total: number;
  /**
   * Rows where a human decision exists. `all_total` also counts machine detector output
   * ("this field is empty"), which is 84% of the queue and has no decision to make -- see
   * admin_review_finding_codes. Label a figure "decisions" only if it came from here.
   */
  decisions_total: number;
  findings_total: number;
  overdue_total: number;
  safety_total: number;
  sources: ReviewSource[];
  page: number;
  per_page: number;
  updated_at: string;
  ready_total?: number;
  research_total?: number;
  blocked_total?: number;
  case_total?: number;
  grouped_rows?: number;
  worklist_available?: boolean;
  worklist_as_of?: string | null;
  research_enabled?: boolean;
}
export interface ReviewFilters {
  queues: string[] | null;
  search: string;
  scope: 'ready' | 'research' | 'blocked' | 'all' | 'decisions' | 'safety' | 'overdue' | 'public';
  sort: 'priority' | 'age' | 'confidence';
  page: number;
}
export function useAdminReview(filters: ReviewFilters) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['admin-review', user?.id, filters],
    enabled: !!user?.id,
    queryFn: async ({ signal }): Promise<ReviewPage> => {
      const { data: rawData, error } = await untypedSupabase
        .rpc(
          ['ready', 'research', 'blocked'].includes(filters.scope)
            ? 'get_admin_review_worklist'
            : 'get_admin_review_queue',
          {
            p_queue_types: filters.queues,
            p_search: filters.search || null,
            p_scope: filters.scope,
            p_sort: filters.sort,
            p_page: filters.page,
            p_per_page: 50,
          },
        )
        .abortSignal(signal);
      const data = rawData as ReviewPage | null;
      if (error) throw new Error(error.message);
      if (!data) throw new Error('The review queue returned no data. Please retry.');
      qc.setQueryData<ReviewSummary>(['admin-review-summary', user?.id], (old) =>
        old && Date.parse(old.updated_at) > Date.parse(data.updated_at)
          ? old
          : {
              all_total: data.all_total,
              decisions_total: data.decisions_total,
              findings_total: data.findings_total,
              overdue_total: data.overdue_total,
              safety_total: data.safety_total,
              sources: data.sources,
              updated_at: data.updated_at,
              ready_total: data.ready_total ?? old?.ready_total,
              research_total: data.research_total ?? old?.research_total,
              blocked_total: data.blocked_total ?? old?.blocked_total,
              case_total: data.case_total ?? old?.case_total,
              grouped_rows: data.grouped_rows ?? old?.grouped_rows,
              worklist_available: data.worklist_available ?? old?.worklist_available,
              worklist_as_of: data.worklist_as_of ?? old?.worklist_as_of,
              research_enabled: data.research_enabled ?? old?.research_enabled,
            },
      );
      return data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const summary = useQuery<ReviewSummary>({
    queryKey: ['admin-review-summary', user?.id],
    queryFn: fetchReviewSummary,
    enabled: false,
    staleTime: Infinity,
  });
  return { ...query, summary: summary.data ?? query.data };
}
export interface ReviewDecision {
  item: ReviewItem;
  action: 'approve' | 'reject' | 'reopen';
  notes?: string;
  confirm?: boolean;
  payload?: Record<string, unknown>;
}
export async function decideReview({ item, action, notes, confirm, payload }: ReviewDecision) {
  const caseInfo = item.meta?.review_case as { id?: string; fingerprint?: string } | undefined;
  if (caseInfo?.id && !['ai-suggestions', 'tag-enrichment'].includes(item.queue_type)) {
    const { data, error } = await untypedRpc<{ ok?: boolean; error?: string }>(
      'decide_admin_review_case',
      {
        p_case_id: caseInfo.id,
        p_fingerprint: caseInfo.fingerprint,
        p_action: action,
        p_notes: notes || null,
        p_confirm: confirm ?? false,
        p_payload: payload ?? {},
      },
    );
    if (error) throw new Error(error.message);
    if (!data?.ok || data.error) throw new Error(data?.error || 'The case decision was not saved.');
    return;
  }
  if (['ai-suggestions', 'tag-enrichment'].includes(item.queue_type)) {
    if (action === 'reopen') throw new Error('This decision cannot be undone.');
    const proposal = parseTagProposal({
      suggestion_type: String(item.meta.suggestion_type ?? ''),
      entity_id: item.entity_id,
      proposed_value: item.meta.proposed_value,
    });
    let createdId: string | undefined;
    if (action === 'approve' && proposal) {
      const created = await createTagFromProposal(proposal.name);
      if (!created.success) throw new Error(created.error);
      createdId = created.data.id;
    }
    const result = await callSearchIntelligence<{ status: string; review_notes?: string }>(
      `suggestions/${item.id}`,
      {
        method: 'PATCH',
        body: {
          status: action === 'reject' ? 'rejected' : createdId ? 'applied' : 'approved',
          review_notes: notes || (createdId ? `Created tag ${createdId}` : undefined),
        },
      },
    );
    if (!result.success) throw new Error(result.error);
    if (action === 'approve' && result.data.status !== 'applied') {
      throw new Error(
        result.data.review_notes ||
          'Approved, but the change was not applied. The item remains available for retry.',
      );
    }
    if (caseInfo?.id) {
      // The source service has already confirmed the application. A cache
      // reconciliation failure must not report that durable write as failed;
      // the scheduled reconciler retries it independently.
      await untypedRpc('reconcile_admin_review_cases', {
        p_queue_type: item.queue_type,
        p_item_ids: [item.id],
      }).catch(() => undefined);
    }
    return;
  }
  const venueMatch = action === 'approve' && isVenueMatchReview(item);
  if (venueMatch && (!payload?.venue_id || !payload?.expected_updated_at))
    throw new Error('Compare and select a current catalogue venue before linking.');
  const { data, error } = await untypedRpc<{ ok?: boolean; error?: string }>(
    venueMatch ? 'admin_review_link_event_venue' : 'admin_review_action',
    {
      p_queue_type: item.queue_type,
      p_item_id: item.id,
      ...(venueMatch
        ? {
            p_venue_id: payload!.venue_id,
            p_expected_updated_at: payload!.expected_updated_at,
          }
        : { p_action: action, p_confirm: confirm ?? false, p_payload: payload ?? {} }),
      p_notes: notes || null,
    },
  );
  if (error) throw new Error(error.message);
  if (!data?.ok || data.error)
    throw new Error(data?.error || 'The decision was not saved. Please retry.');
  if (action !== 'reopen')
    await untypedRpc('reconcile_admin_review_cases', {
      p_queue_type: item.queue_type,
      p_item_ids: [item.id],
    }).catch(() => undefined);
}
export function useReviewDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: decideReview,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['admin-review'] });
      void qc.invalidateQueries({ queryKey: ['admin-review-item'] });
      void qc.invalidateQueries({ queryKey: ['review-context'] });
      void qc.invalidateQueries({ queryKey: ['venue-match-review'] });
      void qc.invalidateQueries({ queryKey: ['review-case-details'] });
      void qc.invalidateQueries({ queryKey: ['admin-review-summary'] });
      void qc.invalidateQueries({ queryKey: ['admin-counts'] });
      void qc.invalidateQueries({ queryKey: ['triage-queue'] });
      void qc.invalidateQueries({ queryKey: ['admin-feedback-board'] });
    },
  });
}

export type ReviewLookupType =
  'organizations' | 'cities' | 'countries' | 'unified_tags' | 'tag_categories';
export function useReviewLookup(table: ReviewLookupType, search: string, enabled: boolean) {
  return useQuery({
    queryKey: ['review-lookup', table, search],
    enabled: enabled && search.trim().length >= 2,
    queryFn: async (): Promise<Array<{ id: string; name: string }>> => {
      const { data, error } = await untypedFrom(table)
        .select('id,name')
        .ilike('name', `%${search.trim().replace(/[%_]/g, '')}%`)
        .order('name')
        .limit(20);
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
    staleTime: 60_000,
  });
}

export function useReviewBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { ids: string[]; action: 'approve' | 'reject'; notes: string }) => {
      const { data, error } = await untypedRpc<{ ok: boolean; count: number }>(
        'admin_review_bulk',
        {
          p_queue_type: 'staging',
          p_item_ids: args.ids,
          p_action: args.action,
          p_notes: args.notes || null,
        },
      );
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error('The bulk decision was not saved. Please retry.');
      await untypedRpc('reconcile_admin_review_cases', {
        p_queue_type: 'staging',
        p_item_ids: args.ids,
      }).catch(() => undefined);
      return data;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['admin-review'] });
      void qc.invalidateQueries({ queryKey: ['admin-review-item'] });
      void qc.invalidateQueries({ queryKey: ['review-context'] });
      void qc.invalidateQueries({ queryKey: ['venue-match-review'] });
      void qc.invalidateQueries({ queryKey: ['admin-review-summary'] });
      void qc.invalidateQueries({ queryKey: ['admin-counts'] });
      void qc.invalidateQueries({ queryKey: ['triage-queue'] });
    },
  });
}

type ReviewSummary = Pick<
  ReviewPage,
  | 'all_total'
  | 'decisions_total'
  | 'findings_total'
  | 'overdue_total'
  | 'safety_total'
  | 'sources'
  | 'updated_at'
  | 'ready_total'
  | 'research_total'
  | 'blocked_total'
  | 'case_total'
  | 'grouped_rows'
  | 'worklist_available'
  | 'worklist_as_of'
  | 'research_enabled'
>;
// Shared landing scope for the review workspace. Sidebar counts use a separate summary RPC.
export const DEFAULT_REVIEW_SCOPE: ReviewFilters['scope'] = 'ready';

async function fetchReviewSummary({
  signal,
  queryKey,
  client,
}: {
  signal: AbortSignal;
  queryKey: readonly unknown[];
  client: QueryClient;
}): Promise<ReviewSummary> {
  const { data, error } = await untypedSupabase
    .rpc('get_admin_review_work_summary')
    .abortSignal(signal);
  if (error) throw new Error(error.message);
  if (!data) throw new Error('The review summary returned no data.');
  const incoming = data as ReviewSummary;
  const cached = client.getQueryData<ReviewSummary>(queryKey);
  return cached && Date.parse(cached.updated_at) > Date.parse(incoming.updated_at)
    ? cached
    : incoming;
}
export function useAdminReviewSummary(enabled = true) {
  const { user } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled)
      void qc.cancelQueries({ queryKey: ['admin-review-summary', user?.id], exact: true });
  }, [enabled, user?.id, qc]);
  return useQuery<ReviewSummary>({
    queryKey: ['admin-review-summary', user?.id],
    enabled: enabled && !!user?.id,
    queryFn: fetchReviewSummary,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useSelectedReviewItem(
  selected: string | null,
  queue: string | null,
  enabled: boolean,
) {
  const { user } = useAuth();
  const split = selected?.indexOf(':') ?? -1;
  const source = split > 0 ? selected!.slice(0, split) : queue;
  const id = split > 0 ? selected!.slice(split + 1) : selected;
  const valid = !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  return useQuery({
    queryKey: ['admin-review-item', user?.id, source, id],
    enabled: enabled && !!user?.id && !!source && valid,
    queryFn: async (): Promise<ReviewItem | null> => {
      if (source === 'review-case') {
        const { data, error } = await untypedRpc<{ item: ReviewItem }>(
          'get_admin_review_case_details',
          { p_case_id: id },
        );
        if (error) throw new Error(error.message);
        return data?.item ?? null;
      }
      const { data, error } = await untypedRpc<ReviewItem>('get_admin_review_item', {
        p_queue_type: source,
        p_item_id: id,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 30_000,
  });
}
