import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VenueIngestStatsRow {
  day: string;
  source: string;
  staged: number;
  validated: number;
  unique_items: number;
  duplicates: number;
  inserted: number;
  updated: number;
  rejected: number;
  pending_review: number;
}

export interface VenueIngestEventRow {
  id: number;
  stage: string;
  new_status: string;
  actor: string;
  created_at: string;
  payload: Record<string, unknown> | null;
}

export interface VenueIngestDuplicatesRow {
  slug: string;
  duplicates: number;
}

export interface VenueIngestHealthRow {
  target_table: string;
  total: number;
  pending: number;
  rejected: number;
  review_pending: number;
  stuck_normalize: number;
  stuck_validate: number;
  stuck_dedup: number;
  stuck_commit: number;
  review_stale: number;
}

export function useVenueIngestStats() {
  return useQuery({
    queryKey: ['venue-ingest-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venue_ingest_stats')
        .select('*')
        .order('day', { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as VenueIngestStatsRow[];
    },
    refetchInterval: 30_000,
  });
}

export function useVenueIngestRecentEvents() {
  return useQuery({
    queryKey: ['ingestion-events-recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ingestion_events')
        .select('id, stage, new_status, actor, created_at, payload')
        .order('created_at', { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as VenueIngestEventRow[];
    },
    refetchInterval: 15_000,
  });
}

export function useVenueIngestHealthSnapshot() {
  return useQuery({
    queryKey: ['pipeline-health-snapshot'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('pipeline_health_snapshot');
      if (error) throw error;
      return (data ?? []) as VenueIngestHealthRow[];
    },
    refetchInterval: 20_000,
  });
}

export function useVenueIngestDuplicateSummary() {
  return useQuery({
    queryKey: ['venue-duplicates-by-source'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('venue_duplicate_summary');
      if (error) {
        const { data: dups } = await supabase
          .from('venues')
          .select('data_source')
          .not('duplicate_of_id', 'is', null);
        const counts: Record<string, number> = {};
        for (const v of dups ?? []) {
          const k = (v as { data_source: string | null }).data_source ?? 'unknown';
          counts[k] = (counts[k] ?? 0) + 1;
        }
        return Object.entries(counts).map(([slug, c]) => ({ slug, duplicates: c }));
      }
      return (data ?? []) as VenueIngestDuplicatesRow[];
    },
    staleTime: 60_000,
  });
}
