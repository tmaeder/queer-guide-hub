// Hooks for the feedback → Claude routine → retest → archive loop.
// All mutations call SECURITY DEFINER RPCs that re-check admin role server-side.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  FeedbackRetestRun,
  FeedbackRoutineRun,
  FeedbackStoryEvent,
  RetestKind,
} from '@/components/admin/feedback/types';

const RUN_COLS =
  'id,story_id,status,runner,prompt,prompt_hash,external_ref,pr_url,commit_sha,files_changed,fix_summary,confidence,risks,error,created_by,created_at,updated_at,finished_at';

const RETEST_COLS =
  'id,routine_run_id,status,kind,runner,external_ref,result,created_by,created_at,finished_at';

const EVENT_COLS =
  'id,story_id,kind,payload,actor_id,actor_kind,routine_run_id,retest_run_id,created_at';

export function useStoryRoutineRuns(storyId: string | null) {
  return useQuery<FeedbackRoutineRun[]>({
    queryKey: ['feedback-routine-runs', storyId],
    enabled: !!storyId,
    queryFn: async () => {
      if (!storyId) return [];
      const { data, error } = await supabase
        .from('feedback_routine_runs')
        .select(RUN_COLS)
        .eq('story_id', storyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as FeedbackRoutineRun[]) ?? [];
    },
    staleTime: 10_000,
  });
}

/**
 * Batched: latest routine run + latest retest for every story the admin is
 * looking at, so the kanban can render a phase chip per card without N+1
 * queries. Re-run when the kanban data changes.
 */
export function useLatestRunsByStory(storyIds: string[]) {
  const ids = storyIds.slice().sort().join(',');
  return useQuery<{
    runByStory: Record<string, FeedbackRoutineRun>;
    retestByRun: Record<string, FeedbackRetestRun>;
  }>({
    queryKey: ['feedback-latest-runs', ids],
    enabled: storyIds.length > 0,
    staleTime: 15_000,
    queryFn: async () => {
      const { data: runs, error } = await supabase
        .from('feedback_routine_runs')
        .select(RUN_COLS)
        .in('story_id', storyIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const runByStory: Record<string, FeedbackRoutineRun> = {};
      for (const r of (runs as unknown as FeedbackRoutineRun[]) ?? []) {
        if (!runByStory[r.story_id]) runByStory[r.story_id] = r;
      }
      const runIds = Object.values(runByStory).map((r) => r.id);
      const retestByRun: Record<string, FeedbackRetestRun> = {};
      if (runIds.length > 0) {
        const { data: retests, error: rErr } = await supabase
          .from('feedback_retest_runs')
          .select(RETEST_COLS)
          .in('routine_run_id', runIds)
          .order('created_at', { ascending: false });
        if (rErr) throw rErr;
        for (const t of (retests as unknown as FeedbackRetestRun[]) ?? []) {
          if (!retestByRun[t.routine_run_id]) retestByRun[t.routine_run_id] = t;
        }
      }
      return { runByStory, retestByRun };
    },
  });
}

export function useRoutineRetests(routineRunId: string | null) {
  return useQuery<FeedbackRetestRun[]>({
    queryKey: ['feedback-retest-runs', routineRunId],
    enabled: !!routineRunId,
    queryFn: async () => {
      if (!routineRunId) return [];
      const { data, error } = await supabase
        .from('feedback_retest_runs')
        .select(RETEST_COLS)
        .eq('routine_run_id', routineRunId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as FeedbackRetestRun[]) ?? [];
    },
    staleTime: 5_000,
  });
}

export function useStoryEvents(storyId: string | null, limit = 200) {
  return useQuery<FeedbackStoryEvent[]>({
    queryKey: ['feedback-story-events', storyId, limit],
    enabled: !!storyId,
    queryFn: async () => {
      if (!storyId) return [];
      const { data, error } = await supabase
        .from('feedback_story_events')
        .select(EVENT_COLS)
        .eq('story_id', storyId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as unknown as FeedbackStoryEvent[]) ?? [];
    },
    staleTime: 10_000,
  });
}

function invalidateStory(qc: ReturnType<typeof useQueryClient>, storyId: string) {
  qc.invalidateQueries({ queryKey: ['admin-feedback-stories'] });
  qc.invalidateQueries({ queryKey: ['admin-feedback-story', storyId] });
  qc.invalidateQueries({ queryKey: ['feedback-routine-runs', storyId] });
  qc.invalidateQueries({ queryKey: ['feedback-story-events', storyId] });
}

export function useApproveStoryForClaude() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { storyId: string; note?: string }) => {
      const { error } = await supabase.rpc('approve_story_for_claude', {
        p_story_id: args.storyId,
        p_note: args.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, args) => invalidateStory(qc, args.storyId),
  });
}

export function useMarkStoryNeedsFollowup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { storyId: string; reason: string }) => {
      const { error } = await supabase.rpc('mark_story_needs_followup', {
        p_story_id: args.storyId,
        p_reason: args.reason,
      });
      if (error) throw error;
    },
    onSuccess: (_d, args) => invalidateStory(qc, args.storyId),
  });
}

export function useDispatchClaudeRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      storyId: string;
      runner?: 'mock' | 'github_actions' | 'webhook' | 'api';
      runner?: 'mock' | 'github_actions' | 'webhook' | 'api' | 'local';
      /** When set, the admin's edited prompt overrides the server-built one. */
      promptOverride?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('claude-routine-dispatch', {
        body: {
          story_id: args.storyId,
          runner: args.runner,
          prompt_override: args.promptOverride,
        },
      });
      if (error) throw error;
      return data as { run_id: string; runner: string; external_ref?: string; sync?: boolean };
    },
    onSuccess: (_d, args) => invalidateStory(qc, args.storyId),
  });
}

export function useCancelRoutineRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { runId: string; storyId: string; reason?: string }) => {
      const { error } = await supabase.rpc('cancel_routine_run', {
        p_run_id: args.runId,
        p_reason: args.reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, args) => invalidateStory(qc, args.storyId),
  });
}

export function useStartRetest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      runId: string;
      storyId: string;
      kind: RetestKind;
      runner?: 'mock' | 'github_actions' | 'webhook' | 'local';
    }) => {
      const { data: retest, error } = await supabase.rpc('start_retest', {
        p_run_id: args.runId,
        p_kind: args.kind,
        p_runner: args.runner ?? 'mock',
      });
      if (error) throw error;
      const reserved = (Array.isArray(retest) ? retest[0] : retest) as FeedbackRetestRun | null;
      if (!reserved) throw new Error('start_retest returned no row');

      const { error: fnErr } = await supabase.functions.invoke('feedback-retest-dispatch', {
        body: { retest_id: reserved.id },
      });
      if (fnErr) throw fnErr;
      return reserved;
    },
    onSuccess: (_d, args) => {
      invalidateStory(qc, args.storyId);
      qc.invalidateQueries({ queryKey: ['feedback-retest-runs', args.runId] });
    },
  });
}

export function useVerifyStory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      storyId: string;
      outcome: 'resolved' | 'reopen' | 'needs_followup';
      note?: string;
    }) => {
      const { error } = await supabase.rpc('verify_story', {
        p_story_id: args.storyId,
        p_outcome: args.outcome,
        p_note: args.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, args) => invalidateStory(qc, args.storyId),
  });
}

export function useArchiveStory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { storyId: string; reason?: string }) => {
      const { error } = await supabase.rpc('archive_story', {
        p_story_id: args.storyId,
        p_reason: args.reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, args) => invalidateStory(qc, args.storyId),
  });
}

export function useUnarchiveStory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { storyId: string }) => {
      const { error } = await supabase.rpc('unarchive_story', { p_story_id: args.storyId });
      if (error) throw error;
    },
    onSuccess: (_d, args) => invalidateStory(qc, args.storyId),
  });
}
