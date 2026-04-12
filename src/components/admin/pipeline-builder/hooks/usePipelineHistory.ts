import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PipelineRun {
  id: string;
  pipeline_id: string;
  pipeline_name: string;
  status: string;
  node_states: Record<string, { status: string; started_at?: string; completed_at?: string; items_in: number; items_out: number; error?: string; duration_ms?: number }>;
  items_total: number;
  items_processed: number;
  items_succeeded: number;
  items_failed: number;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  triggered_by: string;
  created_at: string;
}

interface CircuitBreaker {
  id: string;
  api_name: string;
  state: 'closed' | 'open' | 'half_open';
  failure_count: number;
  success_count: number;
  last_failure_at: string | null;
  last_success_at: string | null;
  open_until: string | null;
  threshold: number;
}

interface StagingStats {
  status: string;
  count: number;
}

/** Fetch recent pipeline runs */
export function usePipelineRuns(limit = 20) {
  return useQuery({
    queryKey: ['pipeline-runs', limit],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> })
        .from('pipeline_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as PipelineRun[];
    },
    refetchInterval: 10_000,
  });
}

/** Fetch a single pipeline run (for detail view) */
export function usePipelineRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['pipeline-run', runId],
    queryFn: async () => {
      if (!runId) return null;
      const { data, error } = await (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> })
        .from('pipeline_runs')
        .select('*')
        .eq('id', runId)
        .single();
      if (error) throw error;
      return data as PipelineRun;
    },
    enabled: !!runId,
    refetchInterval: 5_000,
  });
}

/** Fetch circuit breaker statuses */
export function useCircuitBreakers() {
  return useQuery({
    queryKey: ['circuit-breakers'],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> })
        .from('api_circuit_breakers')
        .select('*')
        .order('api_name', { ascending: true });
      if (error) throw error;
      return data as CircuitBreaker[];
    },
    refetchInterval: 30_000,
  });
}

/** Fetch staging table stats by disposition */
export function useStagingStats() {
  return useQuery({
    queryKey: ['staging-stats'],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> })
        .from('ingestion_staging')
        .select('disposition')
        .limit(5000);
      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const row of data || []) {
        const status = row.disposition || 'unknown';
        counts[status] = (counts[status] || 0) + 1;
      }
      return Object.entries(counts).map(([status, count]) => ({ status, count })) as StagingStats[];
    },
    refetchInterval: 30_000,
  });
}

/** Fetch pipeline definitions for listing */
export function usePipelineDefinitionsList() {
  return useQuery({
    queryKey: ['pipeline-definitions-list'],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> })
        .from('pipeline_definitions')
        .select('id, name, display_name, is_template, is_enabled, schedule, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
