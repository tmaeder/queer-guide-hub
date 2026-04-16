import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom, untypedSupabase } from '@/integrations/supabase/untyped';

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
  pipeline_version: number | null;
  pipeline_snapshot: Record<string, unknown> | null;
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
      const { data, error } = await untypedFrom('pipeline_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as PipelineRun[];
    },
    refetchInterval: 10_000,
  });
}

/** Fetch the most recent run for a given pipeline */
export function useLatestPipelineRun(pipelineId: string | undefined) {
  return useQuery({
    queryKey: ['latest-pipeline-run', pipelineId],
    queryFn: async () => {
      if (!pipelineId) return null;
      const { data, error } = await untypedFrom('pipeline_runs')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as PipelineRun | null;
    },
    enabled: !!pipelineId,
    refetchInterval: 15_000,
  });
}

/** Fetch a single pipeline run (for detail view) */
export function usePipelineRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['pipeline-run', runId],
    queryFn: async () => {
      if (!runId) return null;
      const { data, error } = await untypedFrom('pipeline_runs')
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
      const { data, error } = await untypedFrom('api_circuit_breakers')
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
      const { data, error } = await untypedFrom('ingestion_staging')
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

interface EventIngestRow {
  day: string;
  source: string | null;
  staged: number;
  validated: number;
  unique_items: number;
  duplicates: number;
  merge_candidates: number;
  inserted: number;
  updated: number;
  rejected: number;
  pending_review: number;
}

/** Fetch per-source event ingest stats (last 14 days) from event_ingest_stats view */
export function useEventIngestStats(days = 14) {
  return useQuery({
    queryKey: ['event-ingest-stats', days],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
      const { data, error } = await untypedFrom('event_ingest_stats')
        .select('*')
        .gte('day', cutoff)
        .order('day', { ascending: false });
      if (error) throw error;
      return (data || []) as EventIngestRow[];
    },
    refetchInterval: 30_000,
  });
}

/** Generic helper — same shape as EventIngestRow, works for city_ingest_stats + country_ingest_stats */
function useIngestStatsView(view: string, days: number) {
  return useQuery({
    queryKey: [view, days],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
      const { data, error } = await untypedFrom(view)
        .select('*')
        .gte('day', cutoff)
        .order('day', { ascending: false });
      if (error) throw error;
      return (data || []) as EventIngestRow[];
    },
    refetchInterval: 30_000,
  });
}

export const useCityIngestStats    = (days = 14) => useIngestStatsView('city_ingest_stats', days);
export const useCountryIngestStats = (days = 14) => useIngestStatsView('country_ingest_stats', days);

/** Marketplace health stats — counts by availability, link_health, review_status */
export function useMarketplaceStats() {
  return useQuery({
    queryKey: ['marketplace-stats'],
    queryFn: async () => {
      type Row = { id: string; status: string | null; availability: string | null; link_health: string | null; review_status: string | null; source_type: string | null; last_verified_at: string | null };
      const [listingsRes, priceCountRes, stagingCountRes, dlqCountRes] = await Promise.all([
        untypedFrom('marketplace_listings').select('id, status, availability, link_health, review_status, source_type, last_verified_at').limit(5000),
        untypedFrom('marketplace_price_history').select('id', { count: 'exact', head: true }),
        untypedFrom('ingestion_staging').select('id, disposition', { count: 'exact' }).eq('target_table', 'marketplace_listings').limit(2000),
        untypedFrom('ingestion_dlq').select('id', { count: 'exact', head: true }).eq('target_table', 'marketplace_listings'),
      ]);
      if (listingsRes.error) throw listingsRes.error;
      const rows = (listingsRes.data || []) as unknown as Row[];
      const total = rows.length;
      const active = rows.filter(r => r.status === 'active').length;
      const broken = rows.filter(r => r.link_health === 'broken' || r.link_health === 'dead').length;
      const unchecked = rows.filter(r => !r.link_health || r.link_health === 'unchecked').length;
      const bySource: Record<string, number> = {};
      const byAvailability: Record<string, number> = {};
      const pendingReview = rows.filter(r => r.review_status === 'pending_review').length;
      const staleCutoff = Date.now() - 30 * 86400_000;
      const stale = rows.filter(r => !r.last_verified_at || new Date(r.last_verified_at).getTime() < staleCutoff).length;
      for (const r of rows) {
        const src = r.source_type || 'unknown';
        bySource[src] = (bySource[src] || 0) + 1;
        const av = r.availability || 'unknown';
        byAvailability[av] = (byAvailability[av] || 0) + 1;
      }
      const stagingRows = (stagingCountRes.data || []) as unknown as { disposition: string }[];
      const stagingByDisp: Record<string, number> = {};
      for (const r of stagingRows) stagingByDisp[r.disposition || 'pending'] = (stagingByDisp[r.disposition || 'pending'] || 0) + 1;
      return {
        total, active, broken, unchecked, stale, pendingReview,
        bySource, byAvailability,
        priceHistoryCount: priceCountRes.count ?? 0,
        stagingTotal: stagingCountRes.count ?? 0,
        stagingByDisposition: stagingByDisp,
        dlqCount: dlqCountRes.count ?? 0,
      };
    },
    refetchInterval: 30_000,
  });
}

/** Fetch pipeline definitions for listing */
export function usePipelineDefinitionsList() {
  return useQuery({
    queryKey: ['pipeline-definitions-list'],
    queryFn: async () => {
      const { data, error } = await untypedFrom('pipeline_definitions')
        .select('id, name, display_name, is_template, is_enabled, schedule, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export interface UnifiedPipelineRow {
  kind: 'pipeline' | 'workflow';
  id: string;
  name: string;
  display_name: string | null;
  schedule: string | null;
  is_enabled: boolean;
  is_template: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_duration_ms: number | null;
  last_items_succeeded: number | null;
  last_items_total: number | null;
  recent_statuses: string[];
  recent_success_count: number;
  recent_total_count: number;
}

export function useUnifiedPipelineOverview() {
  return useQuery({
    queryKey: ['unified-pipeline-overview'],
    queryFn: async (): Promise<UnifiedPipelineRow[]> => {
      const [pipeDefs, wfDefs, pipeRuns, wfRuns] = await Promise.all([
        untypedFrom('pipeline_definitions').select('id, name, display_name, is_template, is_enabled, schedule').order('name'),
        untypedFrom('workflow_definitions').select('id, name, display_name, is_enabled, schedule').order('name'),
        untypedFrom('pipeline_runs').select('pipeline_id, status, duration_ms, items_succeeded, items_total, created_at, completed_at').order('created_at', { ascending: false }).limit(500),
        untypedFrom('workflow_runs').select('definition_id, status, duration_ms, items_succeeded, items_total, created_at, completed_at').order('created_at', { ascending: false }).limit(500),
      ]);
      if (pipeDefs.error) throw pipeDefs.error;
      if (wfDefs.error) throw wfDefs.error;

      type Run = { status: string; duration_ms: number | null; items_succeeded: number | null; items_total: number | null; created_at: string; completed_at: string | null };
      const groupRuns = (rows: unknown[], key: string): Map<string, Run[]> => {
        const m = new Map<string, Run[]>();
        for (const r of (rows as Array<Record<string, unknown>>) || []) {
          const id = r[key] as string;
          if (!id) continue;
          const arr = m.get(id) || [];
          arr.push(r as unknown as Run);
          m.set(id, arr);
        }
        return m;
      };
      const pipeRunsById = groupRuns(pipeRuns.data || [], 'pipeline_id');
      const wfRunsById = groupRuns(wfRuns.data || [], 'definition_id');

      const buildRow = (kind: 'pipeline' | 'workflow', def: Record<string, unknown>, runsById: Map<string, Run[]>): UnifiedPipelineRow => {
        const id = def.id as string;
        const all = runsById.get(id) || [];
        const recent = all.slice(0, 10);
        const last = all[0];
        return {
          kind,
          id,
          name: def.name as string,
          display_name: (def.display_name as string) || null,
          schedule: (def.schedule as string) || null,
          is_enabled: !!def.is_enabled,
          is_template: !!def.is_template,
          last_run_at: last?.completed_at || last?.created_at || null,
          last_run_status: last?.status || null,
          last_run_duration_ms: last?.duration_ms || null,
          last_items_succeeded: last?.items_succeeded ?? null,
          last_items_total: last?.items_total ?? null,
          recent_statuses: recent.map(r => r.status),
          recent_success_count: recent.filter(r => r.status === 'completed').length,
          recent_total_count: recent.length,
        };
      };

      const rows: UnifiedPipelineRow[] = [
        ...(pipeDefs.data || []).map((d: Record<string, unknown>) => buildRow('pipeline', d, pipeRunsById)),
        ...(wfDefs.data || []).map((d: Record<string, unknown>) => buildRow('workflow', d, wfRunsById)),
      ];
      return rows;
    },
    refetchInterval: 15_000,
  });
}

export function usePipelineRunCounts24h() {
  return useQuery({
    queryKey: ['pipeline-run-counts-24h'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 86400_000).toISOString();
      const [pipeRes, wfRes] = await Promise.all([
        untypedFrom('pipeline_runs').select('status').gte('created_at', cutoff).limit(2000),
        untypedFrom('workflow_runs').select('status').gte('created_at', cutoff).limit(2000),
      ]);
      const all = [...(pipeRes.data || []), ...(wfRes.data || [])] as Array<{ status: string }>;
      return {
        total: all.length,
        completed: all.filter(r => r.status === 'completed').length,
        failed: all.filter(r => r.status === 'failed').length,
        running: all.filter(r => r.status === 'running').length,
      };
    },
    refetchInterval: 30_000,
  });
}
