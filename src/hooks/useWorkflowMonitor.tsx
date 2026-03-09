/**
 * useWorkflowMonitor — Supabase Realtime hook for workflow orchestration.
 *
 * Replaces polling-based job monitoring with live postgres_changes subscriptions
 * on the `workflow_runs` table.  Also provides actions to enqueue, retry, cancel
 * workflows and fetch metrics from the workflow-dispatcher edge function.
 */

import { useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/integrations/api/client';
import { useToast } from '@/hooks/use-toast';

// ── Types ───────────────────────────────────────────────────────────────────────

export interface WorkflowDefinition {
  id: string;
  name: string;
  edge_function: string;
  queue_name: string;
  default_payload: Record<string, unknown>;
  schedule: string | null;
  max_retries: number;
  retry_backoff_base: number;
  max_concurrency: number;
  timeout_seconds: number;
  is_enabled: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export type WorkflowRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'dead_letter'
  | 'cancelled';

export interface WorkflowRun {
  id: string;
  definition_id: string | null;
  workflow_name: string;
  queue_name: string;
  pgmq_msg_id: number | null;
  status: WorkflowRunStatus;
  attempt: number;
  max_attempts: number;
  input_payload: Record<string, unknown>;
  output_result: Record<string, unknown> | null;
  error_message: string | null;
  error_details: Record<string, unknown> | null;
  progress_pct: number;
  items_total: number;
  items_processed: number;
  items_succeeded: number;
  items_failed: number;
  duration_ms: number | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  next_retry_at: string | null;
  triggered_by: string;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface QueueMetrics {
  queue_name: string;
  queue_length: number;
  newest_msg_age_sec: number | null;
  oldest_msg_age_sec: number | null;
  total_messages: number;
}

export interface WorkflowStats {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  runningRuns: number;
  queuedRuns: number;
  deadLetterRuns: number;
  avgDurationMs: number | null;
}

export interface DispatcherMetrics {
  queues: QueueMetrics[];
  workflow_stats: Array<{
    workflow_name: string;
    total_runs: number;
    completed: number;
    failed: number;
    dead_letter: number;
    avg_duration_ms: number | null;
  }>;
}

// ── Constants ───────────────────────────────────────────────────────────────────

const QUERY_KEYS = {
  definitions: ['workflow-definitions'] as const,
  runs: ['workflow-runs'] as const,
  metrics: ['workflow-metrics'] as const,
  stats: ['workflow-stats'] as const,
};

const STALE_TIME = 30_000; // 30s — Realtime handles freshness

// ── Hook ────────────────────────────────────────────────────────────────────────

export function useWorkflowMonitor() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Realtime subscription ───────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('workflow-runs-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workflow_runs' },
        () => {
          // Invalidate runs + stats on any change
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.runs });
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.stats });
        },
      )
      .subscribe();

    return () => {
      api.removeChannel(channel);
    };
  }, [queryClient]);

  // ── Definitions ─────────────────────────────────────────────────────────────
  const {
    data: definitions = [],
    isLoading: definitionsLoading,
  } = useQuery({
    queryKey: QUERY_KEYS.definitions,
    queryFn: async (): Promise<WorkflowDefinition[]> => {
      const { data, error } = await supabase
        .from('workflow_definitions' as never)
        .select('*')
        .order('priority', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WorkflowDefinition[];
    },
    staleTime: 60_000, // definitions rarely change
  });

  // ── Recent runs (last 24h, limit 200) ───────────────────────────────────────
  const {
    data: runs = [],
    isLoading: runsLoading,
  } = useQuery({
    queryKey: QUERY_KEYS.runs,
    queryFn: async (): Promise<WorkflowRun[]> => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('workflow_runs' as never)
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as WorkflowRun[];
    },
    staleTime: STALE_TIME,
  });

  // ── Computed stats ──────────────────────────────────────────────────────────
  const stats = useMemo<WorkflowStats>(() => {
    const completed = runs.filter((r) => r.status === 'completed');
    const durations = completed
      .map((r) => r.duration_ms)
      .filter((d): d is number => d != null);
    return {
      totalRuns: runs.length,
      completedRuns: completed.length,
      failedRuns: runs.filter((r) => r.status === 'failed').length,
      runningRuns: runs.filter((r) => r.status === 'running').length,
      queuedRuns: runs.filter((r) => r.status === 'queued').length,
      deadLetterRuns: runs.filter((r) => r.status === 'dead_letter').length,
      avgDurationMs:
        durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : null,
    };
  }, [runs]);

  // ── Dispatcher metrics (manual refresh) ─────────────────────────────────────
  const {
    data: metrics,
    isLoading: metricsLoading,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: QUERY_KEYS.metrics,
    queryFn: async (): Promise<DispatcherMetrics> => {
      const { data, error } = await api.functions.invoke(
        'workflow-dispatcher',
        { body: { action: 'metrics' } },
      );
      if (error) throw error;
      return data as DispatcherMetrics;
    },
    staleTime: STALE_TIME,
    enabled: false, // manual only
  });

  // ── Actions ─────────────────────────────────────────────────────────────────

  const enqueueWorkflow = useMutation({
    mutationFn: async ({
      workflow,
      payload,
    }: {
      workflow: string;
      payload?: Record<string, unknown>;
    }) => {
      const { data, error } = await api.functions.invoke(
        'workflow-dispatcher',
        {
          body: {
            action: 'enqueue',
            workflow,
            ...(payload ?? {}),
          },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      toast({
        title: 'Workflow enqueued',
        description: `"${variables.workflow}" has been queued for execution.`,
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.runs });
    },
    onError: (err: Error) => {
      toast({
        title: 'Enqueue failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const retryRun = useMutation({
    mutationFn: async (runId: string) => {
      const { data, error } = await api.functions.invoke(
        'workflow-dispatcher',
        { body: { action: 'retry', run_id: runId } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Run re-queued', description: 'The run has been re-enqueued for retry.' });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.runs });
    },
    onError: (err: Error) => {
      toast({ title: 'Retry failed', description: err.message, variant: 'destructive' });
    },
  });

  const cancelRun = useMutation({
    mutationFn: async (runId: string) => {
      const { data, error } = await api.functions.invoke(
        'workflow-dispatcher',
        { body: { action: 'cancel', run_id: runId } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Run cancelled' });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.runs });
    },
    onError: (err: Error) => {
      toast({ title: 'Cancel failed', description: err.message, variant: 'destructive' });
    },
  });

  const dispatchNow = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.functions.invoke(
        'workflow-dispatcher',
        { body: { action: 'dispatch' } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const dispatched = data?.dispatched ?? 0;
      toast({
        title: 'Dispatcher ran',
        description: `${dispatched} job${dispatched !== 1 ? 's' : ''} dispatched.`,
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.runs });
    },
    onError: (err: Error) => {
      toast({ title: 'Dispatch failed', description: err.message, variant: 'destructive' });
    },
  });

  const healthCheck = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.functions.invoke(
        'workflow-dispatcher',
        { body: { action: 'health_check' } },
      );
      if (error) throw error;
      return data;
    },
  });

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const getDefinitionByName = useCallback(
    (name: string) => definitions.find((d) => d.name === name),
    [definitions],
  );

  const activeRuns = useMemo(
    () => runs.filter((r) => r.status === 'running' || r.status === 'queued'),
    [runs],
  );

  const deadLetterRuns = useMemo(
    () => runs.filter((r) => r.status === 'dead_letter'),
    [runs],
  );

  return {
    // Data
    definitions,
    runs,
    activeRuns,
    deadLetterRuns,
    stats,
    metrics,

    // Loading states
    isLoading: definitionsLoading || runsLoading,
    metricsLoading,

    // Actions
    enqueueWorkflow: enqueueWorkflow.mutateAsync,
    retryRun: retryRun.mutateAsync,
    cancelRun: cancelRun.mutateAsync,
    dispatchNow: dispatchNow.mutateAsync,
    healthCheck: healthCheck.mutateAsync,
    refetchMetrics,

    // Mutation states
    isEnqueuing: enqueueWorkflow.isPending,
    isDispatching: dispatchNow.isPending,

    // Helpers
    getDefinitionByName,
  };
}
