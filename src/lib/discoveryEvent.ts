import type { Database } from '@/integrations/supabase/types';

type Event = Database['public']['Tables']['events']['Row'];
type DiscoveryEvent = Pick<Event, 'start_date' | 'liveness_status' | 'age_restriction'>;

export const DISCOVERY_EVENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const UNAVAILABLE_EVENTS = new Set(['dead', 'cancelled', 'dead_link']);
const ADULT_ONLY = new Set(['18+', '21+']);

/** The nearest upcoming listing suitable for a general discovery surface. */
export function selectDiscoveryEvent<T extends DiscoveryEvent>(events: readonly T[], now: number) {
  let selected: T | undefined;
  let earliest = now + DISCOVERY_EVENT_WINDOW_MS;
  for (const event of events) {
    const start = Date.parse(event.start_date);
    if (
      start >= now &&
      start < earliest &&
      !UNAVAILABLE_EVENTS.has(event.liveness_status) &&
      !ADULT_ONLY.has(event.age_restriction || '')
    ) {
      earliest = start;
      selected = event;
    }
  }
  return selected;
}
