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

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function useDispatchClaudeRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      storyId: string;
      prompt: string;
      runner?: 'mock' | 'github_actions' | 'webhook' | 'api';
    }) => {
      const promptHash = await sha256Hex(args.prompt);
      const runner = args.runner ?? 'mock';

      // 1. Reserve the run row via RPC (rate limit + dedup + permission check).
      const { data: run, error: rpcErr } = await supabase.rpc('dispatch_claude_routine', {
        p_story_id: args.storyId,
        p_runner: runner,
        p_prompt: args.prompt,
        p_prompt_hash: promptHash,
      });
      if (rpcErr) throw rpcErr;
      const reserved = (Array.isArray(run) ? run[0] : run) as FeedbackRoutineRun | null;
      if (!reserved) throw new Error('dispatch_claude_routine returned no row');

      // 2. If the run is already past 'queued' (idempotent re-dispatch), skip
      // calling the edge function.
      if (reserved.status !== 'queued') return reserved;

      const { data: dispatched, error: fnErr } = await supabase.functions.invoke(
        'claude-routine-dispatch',
        { body: { run_id: reserved.id, runner } },
      );
      if (fnErr) throw fnErr;
      return { ...reserved, ...(dispatched ?? {}) } as FeedbackRoutineRun;
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
      runner?: 'mock' | 'github_actions' | 'webhook';
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
