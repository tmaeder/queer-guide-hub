// Observance reads for the /days index, the hub's Past years / In the news / map, the
// homepage slot and the /events facet. Every count is computed under the reader's RLS
// (observances_index and observance_past_years are SECURITY INVOKER), so anon totals never
// include safety-gated events.
import { useQuery } from '@tanstack/react-query';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
import type { ObservanceDateRow } from '@/lib/observanceWindow';

const HOUR = 60 * 60_000;

export interface ObservanceIndexRow {
  id: string;
  slug: string;
  name: string;
  kind: 'day' | 'month';
  tone: 'memorial' | 'awareness' | 'celebration';
  summary: string;
  dates: ObservanceDateRow[];
  starts: string;
  linked_count: number;
}

export function useObservancesIndex() {
  return useQuery({
    queryKey: ['observances-index'],
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedRpc<ObservanceIndexRow[]>('observances_index', {});
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface ObservancePastYear {
  year: number;
  events: number;
  cities: number;
}

export function useObservancePastYears(observanceId: string | undefined, beforeYear: number) {
  return useQuery({
    queryKey: ['observance-past-years', observanceId, beforeYear],
    enabled: !!observanceId,
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedRpc<ObservancePastYear[]>('observance_past_years', {
        p_observance_id: observanceId,
        p_before_year: beforeYear,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface ObservanceNewsItem {
  id: string;
  slug: string;
  title: string;
  published_at: string;
}

export function useObservanceNews(observanceId: string | undefined) {
  return useQuery({
    queryKey: ['observance-news', observanceId],
    enabled: !!observanceId,
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedFrom('news_observances')
        .select('article:news_articles!inner(id, slug, title, published_at)')
        .eq('observance_id', observanceId!)
        .eq('status', 'linked')
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as unknown as { article: ObservanceNewsItem }[])
        .map((r) => r.article)
        .filter((a) => !!a.slug)
        .sort((a, b) => b.published_at.localeCompare(a.published_at))
        .slice(0, 12);
    },
  });
}

/** Event ids linked to one observance — the /events facet filters the feed by these. */
export function useObservanceEventIds(slug: string | null) {
  return useQuery({
    queryKey: ['observance-event-ids', slug],
    enabled: !!slug,
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedFrom('event_observances')
        .select('event_id, observance:observances!inner(slug)')
        .eq('observance.slug', slug!)
        .eq('status', 'linked')
        .limit(1000);
      if (error) throw error;
      return ((data ?? []) as { event_id: string }[]).map((r) => r.event_id);
    },
  });
}
