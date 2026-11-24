import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { HomeRegion } from '@/hooks/useHomeRegion';

/** Which rung produced a row. The band groups on it and labels each group. */
export type NearYouRung = 'local' | 'trip';

export interface NearYouRow {
  id: string;
  kind: 'event' | 'venue';
  title: string;
  slug: string | null;
  /** Events only. */
  startDate: string | null;
  timezone?: string | null;
  datePrecision?: string | null;
  eventType?: string | null;
  /** "SchwuZ · Berlin" — whatever geography we can honestly print. */
  via: string;
  rung: NearYouRung;
}

/** How far the band got. Drives the heading, which must never over-promise. */
export type NearYouScope = 'city' | 'country' | 'network';

export interface NearYouResult {
  rows: NearYouRow[];
  scope: NearYouScope;
  localCount: number;
  tripCount: number;
}

/** Events that are actually happening — the board showed cancelled and
 *  dead-link rows because the old query filtered neither. */
const DEAD_LIVENESS = ['dead', 'cancelled', 'dead_link'];

const EVENT_SELECT =
  'id, title, slug, event_type, start_date, timezone, date_precision:enrichment_status->date_confirmation->>precision, venue_name, city:cities(id, name)';

type EventRow = {
  id: string;
  title: string;
  slug: string | null;
  event_type?: string | null;
  start_date: string | null;
  timezone: string | null;
  date_precision?: string | null;
  venue_name: string | null;
  city: { id: string; name: string } | null;
};

const toEventRow = (e: EventRow, rung: NearYouRung): NearYouRow => ({
  id: e.id,
  kind: 'event',
  title: e.title,
  slug: e.slug,
  startDate: e.start_date,
  eventType: e.event_type ?? null,
  timezone: e.timezone,
  datePrecision: e.date_precision ?? null,
  via: [e.venue_name, e.city?.name].filter(Boolean).join(' · '),
  rung,
});

/**
 * Upcoming events in the visitor's city (located or picked in the hero) and
 * nothing else. The board used to widen to venues, then the country, then
 * worldwide events — so a Zurich visitor was shown Paris and Fort Lauderdale.
 * An empty city now says so instead of borrowing someone else's listings.
 */
export function useHomeNearYou(
  region: HomeRegion,
  limit = 6,
  /** The shared "when" (see `@/lib/whenSelection`); absent = next upcoming. */
  range?: { start: Date; end: Date } | null,
) {
  const { cityId, loading: regionLoading } = region;
  const startIso = range?.start.toISOString() ?? null;
  const endIso = range?.end.toISOString() ?? null;

  return useQuery({
    queryKey: ['home-near-you', cityId, limit, startIso, endIso],
    // Waiting for the region avoids firing a global query and then immediately
    // replacing it with a local one — two requests and a visible content swap.
    enabled: !regionLoading,
    staleTime: 15 * 60 * 1000,
    queryFn: async (): Promise<NearYouResult> => {
      const nowIso = new Date().toISOString();
      const rows: NearYouRow[] = [];

      if (cityId) {
        const q = supabase
          .from('events')
          .select(EVENT_SELECT)
          .eq('city_id', cityId)
          .gte('start_date', startIso ?? nowIso);
        const { data, error } = await (endIso ? q.lte('start_date', endIso) : q)
          .is('duplicate_of_id', null)
          .not('liveness_status', 'in', `(${DEAD_LIVENESS.join(',')})`)
          .order('start_date', { ascending: true })
          .limit(limit);
        if (error) throw error;
        for (const e of (data ?? []) as unknown as EventRow[]) rows.push(toEventRow(e, 'local'));
      }

      return { rows, scope: 'city', localCount: rows.length, tripCount: 0 };
    },
  });
}
