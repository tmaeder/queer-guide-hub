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

/**
 * Categories that must never lead the homepage.
 *
 * Not a taste call — both are structurally wrong for this surface, verified
 * against the corpus:
 *
 *  - `hotel` (337 rows) is almost entirely PRIVATE ROOM listings: "Room in a
 *    big Apt, located in a Courtyard", "Guest room in a quite and modern
 *    apartment", "Top floor apartment in hip De Pijp area". Someone's spare
 *    bedroom is not a place to go out, and hotels have their own surface.
 *  - `toilet` (732 rows) is mislabelled facilities — "Walmart Fuel Station",
 *    "Martinez Petco", "Courtyard by Marriott". These are places that HAVE a
 *    restroom, not destinations.
 *
 * A blocklist rather than an allowlist on purpose: `category` is 56% the
 * literal string 'other' (13,073 rows), and that bucket holds real queer
 * institutions — Gay Men's Health Crisis, Hi Tops, Nowhere, The Boiler Room.
 * Allowlisting the seven "nightlife" categories would delete them.
 */
const NOT_A_DESTINATION = ['hotel', 'toilet'];

const EVENT_SELECT = 'id, title, slug, start_date, venue_name, city:cities(id, name)';
const VENUE_SELECT = 'id, name, slug, category, city, quality_score';

type EventRow = {
  id: string;
  title: string;
  slug: string | null;
  start_date: string | null;
  venue_name: string | null;
  city: { id: string; name: string } | null;
};

type VenueRow = {
  id: string;
  name: string;
  slug: string | null;
  category: string | null;
  city: string | null;
};

const toEventRow = (e: EventRow, rung: NearYouRung): NearYouRow => ({
  id: e.id,
  kind: 'event',
  title: e.title,
  slug: e.slug,
  startDate: e.start_date,
  via: [e.venue_name, e.city?.name].filter(Boolean).join(' · '),
  rung,
});

const toVenueRow = (v: VenueRow, rung: NearYouRung): NearYouRow => ({
  id: v.id,
  kind: 'venue',
  title: v.name,
  slug: v.slug,
  startDate: null,
  // `category` is 59% the literal string 'other' across the corpus, so it is
  // shown when it is informative and silently dropped when it is not — it is
  // never used as a filter.
  via: [v.category && v.category !== 'other' ? v.category : null, v.city]
    .filter(Boolean)
    .join(' · '),
  rung,
});

/**
 * What is on near the visitor — places first, events promoted above them.
 *
 * Why places lead: there are ~315 future events in the entire corpus, 18 of
 * them within seven days, spread over 130 cities (see useIntentData), so a
 * region-scoped *events* board is empty for the median visitor. Venues are the
 * inverse — roughly 23,500 of them. Leading with places is what makes "show me
 * my region" answerable at all; local events still take the top rows whenever
 * they exist, because a dated thing outranks a standing one.
 *
 * All rungs run inside ONE queryFn, so the band has a single pending state and
 * cannot render-then-reflow. This mirrors useEventsWithFallback, which widens
 * the same way and returns the window it landed on so the UI can say so.
 */
export function useHomeNearYou(region: HomeRegion, limit = 6) {
  const { cityId, countryId, loading: regionLoading } = region;

  return useQuery({
    queryKey: ['home-near-you', cityId, countryId, limit],
    // Waiting for the region avoids firing a global query and then immediately
    // replacing it with a local one — two requests and a visible content swap.
    enabled: !regionLoading,
    staleTime: 15 * 60 * 1000,
    queryFn: async (): Promise<NearYouResult> => {
      const nowIso = new Date().toISOString();
      const rows: NearYouRow[] = [];

      // Rung 1 — events in the visitor's own city. Rare, so they always lead.
      if (cityId) {
        const { data } = await supabase
          .from('events')
          .select(EVENT_SELECT)
          .eq('city_id', cityId)
          .gte('start_date', nowIso)
          .is('duplicate_of_id', null)
          .not('liveness_status', 'in', `(${DEAD_LIVENESS.join(',')})`)
          .order('start_date', { ascending: true })
          .limit(limit);
        for (const e of (data ?? []) as unknown as EventRow[]) rows.push(toEventRow(e, 'local'));
      }

      // Rung 2 — places in the visitor's city, then their country.
      if (rows.length < limit && cityId) {
        const { data } = await supabase
          .from('venues')
          .select(VENUE_SELECT)
          .eq('city_id', cityId)
          .is('duplicate_of_id', null)
          .is('closed_at', null)
          .not('category', 'in', `(${NOT_A_DESTINATION.join(',')})`)
          // quality_score alone is not an order: 654 rows share the top value
          // of 95, so ties came back in whatever order Postgres felt like and
          // a spare-room listing outranked Berghain in Berlin. Featured first
          // among equals, then the most recently maintained record.
          .order('quality_score', { ascending: false, nullsFirst: false })
          .order('is_featured', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(limit - rows.length);
        for (const v of (data ?? []) as unknown as VenueRow[]) rows.push(toVenueRow(v, 'local'));
      }

      const cityRows = rows.length;

      if (rows.length < limit && countryId) {
        const { data } = await supabase
          .from('venues')
          .select(VENUE_SELECT)
          .eq('country_id', countryId)
          .is('duplicate_of_id', null)
          .is('closed_at', null)
          .not('id', 'in', `(${rows.map((r) => r.id).join(',') || '00000000-0000-0000-0000-000000000000'})`)
          .not('category', 'in', `(${NOT_A_DESTINATION.join(',')})`)
          // quality_score alone is not an order: 654 rows share the top value
          // of 95, so ties came back in whatever order Postgres felt like and
          // a spare-room listing outranked Berghain in Berlin. Featured first
          // among equals, then the most recently maintained record.
          .order('quality_score', { ascending: false, nullsFirst: false })
          .order('is_featured', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(limit - rows.length);
        for (const v of (data ?? []) as unknown as VenueRow[]) rows.push(toVenueRow(v, 'local'));
      }

      const localCount = rows.length;

      // Rung 3 — nothing (or not enough) in the region. Fill with content that
      // is explicitly framed as somewhere else, never silently mixed in.
      if (rows.length < limit) {
        const { data } = await supabase
          .from('events')
          .select(EVENT_SELECT)
          .gte('start_date', nowIso)
          .is('duplicate_of_id', null)
          .not('liveness_status', 'in', `(${DEAD_LIVENESS.join(',')})`)
          .order('start_date', { ascending: true })
          .limit(limit - rows.length);
        for (const e of (data ?? []) as unknown as EventRow[]) {
          if (rows.some((r) => r.id === e.id)) continue;
          rows.push(toEventRow(e, 'trip'));
        }
      }

      const tripCount = rows.length - localCount;
      const scope: NearYouScope = cityRows > 0 ? 'city' : localCount > 0 ? 'country' : 'network';

      return { rows: rows.slice(0, limit), scope, localCount, tripCount };
    },
  });
}
