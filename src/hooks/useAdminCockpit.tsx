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

export interface CockpitData {
  system: SystemHealth;
  review: ReviewSummary;
  imports: ImportSummary;
  quality: QualityIndex;
  stats: ContentStats;
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
  const [stagingRes, cmsRes, modRes, autoRes, tagRes] = await Promise.all([
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
  ]);

  const staging = stagingRes.count ?? 0;
  const cmsReview = cmsRes.count ?? 0;
  const moderation = modRes.count ?? 0;
  const automation = autoRes.count ?? 0;
  const tagSuggestions = tagRes.count ?? 0;

  return {
    staging,
    cmsReview,
    moderation,
    automation,
    tagSuggestions,
    total: staging + cmsReview + moderation + automation + tagSuggestions,
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
  const entityTypes = ['venues', 'events', 'personalities', 'news_articles'] as const;
  const byContentType: Record<string, { total: number; withIssues: number; score: number }> = {};
  let totalScoreSum = 0;
  let totalScored = 0;
  let warnings = 0;
  let critical = 0;

  const results = await Promise.all(
    entityTypes.map((t) =>
      supabase.from(t as 'venues').select('quality_score, needs_attention'),
    ),
  );

  entityTypes.forEach((type, i) => {
    const rows = (results[i].data ?? []) as Array<{
      quality_score: number | null;
      needs_attention: boolean | null;
    }>;
    const scored = rows.filter((r) => r.quality_score != null);
    const withIssues = rows.filter((r) => r.needs_attention === true).length;
    const avg =
      scored.length > 0
        ? Math.round(scored.reduce((s, r) => s + (r.quality_score ?? 0), 0) / scored.length)
        : 0;

    byContentType[type] = { total: rows.length, withIssues, score: avg };
    totalScoreSum += scored.reduce((s, r) => s + (r.quality_score ?? 0), 0);
    totalScored += scored.length;
    if (withIssues > 0 && withIssues <= 10) warnings += withIssues;
    if (withIssues > 10) critical += withIssues;
  });

  const overallScore = totalScored > 0 ? Math.round(totalScoreSum / totalScored) : 0;

  return { overallScore, byContentType, warnings, critical };
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

async function fetchCockpitData(): Promise<CockpitData> {
  const [system, review, imports, quality, stats] = await Promise.all([
    fetchSystemHealth(),
    fetchReviewSummary(),
    fetchImportSummary(),
    fetchQualityIndex(),
    fetchContentStats(),
  ]);

  return { system, review, imports, quality, stats };
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useAdminCockpit() {
  return useQuery({
    queryKey: ['admin-cockpit'],
    queryFn: fetchCockpitData,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
