/**
 * useAdminCockpit — Unified data hook for the admin cockpit dashboard.
 * Consolidates system health, review counts, import status, and quality metrics
 * into a single reactive data source.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ── Types ────────────────────────────────────────────────────────────────

export interface SystemHealth {
  dbLatencyMs: number;
  recentErrors: number;
  lastDeployAt: string | null;
  status: 'healthy' | 'degraded' | 'error';
}

export interface ReviewSummary {
  staging: number;
  moderation: number;
  automation: number;
  cmsReview: number;
  tagSuggestions: number;
  submissions: number;
  total: number;
}

export interface ImportSummary {
  activeJobs: number;
  completedToday: number;
  failedToday: number;
  errorRate: number;
}

export interface QualityIndex {
  overallScore: number;
  byContentType: Record<string, { total: number; withIssues: number; score: number }>;
  warnings: number;
  critical: number;
}

export interface ContentStats {
  venues: number;
  events: number;
  personalities: number;
  news: number;
  cities: number;
  countries: number;
  hotels: number;
  villages: number;
  marketplace: number;
  groups: number;
  tags: number;
  pages: number;
  users: number;
}

export interface AutomationSummary {
  runsToday: number;
  itemsChangedToday: number;
  errorsToday: number;
  lastRunAt: string | null;
  lastRunSlug: string | null;
}

export interface CockpitData {
  system: SystemHealth;
  review: ReviewSummary;
  imports: ImportSummary;
  quality: QualityIndex;
  stats: ContentStats;
  automation: AutomationSummary;
}

// ── Fetch Functions ─────────────────────────────────────────────────────

async function fetchSystemHealth(): Promise<SystemHealth> {
  const start = performance.now();
  const { error } = await supabase
    .from('venues')
    .select('id', { count: 'exact', head: true })
    .limit(1);
  const latency = Math.round(performance.now() - start);

  return {
    dbLatencyMs: latency,
    recentErrors: error ? 1 : 0,
    lastDeployAt: null,
    status: latency > 2000 ? 'error' : latency > 500 ? 'degraded' : 'healthy',
  };
}

async function fetchReviewSummary(): Promise<ReviewSummary> {
  const [stagingRes, cmsRes, modRes, autoRes, tagRes, subRes] = await Promise.all([
    supabase
      .from('ingestion_staging' as 'venues')
      .select('id', { count: 'exact', head: true })
      .eq('review_status', 'pending_review')
      .eq('disposition', 'pending'),
    supabase
      .from('cms_content_metadata' as 'venues')
      .select('id', { count: 'exact', head: true })
      .eq('workflow_state', 'review'),
    supabase
      .from('moderation_flags' as 'venues')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'OPEN'),
    supabase
      .from('content_flags' as 'venues')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('tag_suggestions' as 'venues')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('community_submissions' as 'venues')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ]);

  const staging = stagingRes.count ?? 0;
  const cmsReview = cmsRes.count ?? 0;
  const moderation = modRes.count ?? 0;
  const automation = autoRes.count ?? 0;
  const tagSuggestions = tagRes.count ?? 0;
  const submissions = subRes.count ?? 0;

  return {
    staging,
    cmsReview,
    moderation,
    automation,
    tagSuggestions,
    submissions,
    total: staging + cmsReview + moderation + automation + tagSuggestions + submissions,
  };
}

async function fetchImportSummary(): Promise<ImportSummary> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const [activeRes, completedRes, failedRes] = await Promise.all([
    supabase
      .from('import_jobs' as 'venues')
      .select('id', { count: 'exact', head: true })
      .in('status', ['queued', 'running', 'paused']),
    supabase
      .from('import_jobs' as 'venues')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('updated_at', todayISO),
    supabase
      .from('import_jobs' as 'venues')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('updated_at', todayISO),
  ]);

  const active = activeRes.count ?? 0;
  const completed = completedRes.count ?? 0;
  const failed = failedRes.count ?? 0;
  const total = completed + failed;

  return {
    activeJobs: active,
    completedToday: completed,
    failedToday: failed,
    errorRate: total > 0 ? Math.round((failed / total) * 100) : 0,
  };
}

async function fetchQualityIndex(): Promise<QualityIndex> {
  // Aggregated server-side in SQL (get_admin_quality_index) — avoids pulling
  // every row of venues/events/personalities/news_articles to the client.
  const { data, error } = await supabase.rpc('get_admin_quality_index' as never);
  if (error || !data) {
    return { overallScore: 0, byContentType: {}, warnings: 0, critical: 0 };
  }
  return data as unknown as QualityIndex;
}

async function fetchContentStats(): Promise<ContentStats> {
  const tables = [
    { key: 'venues', table: 'venues' },
    { key: 'events', table: 'events' },
    { key: 'personalities', table: 'personalities' },
    { key: 'news', table: 'news_articles' },
    { key: 'cities', table: 'cities' },
    { key: 'countries', table: 'countries' },
    { key: 'hotels', table: 'hotels' },
    { key: 'villages', table: 'queer_villages' },
    { key: 'marketplace', table: 'marketplace_listings' },
    { key: 'groups', table: 'community_groups' },
    { key: 'tags', table: 'unified_tags' },
    { key: 'pages', table: 'cms_pages' },
    { key: 'users', table: 'profiles' },
  ] as const;

  const results = await Promise.all(
    tables.map(({ table }) =>
      supabase.from(table as 'venues').select('id', { count: 'exact', head: true }),
    ),
  );

  const stats = {} as Record<string, number>;
  tables.forEach(({ key }, i) => {
    stats[key] = results[i].count ?? 0;
  });

  return stats as unknown as ContentStats;
}

async function fetchAutomationSummary(): Promise<AutomationSummary> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const { data, error } = await supabase
    .from('admin_automation_runs' as 'venues')
    .select('automation_slug, status, items_changed, started_at')
    .gte('started_at', todayISO)
    .order('started_at', { ascending: false })
    .limit(100);

  if (error) {
    return {
      runsToday: 0,
      itemsChangedToday: 0,
      errorsToday: 0,
      lastRunAt: null,
      lastRunSlug: null,
    };
  }

  const rows = (data ?? []) as Array<{
    automation_slug: string;
    status: string;
    items_changed: number;
    started_at: string;
  }>;

  const errorsToday = rows.filter((r) => r.status === 'error').length;
  const itemsChangedToday = rows.reduce((s, r) => s + (r.items_changed ?? 0), 0);

  return {
    runsToday: rows.length,
    itemsChangedToday,
    errorsToday,
    lastRunAt: rows[0]?.started_at ?? null,
    lastRunSlug: rows[0]?.automation_slug ?? null,
  };
}

async function fetchCockpitData(): Promise<CockpitData> {
  const [system, review, imports, quality, stats, automation] = await Promise.all([
    fetchSystemHealth(),
    fetchReviewSummary(),
    fetchImportSummary(),
    fetchQualityIndex(),
    fetchContentStats(),
    fetchAutomationSummary(),
  ]);

  return { system, review, imports, quality, stats, automation };
}

// ── Hooks ───────────────────────────────────────────────────────────────
//
// Per-domain query hooks let each cockpit widget tune its own refetch cadence
// and expose `dataUpdatedAt` / `isFetching` for the freshness indicator.
// `useAdminCockpit()` stays as a thin aggregator for back-compat.

/** Volatile queue/count data — poll every 30s, refresh on focus. */
const QUEUE_OPTS = {
  staleTime: 30_000,
  refetchInterval: 30_000,
  refetchOnWindowFocus: true,
} as const;

/** Slow-moving aggregates — poll every 5 minutes. */
const SLOW_OPTS = {
  staleTime: 5 * 60_000,
  refetchInterval: 5 * 60_000,
  refetchOnWindowFocus: true,
} as const;

export function useSystemHealthQuery() {
  return useQuery({ queryKey: ['cockpit', 'system'], queryFn: fetchSystemHealth, ...QUEUE_OPTS });
}

export function useReviewSummaryQuery() {
  return useQuery({ queryKey: ['cockpit', 'review'], queryFn: fetchReviewSummary, ...QUEUE_OPTS });
}

export function useImportSummaryQuery() {
  return useQuery({ queryKey: ['cockpit', 'imports'], queryFn: fetchImportSummary, ...QUEUE_OPTS });
}

export function useAutomationSummaryQuery() {
  return useQuery({
    queryKey: ['cockpit', 'automation-summary'],
    queryFn: fetchAutomationSummary,
    ...QUEUE_OPTS,
  });
}

export function useQualityIndexQuery() {
  return useQuery({ queryKey: ['cockpit', 'quality'], queryFn: fetchQualityIndex, ...SLOW_OPTS });
}

export function useContentStatsQuery() {
  return useQuery({ queryKey: ['cockpit', 'stats'], queryFn: fetchContentStats, ...SLOW_OPTS });
}

export function useAdminCockpit() {
  return useQuery({
    queryKey: ['admin-cockpit'],
    queryFn: fetchCockpitData,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
