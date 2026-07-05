import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CalendarTripItem {
  kind: 'trip';
  id: string;
  title: string;
  start_date: string; // DATE
  end_date: string;   // DATE (falls back to start_date)
  city: string | null;
  country_code: string | null;
  image_url: string | null;
  path: string;
}

export interface CalendarEventItem {
  kind: 'event';
  id: string;
  title: string;
  start_date: string; // timestamptz
  end_date: string | null;
  city: string | null;
  venue_name: string | null;
  slug: string | null;
  path: string;
}

export type CalendarItem = CalendarTripItem | CalendarEventItem;

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Trips + saved (favorited) events overlapping [rangeStart, rangeEnd]. */
export function useCalendarItems(rangeStart: Date, rangeEnd: Date) {
  const { user } = useAuth();
  const startDay = day(rangeStart);
  const endDay = day(rangeEnd);

  return useQuery({
    queryKey: ['calendar-items', user?.id, startDay, endDay],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CalendarItem[]> => {
      const [tripsRes, eventsRes] = await Promise.all([
        supabase
          .from('trips')
          .select('id, title, start_date, end_date, primary_city_name, primary_country_code, cover_image_url')
          .eq('owner_id', user!.id)
          .in('status', ['planning', 'active'])
          .lte('start_date', endDay)
          .or(`end_date.gte.${startDay},and(end_date.is.null,start_date.gte.${startDay})`)
          .order('start_date', { ascending: true }),
        supabase
          .from('event_favorites')
          .select('event_id, events!inner(id, title, slug, start_date, end_date, city, venue_name, status)')
          .eq('user_id', user!.id)
          .gte('events.start_date', rangeStart.toISOString())
          .lte('events.start_date', rangeEnd.toISOString()),
      ]);
      if (tripsRes.error) throw tripsRes.error;
      if (eventsRes.error) throw eventsRes.error;

      const trips: CalendarItem[] = (tripsRes.data ?? []).map((t) => ({
        kind: 'trip' as const,
        id: t.id,
        title: t.title,
        start_date: t.start_date,
        end_date: t.end_date ?? t.start_date,
        city: t.primary_city_name,
        country_code: t.primary_country_code,
        image_url: t.cover_image_url,
        path: `/me/trips/${t.id}`,
      }));

      const events: CalendarItem[] = (eventsRes.data ?? [])
        .map((row) => {
          const e = row.events as unknown as {
            id: string; title: string; slug: string | null;
            start_date: string; end_date: string | null;
            city: string | null; venue_name: string | null; status: string | null;
          } | null;
          if (!e || e.status === 'cancelled') return null;
          return {
            kind: 'event' as const,
            id: e.id,
            title: e.title,
            start_date: e.start_date,
            end_date: e.end_date,
            city: e.city,
            venue_name: e.venue_name,
            slug: e.slug,
            path: e.slug ? `/events/${e.slug}` : '#',
          };
        })
        .filter((e): e is CalendarEventItem => e !== null);

      return [...trips, ...events].sort((a, b) =>
        a.start_date.localeCompare(b.start_date),
      );
    },
  });
}

/** Next `withinDays` days, merged + truncated — for the /messages rail strip. */
export function useUpcomingCalendar(withinDays = 14, limit = 4) {
  const now = new Date();
  // Stable day-granular range so the query key doesn't churn every render
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + withinDays * 24 * 60 * 60 * 1000);
  const query = useCalendarItems(start, end);
  return { ...query, data: query.data?.slice(0, limit) };
}
