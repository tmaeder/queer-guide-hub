import { useQuery } from '@tanstack/react-query';
import type { Database } from '@db/types';
import { withOfflineFallback } from '@/features/packs/offline';
import { eventBySlug, eventsInBounds } from '@/features/packs/store';
import { supabase } from '@/lib/supabase';
import { snapBounds, type Bounds } from './venues';

type EventRow = Database['public']['Tables']['events']['Row'];

export const EVENT_LIST_COLUMNS =
  'id, slug, title, start_date, end_date, timezone, latitude, longitude, city, event_type, venue_name' as const;

export const EVENT_DETAIL_COLUMNS = `id, slug, title, start_date, end_date, timezone, latitude, longitude, city, country,
  address, event_type, venue_name, description, ticket_url, website, is_free, price_min, price_max, currency,
  age_restriction, accessibility_attributes, tags, venue:venues!venue_id(slug, name)` as const;

export type EventListItem = Pick<
  EventRow,
  'id' | 'slug' | 'title' | 'start_date' | 'end_date' | 'timezone' | 'latitude' | 'longitude' | 'city' | 'event_type' | 'venue_name'
>;

export type EventDetail = EventListItem &
  Pick<
    EventRow,
    | 'country'
    | 'address'
    | 'description'
    | 'ticket_url'
    | 'website'
    | 'is_free'
    | 'price_min'
    | 'price_max'
    | 'currency'
    | 'age_restriction'
    | 'accessibility_attributes'
    | 'tags'
  > & { venue: { slug: string; name: string } | null };

export const MAX_MAP_EVENTS = 200;

/**
 * "Ends now or later": an event that has started but not ended is upcoming
 * to a reader. Same clause as the web's endsAtOrAfter (src/hooks/useEvents.tsx).
 */
export const endsAtOrAfter = (iso: string) =>
  `end_date.gte.${iso},and(end_date.is.null,start_date.gte.${iso})`;

/**
 * Upcoming events in a viewport, with the web feed's predicate: active, not
 * merged away, and a recurring series or festival programme collapsed to its
 * next occurrence. Safety-gated events are filtered by RLS for visitors.
 */
export function fetchEventsInBounds(bounds: Bounds, now = new Date()): Promise<EventListItem[]> {
  return withOfflineFallback(
    () => fetchEventsInBoundsOnline(bounds, now),
    // Same rule as venues: an area no pack covers stays an error.
    async (db) => {
      const rows = rankUpcoming(await eventsInBounds(db, bounds, now.getTime(), MAX_MAP_EVENTS));
      return rows.length ? rows : null;
    },
  );
}

async function fetchEventsInBoundsOnline(bounds: Bounds, now: Date): Promise<EventListItem[]> {
  const [west, south, east, north] = bounds;
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_LIST_COLUMNS)
    .eq('status', 'active')
    .is('duplicate_of_id', null)
    .eq('series_next', true)
    .is('parent_event_id', null)
    .or(endsAtOrAfter(now.toISOString()))
    .gte('latitude', south)
    .lte('latitude', north)
    .gte('longitude', west)
    .lte('longitude', east)
    .order('start_date', { ascending: true })
    .limit(MAX_MAP_EVENTS);
  if (error) throw error;
  return rankUpcoming((data ?? []) as EventListItem[]);
}

/**
 * Detail: like the web's fetchEventBySlugOrId, past events keep their page
 * but a cancelled (archived) one does not. `status.is.null` keeps NULL-status
 * rows, which a bare neq would drop.
 */
export function fetchEventBySlug(slug: string): Promise<EventDetail | null> {
  return withOfflineFallback(
    () => fetchEventBySlugOnline(slug),
    (db) => eventBySlug(db, slug),
  );
}

async function fetchEventBySlugOnline(slug: string): Promise<EventDetail | null> {
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_DETAIL_COLUMNS)
    .eq('slug', slug)
    .is('duplicate_of_id', null)
    .or('status.is.null,status.neq.cancelled')
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as EventDetail | null) ?? null;
}

export function useEventsInBounds(bounds: Bounds | null, enabled = true) {
  const snapped = bounds ? snapBounds(bounds) : null;
  return useQuery({
    queryKey: snapped ? ['events', 'bounds', ...snapped] : ['events', 'bounds', 'none'],
    queryFn: () => fetchEventsInBounds(snapped!),
    enabled: enabled && snapped != null,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useEvent(slug: string) {
  return useQuery({
    queryKey: ['events', 'detail', slug],
    queryFn: () => fetchEventBySlug(slug),
    staleTime: 10 * 60_000,
  });
}

/**
 * A start at exactly 00:00 in the event's own zone is a placeholder — the
 * source gave a date and no time — so it is shown as a date only, never as
 * "midnight".
 */
export function formatEventWhen(
  e: Pick<EventListItem, 'start_date' | 'end_date' | 'timezone'>,
  locale: string,
): string {
  const tz = e.timezone || undefined;
  const start = new Date(e.start_date);
  const end = e.end_date ? new Date(e.end_date) : null;
  const opts = (o: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat(locale, { ...o, timeZone: tz });
    } catch {
      return new Intl.DateTimeFormat(locale, o); // unknown zone string
    }
  };
  const hm = opts({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(start);
  const dateOnly = hm === '00:00';
  const day = opts({ weekday: 'short', day: 'numeric', month: 'short' });
  const time = opts({ hour: '2-digit', minute: '2-digit' });
  const startDay = day.format(start);
  if (!end || end <= start) return dateOnly ? startDay : `${startDay}, ${time.format(start)}`;
  const endDay = day.format(end);
  // A night out that ends after midnight is one evening, not a two-day event.
  const withinADay = end.getTime() - start.getTime() < 24 * 60 * 60_000;
  if (endDay === startDay || (withinADay && !dateOnly)) {
    return dateOnly ? startDay : `${startDay}, ${time.format(start)}–${time.format(end)}`;
  }
  return `${startDay} – ${endDay}`;
}

/** Longer than this, a row is a standing listing (opening hours), not an event. */
export const ONGOING_AFTER_MS = 14 * 24 * 60 * 60_000;

export const isOngoing = (e: Pick<EventListItem, 'start_date' | 'end_date'>) =>
  !!e.end_date && new Date(e.end_date).getTime() - new Date(e.start_date).getTime() > ONGOING_AFTER_MS;

/**
 * Dated events first, by start; standing listings after. The corpus holds
 * venue opening hours stored as two-year "events" (e.g. a sauna open
 * 2025-07 → 2027-06), and a start-date sort puts every one of them above
 * tonight's actual events.
 */
export function rankUpcoming<T extends Pick<EventListItem, 'start_date' | 'end_date'>>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const oa = isOngoing(a) ? 1 : 0;
    const ob = isOngoing(b) ? 1 : 0;
    return oa - ob || a.start_date.localeCompare(b.start_date);
  });
}

/** "Free", a single price, or a range in the event's currency; null when unknown. */
export function priceLabel(e: Pick<EventDetail, 'is_free' | 'price_min' | 'price_max' | 'currency'>, locale: string, free: string) {
  if (e.is_free) return free;
  if (e.price_min == null) return null;
  const fmt = (n: number) => {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: e.currency ?? 'EUR', maximumFractionDigits: 0 }).format(n);
    } catch {
      return String(n);
    }
  };
  return e.price_max != null && e.price_max > e.price_min ? `${fmt(e.price_min)}–${fmt(e.price_max)}` : fmt(e.price_min);
}
