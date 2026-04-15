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

/** Fetch the most recent run for a given pipeline */
export function useLatestPipelineRun(pipelineId: string | undefined) {
  return useQuery({
    queryKey: ['latest-pipeline-run', pipelineId],
    queryFn: async () => {
      if (!pipelineId) return null;
      const { data, error } = await (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> })
        .from('pipeline_runs')
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
      const { data, error } = await (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> })
        .from('event_ingest_stats')
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
      const { data, error } = await (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> })
        .from(view)
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
      const sb = supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> };
      const [listingsRes, priceCountRes, stagingCountRes, dlqCountRes] = await Promise.all([
        sb.from('marketplace_listings').select('id, status, availability, link_health, review_status, source_type, last_verified_at').limit(5000),
        sb.from('marketplace_price_history').select('id', { count: 'exact', head: true }),
        sb.from('ingestion_staging').select('id, disposition', { count: 'exact' }).eq('target_table', 'marketplace_listings').limit(2000),
        sb.from('ingestion_dlq').select('id', { count: 'exact', head: true }).eq('target_table', 'marketplace_listings'),
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
      const { data, error } = await (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> })
        .from('pipeline_definitions')
        .select('id, name, display_name, is_template, is_enabled, schedule, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
