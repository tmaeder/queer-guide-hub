import { useQuery } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import { supabase } from '@/integrations/supabase/client';

export interface ConsolidatedStats {
  venues: number | null;
  profiles: number | null;
  cities: number | null;
  countries: number | null;
  events: number | null;
  posts: number | null;
  personalities: number | null;
  groups: number | null;
  tags: number | null;
  marketplace: number | null;
  news: number | null;
  cms: number | null;
  generated_at?: string;
}

const NULL_STATS: ConsolidatedStats = {
  venues: null,
  profiles: null,
  cities: null,
  countries: null,
  events: null,
  posts: null,
  personalities: null,
  groups: null,
  tags: null,
  marketplace: null,
  news: null,
  cms: null,
};

const STAT_KEYS: (keyof ConsolidatedStats)[] = [
  'venues', 'profiles', 'cities', 'countries', 'events', 'posts',
  'personalities', 'groups', 'tags', 'marketplace', 'news', 'cms',
];

function coerceStats(raw: unknown): ConsolidatedStats {
  if (!raw || typeof raw !== 'object') return NULL_STATS;
  const src = raw as Record<string, unknown>;
  const out = { ...NULL_STATS };
  for (const key of STAT_KEYS) {
    const v = src[key];
    out[key] = typeof v === 'number' && Number.isFinite(v) ? v : null;
  }
  if (typeof src.generated_at === 'string') out.generated_at = src.generated_at;
  return out;
}

async function fetchHomepageStats(): Promise<ConsolidatedStats> {
  const { data, error } = await supabase.rpc('get_homepage_stats');
  if (error) throw error;
  return coerceStats(data);
}

export function useConsolidatedStats() {
  const query = useQuery({
    queryKey: ['homepage-stats'],
    queryFn: fetchHomepageStats,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  if (query.error) {
     
    console.error('[homepage-stats] aggregation failed', query.error);
    Sentry.captureException(query.error, { tags: { area: 'homepage-stats' } });
  }

  return {
    stats: query.data ?? NULL_STATS,
    loading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    refetch: query.refetch,
  };
}
