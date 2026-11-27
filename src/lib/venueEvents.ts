import type { Database } from '@/integrations/supabase/types';

type Event = Database['public']['Tables']['events']['Row'];

/** Upcoming events at this venue, soonest first. Pure, so it can be tested. */
export function upcomingVenueEvents(events: Event[], venueId: string, now: Date = new Date()) {
  return events
    .filter((event) => event.venue_id === venueId && new Date(event.start_date) > now)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
}
