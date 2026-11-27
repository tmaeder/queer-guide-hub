// Observance reads. events RLS applies to the embedded join, so safety-gated events
// disappear for anon; observance_gated_count returns only how many were hidden.
import { useQuery } from '@tanstack/react-query';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
import type { ObservanceDateRow } from '@/lib/observanceWindow';
import type { Database } from '@/integrations/supabase/types';

const HOUR = 60 * 60_000;
type EventRow = Database['public']['Tables']['events']['Row'];

export interface Observance {
  id: string;
  slug: string;
  name: string;
  kind: 'day' | 'month';
  tone: 'memorial' | 'awareness' | 'celebration';
  summary: string;
  body: string | null;
  founded_year: number | null;
  window_days_before: number;
  window_days_after: number;
  founded_milestone: { slug: string; title: string; date: string } | null;
}

export function useObservance(slug: string | undefined) {
  return useQuery({
    queryKey: ['observance', slug],
    enabled: !!slug,
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedFrom('observances')
        .select(
          'id, slug, name, kind, tone, summary, body, founded_year, window_days_before, window_days_after, founded_milestone:milestones(slug, title, date)',
        )
        .eq('slug', slug!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Observance | null;
    },
  });
}

export function useObservanceDates(observanceId: string | undefined) {
  return useQuery({
    queryKey: ['observance-dates', observanceId],
    enabled: !!observanceId,
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedRpc<ObservanceDateRow[]>('observance_next_dates', {
        p_observance_id: observanceId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useObservanceEvents(
  observanceId: string | undefined,
  range: { from: string; to: string } | null,
) {
  return useQuery({
    queryKey: ['observance-events', observanceId, range],
    enabled: !!observanceId && !!range,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await untypedFrom('event_observances')
        .select('event:events!inner(*)')
        .eq('observance_id', observanceId!)
        .eq('status', 'linked')
        .is('event.duplicate_of_id', null)
        .gte('event.start_date', `${range!.from}T00:00:00Z`)
        .lte('event.start_date', `${range!.to}T23:59:59Z`)
        // ponytail: 500-row cap, unordered on the server; raise or paginate if one observance window ever exceeds it.
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as unknown as { event: EventRow }[])
        .map((r) => r.event)
        .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''));
    },
  });
}

export function useObservanceGatedCount(
  observanceId: string | undefined,
  range: { from: string; to: string } | null,
) {
  return useQuery({
    queryKey: ['observance-gated', observanceId, range],
    enabled: !!observanceId && !!range,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await untypedRpc<number>('observance_gated_count', {
        p_observance_id: observanceId,
        p_from: range!.from,
        p_to: range!.to,
      });
      if (error) throw error;
      return data ?? 0;
    },
  });
}

export function useEventObservances(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-observances', eventId],
    enabled: !!eventId,
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedFrom('event_observances')
        .select('observance:observances!inner(slug, name)')
        .eq('event_id', eventId!)
        .eq('status', 'linked');
      if (error) throw error;
      return ((data ?? []) as unknown as { observance: { slug: string; name: string } }[]).map(
        (r) => r.observance,
      );
    },
  });
}
