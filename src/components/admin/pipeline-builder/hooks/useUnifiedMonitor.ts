import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';

export interface UnifiedRun {
  id: string;
  name: string;
  type: 'pipeline' | 'workflow';
  status: string;
  items_processed: number;
  items_succeeded: number;
  items_failed: number;
  duration_ms: number | null;
  error_message: string | null;
  started_at: string | null;
  created_at: string;
  node_states?: Record<string, unknown>;
  output_result?: Record<string, unknown>;
}

function usePipelineRunsRaw(limit = 30) {
  return useQuery({
    queryKey: ['unified-pipeline-runs', limit],
    queryFn: async () => {
      const { data, error } = await untypedFrom('pipeline_runs')
        .select('id, pipeline_name, status, items_processed, items_succeeded, items_failed, duration_ms, error_message, started_at, created_at, node_states')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []).map((r: Record<string, unknown>) => ({
        id: r.id,
        name: r.pipeline_name,
        type: 'pipeline' as const,
        status: r.status,
        items_processed: r.items_processed || 0,
        items_succeeded: r.items_succeeded || 0,
        items_failed: r.items_failed || 0,
        duration_ms: r.duration_ms,
        error_message: r.error_message,
        started_at: r.started_at,
        created_at: r.created_at,
        node_states: r.node_states,
      }));
    },
    refetchInterval: 10_000,
  });
}

function useWorkflowRunsRaw(limit = 30) {
  return useQuery({
    queryKey: ['unified-workflow-runs', limit],
    queryFn: async () => {
      const { data, error } = await untypedFrom('workflow_runs')
        .select('id, workflow_name, status, items_processed, items_succeeded, items_failed, duration_ms, error_message, started_at, created_at, output_result')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []).map((r: Record<string, unknown>) => ({
        id: r.id,
        name: r.workflow_name,
        type: 'workflow' as const,
        status: r.status,
        items_processed: r.items_processed || 0,
        items_succeeded: r.items_succeeded || 0,
        items_failed: r.items_failed || 0,
        duration_ms: r.duration_ms,
        error_message: r.error_message,
        started_at: r.started_at,
        created_at: r.created_at,
        output_result: r.output_result,
      }));
    },
    refetchInterval: 10_000,
  });
}

export function useUnifiedMonitor() {
  const { data: pipelineRuns, isLoading: pLoading } = usePipelineRunsRaw();
  const { data: workflowRuns, isLoading: wLoading } = useWorkflowRunsRaw();

  const allRuns = useMemo(() => {
    const combined = [...(pipelineRuns || []), ...(workflowRuns || [])];
    return combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 50);
  }, [pipelineRuns, workflowRuns]);

  const stats = useMemo(() => {
    const running = allRuns.filter(r => r.status === 'running').length;
    const completed = allRuns.filter(r => r.status === 'completed').length;
    const failed = allRuns.filter(r => r.status === 'failed' || r.status === 'dead_letter').length;
    return { running, completed, failed, total: allRuns.length };
  }, [allRuns]);

  return { allRuns, stats, isLoading: pLoading || wLoading };
}
