/**
 * Private workbook answers, progress, and the two-party reveal.
 *
 * `tag_workbook_answers` is read and written DIRECTLY under self-only RLS —
 * four policies copied from `kink_ratings`, so a query for someone else's rows
 * returns nothing rather than failing. There is no `anon` grant on the table at
 * all, so a signed-out caller cannot reach it even by privilege.
 *
 * The reveal is the opposite shape: `workbook_compare` is SECURITY DEFINER and
 * returns an EMPTY SET when the handshake is incomplete, never an exception. So
 * an empty result here means "no consent, or no shared overlap" and the UI must
 * not claim to know which — that ambiguity is deliberate and is what keeps a
 * partner's refusal private.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';

export interface WorkbookAnswer {
  step_id: string;
  body: string;
  shared: boolean;
}

export interface WorkbookProgress {
  workbook_id: string;
  started_at: string;
  completed_at: string | null;
  last_step_id: string | null;
}

export type WorkbookCompareStatus = 'none' | 'requested_by_me' | 'requested_by_other' | 'active';

export interface WorkbookCompareRow {
  step_key: string;
  step_kind: string;
  step_position: number;
  heading: string | null;
  prompt_md: string | null;
  /** Set for a menu step; its overlap is a kink-list compare, gated separately. */
  kink_category_slug: string | null;
  my_body: string | null;
  their_body: string | null;
}

/** My answers for one workbook, keyed by step_id. */
export function useMyWorkbookAnswers(stepIds: string[]) {
  const { user } = useAuth();
  // Stable key so a reorder of the same steps does not refetch.
  const key = [...stepIds].sort().join(',');
  return useQuery({
    queryKey: ['workbook-answers', user?.id, key],
    enabled: !!user && stepIds.length > 0,
    queryFn: async (): Promise<Map<string, WorkbookAnswer>> => {
      if (!user || stepIds.length === 0) return new Map();
      const { data, error } = await untypedFrom('tag_workbook_answers')
        .select('step_id, body, shared')
        .eq('user_id', user.id)
        .in('step_id', stepIds);
      if (error) throw error;
      const map = new Map<string, WorkbookAnswer>();
      for (const row of (data ?? []) as unknown as WorkbookAnswer[]) {
        map.set(row.step_id, row);
      }
      return map;
    },
  });
}

/**
 * Save one answer. The caller debounces; this is the write.
 *
 * An empty body DELETES rather than storing a blank: `body` carries a
 * `char_length between 1 and 4000` CHECK, so an empty string would be a 23514
 * rather than a cleared answer.
 */
export function useSaveWorkbookAnswer() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { step_id: string; body: string; shared?: boolean }) => {
      if (!user) throw new Error('not signed in');
      const body = args.body.trim();
      if (!body) {
        const { error } = await untypedFrom('tag_workbook_answers')
          .delete()
          .eq('user_id', user.id)
          .eq('step_id', args.step_id);
        if (error) throw error;
        return;
      }
      const { error } = await untypedFrom('tag_workbook_answers').upsert(
        {
          user_id: user.id,
          step_id: args.step_id,
          body,
          ...(args.shared === undefined ? {} : { shared: args.shared }),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,step_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workbook-answers'] });
      // A share toggle changes what the partner can see.
      qc.invalidateQueries({ queryKey: ['workbook-compare'] });
    },
  });
}

/** Flip one answer's share flag without touching its text. */
export function useSetAnswerShared() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { step_id: string; shared: boolean }) => {
      if (!user) throw new Error('not signed in');
      const { error } = await untypedFrom('tag_workbook_answers')
        .update({ shared: args.shared, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('step_id', args.step_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workbook-answers'] });
      qc.invalidateQueries({ queryKey: ['workbook-compare'] });
    },
  });
}

/** My progress row for one workbook. `started_at` paces a program. */
export function useWorkbookProgress(workbookId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['workbook-progress', user?.id, workbookId],
    enabled: !!user && !!workbookId,
    queryFn: async (): Promise<WorkbookProgress | null> => {
      if (!user || !workbookId) return null;
      const { data, error } = await untypedFrom('tag_workbook_progress')
        .select('workbook_id, started_at, completed_at, last_step_id')
        .eq('user_id', user.id)
        .eq('workbook_id', workbookId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as WorkbookProgress | null) ?? null;
    },
  });
}

/**
 * Start or advance a workbook.
 *
 * `started_at` is written ONLY on insert — a program's day pacing is derived
 * from it, so re-stamping it on every step would reset the clock and re-lock
 * the days the reader has already unlocked.
 */
export function useUpsertWorkbookProgress() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      workbook_id: string;
      last_step_id?: string | null;
      completed?: boolean;
    }) => {
      if (!user) throw new Error('not signed in');
      const { error } = await untypedFrom('tag_workbook_progress').upsert(
        {
          user_id: user.id,
          workbook_id: args.workbook_id,
          last_step_id: args.last_step_id ?? null,
          ...(args.completed ? { completed_at: new Date().toISOString() } : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,workbook_id', ignoreDuplicates: false },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workbook-progress'] });
    },
  });
}

/**
 * The handshake state with one partner.
 *
 * Short gc and no staleness window, matching `useKinkCompare`: a revoke must
 * clear a stale "active" promptly rather than sit in a cache.
 */
export function useWorkbookCompareStatus(otherUserId: string | null) {
  return useQuery({
    queryKey: ['workbook-compare-status', otherUserId],
    enabled: !!otherUserId,
    gcTime: 60 * 1000,
    staleTime: 0,
    queryFn: async (): Promise<WorkbookCompareStatus> => {
      if (!otherUserId) return 'none';
      const { data, error } = await untypedRpc<WorkbookCompareStatus>('workbook_compare_status', {
        p_other: otherUserId,
      });
      if (error) throw new Error(error.message);
      return (data as WorkbookCompareStatus) ?? 'none';
    },
  });
}

/**
 * The reveal. An empty array means no consent OR no shared overlap — the RPC
 * returns rather than raising precisely so these are indistinguishable, and
 * the UI must describe the state from `useWorkbookCompareStatus` instead of
 * inferring it from a row count.
 */
export function useWorkbookCompare(workbookId: string | undefined, otherUserId: string | null) {
  return useQuery({
    queryKey: ['workbook-compare', workbookId, otherUserId],
    enabled: !!workbookId && !!otherUserId,
    gcTime: 60 * 1000,
    staleTime: 0,
    queryFn: async (): Promise<WorkbookCompareRow[]> => {
      if (!workbookId || !otherUserId) return [];
      const { data, error } = await untypedRpc<WorkbookCompareRow[]>('workbook_compare', {
        p_workbook_id: workbookId,
        p_other: otherUserId,
      });
      if (error) throw new Error(error.message);
      return Array.isArray(data) ? data : [];
    },
  });
}

/**
 * Grant or revoke workbook access to one person.
 *
 * Routes through the existing `kink_grant_set`, which the compare migration
 * taught `'workbook'` — so revocation, the unique key, the receipt policy and
 * the realtime notification all come from the kink-grant machinery rather than
 * being rebuilt.
 */
export function useSetWorkbookGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { other: string; active: boolean }) => {
      const { error } = await untypedRpc('kink_grant_set', {
        p_other: args.other,
        p_kind: 'workbook',
        p_active: args.active,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workbook-compare-status'] });
      qc.invalidateQueries({ queryKey: ['workbook-compare'] });
      qc.invalidateQueries({ queryKey: ['kink-grants'] });
    },
  });
}
