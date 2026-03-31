import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ── Types ────────────────────────────────────────────────────────────────

export interface EnrichmentPipelineHealth {
  last24h: {
    total: number;
    done: number;
    failed: number;
    skipped: number;
  };
  avgDurationMs: Record<string, number>;
  failuresByStep: Record<string, number>;
  queueDepth: number;
}

export interface QualityDistribution {
  entityType: string;
  total: number;
  excellent: number;
  good: number;
  needsAttention: number;
  avgScore: number;
}

export interface ReviewQueueItem {
  id: string;
  entity_type: string;
  entity_id: string;
  review_type: string;
  details: Record<string, unknown>;
  status: string;
  created_at: string;
  entity_name?: string;
}

export interface NeedsAttentionSummary {
  venues: number;
  events: number;
  personalities: number;
  news_articles: number;
  total: number;
}

export interface EnrichmentDashboardData {
  health: EnrichmentPipelineHealth;
  quality: QualityDistribution[];
  reviewQueue: ReviewQueueItem[];
  needsAttention: NeedsAttentionSummary;
}

export interface EnrichmentFailure {
  entity_type: string;
  entity_id: string;
  enrichment_status: Record<string, string>;
  quality_score: number | null;
  needs_attention: boolean;
  failed_steps: string[];
  updated_at: string;
}

// ── Fetch Functions ─────────────────────────────────────────────────────

async function fetchPipelineHealth(): Promise<EnrichmentPipelineHealth> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: logs } = await supabase
    .from('enrichment_log' as any)
    .select('step, status, duration_ms')
    .gte('created_at', since);

  const items = (logs ?? []) as Array<{ step: string; status: string; duration_ms: number | null }>;

  const done = items.filter((l) => l.status === 'done').length;
  const failed = items.filter((l) => l.status === 'failed').length;
  const skipped = items.filter((l) => l.status === 'skipped').length;

  const avgDurationMs: Record<string, number> = {};
  const failuresByStep: Record<string, number> = {};
  const stepDurations: Record<string, number[]> = {};

  for (const item of items) {
    if (item.status === 'failed') {
      failuresByStep[item.step] = (failuresByStep[item.step] ?? 0) + 1;
    }
    if (item.duration_ms != null && item.status === 'done') {
      if (!stepDurations[item.step]) stepDurations[item.step] = [];
      stepDurations[item.step].push(item.duration_ms);
    }
  }

  for (const [step, durations] of Object.entries(stepDurations)) {
    avgDurationMs[step] = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  }

  let queueDepth = 0;
  try {
    const { data: metrics } = await supabase.rpc('pgmq_metrics' as any, {
      queue_name: 'enrichment_queue',
    });
    if (metrics && typeof metrics === 'object' && 'queue_length' in (metrics as any)) {
      queueDepth = (metrics as any).queue_length ?? 0;
    }
  } catch {
    // pgmq_metrics may not be accessible via anon key
  }

  return {
    last24h: { total: items.length, done, failed, skipped },
    avgDurationMs,
    failuresByStep,
    queueDepth,
  };
}

async function fetchQualityDistribution(): Promise<QualityDistribution[]> {
  const entityTypes = ['venues', 'events', 'personalities', 'news_articles'] as const;
  const results: QualityDistribution[] = [];

  for (const entityType of entityTypes) {
    const { data } = await supabase
      .from(entityType as any)
      .select('quality_score');

    const rows = (data ?? []) as Array<{ quality_score: number | null }>;
    const scored = rows.filter((r) => r.quality_score != null);
    const total = scored.length;

    if (total === 0) {
      results.push({ entityType, total: rows.length, excellent: 0, good: 0, needsAttention: 0, avgScore: 0 });
      continue;
    }

    const excellent = scored.filter((r) => (r.quality_score ?? 0) >= 80).length;
    const needsAttention = scored.filter((r) => (r.quality_score ?? 0) < 40).length;
    const good = total - excellent - needsAttention;
    const avgScore = Math.round(scored.reduce((sum, r) => sum + (r.quality_score ?? 0), 0) / total);

    results.push({ entityType, total: rows.length, excellent, good, needsAttention, avgScore });
  }

  return results;
}

async function fetchReviewQueue(): Promise<ReviewQueueItem[]> {
  const { data } = await supabase
    .from('review_queue' as any)
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);

  return (data ?? []) as ReviewQueueItem[];
}

async function fetchNeedsAttention(): Promise<NeedsAttentionSummary> {
  const tables = ['venues', 'events', 'personalities', 'news_articles'] as const;
  const counts: Record<string, number> = {};

  const results = await Promise.all(
    tables.map((t) =>
      supabase
        .from(t as any)
        .select('id', { count: 'exact', head: true })
        .eq('needs_attention', true),
    ),
  );

  let total = 0;
  tables.forEach((t, i) => {
    const c = results[i].count ?? 0;
    counts[t] = c;
    total += c;
  });

  return {
    venues: counts.venues,
    events: counts.events,
    personalities: counts.personalities,
    news_articles: counts.news_articles,
    total,
  };
}

async function fetchDashboardData(): Promise<EnrichmentDashboardData> {
  const [health, quality, reviewQueue, needsAttention] = await Promise.all([
    fetchPipelineHealth(),
    fetchQualityDistribution(),
    fetchReviewQueue(),
    fetchNeedsAttention(),
  ]);

  return { health, quality, reviewQueue, needsAttention };
}

// ── Hooks ────────────────────────────────────────────────────────────────

export function useEnrichmentDashboard() {
  return useQuery({
    queryKey: ['enrichment-dashboard'],
    queryFn: fetchDashboardData,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useEnrichmentFailures() {
  return useQuery({
    queryKey: ['enrichment-failures'],
    queryFn: async (): Promise<EnrichmentFailure[]> => {
      const { data } = await supabase.rpc('get_enrichment_failures' as any, {
        p_entity_type: null,
        p_since: '7 days',
        p_limit: 50,
      });
      return (data ?? []) as EnrichmentFailure[];
    },
    staleTime: 60_000,
  });
}

export function useRetryEnrichment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      entityType,
      entityId,
      steps,
    }: {
      entityType: string;
      entityId: string;
      steps?: string[];
    }) => {
      const { data, error } = await supabase.rpc('retry_enrichment' as any, {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_steps: steps ?? null,
      });
      if (error) throw error;
      return data as { status: string; steps: string[] };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrichment-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['enrichment-failures'] });
    },
  });
}

export function useResolveReviewItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      resolution,
    }: {
      id: string;
      resolution: 'resolved' | 'dismissed';
    }) => {
      const { error } = await supabase
        .from('review_queue' as any)
        .update({ status: resolution, resolved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrichment-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['review-counts'] });
    },
  });
}
