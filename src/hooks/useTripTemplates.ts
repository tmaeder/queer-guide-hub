import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserTravelPreferences } from '@/hooks/useUserTravelPreferences';
import { useLineStationPool } from '@/hooks/useLineStationPool';
import { stationMeetsVibe, vibeCount } from '@/lib/lines/vibes';
import { seasonWindows } from '@/lib/lines/seasons';
import { VIBE_IDS, type Station, type VibeId } from '@/lib/lines/generateLine';
import { qk } from '@/lib/queryKeys';

/**
 * Trip templates surfaced on /travel and /trips/discover.
 *
 * Three tiers, merged in priority order:
 *   1. `preference` — cities in the user's home country.
 *   2. `event`      — upcoming featured LGBTQ+ events in the next 90 days.
 *   3. `seasonal`   — DERIVED, one per vibe, from the same station pool the
 *                     /trips/discover line generator uses.
 *
 * WHAT TIER 3 REPLACED, AND WHY
 *
 * Until 2026-08-31 the seasonal tier was `SEASONAL_POOL`: eleven hardcoded
 * cities, addressed by hardcoded slug, each with a hardcoded month list and a
 * hardcoded CSS gradient. It had three problems and only the first was visible.
 *
 *   a. It rotted silently. Five of its slugs resolved to nothing — `mykonos`,
 *      `sao-paulo`, `phuket`, `las-palmas-de-gran-canaria`, `new-york-city` —
 *      and the file had grown a comment about dropping them rather than a way
 *      of not having them. A curated list of foreign keys is a list of things
 *      that will one day not exist.
 *   b. It was unfalsifiable. "Bangkok in the dry season" made a claim about a
 *      city this platform had no measured basis for, and nothing checked it.
 *   c. It could not be personalised, because there were no parameters — a
 *      template was a title, not a description of what the traveller wanted.
 *
 * The replacement is a parameter triple: (vibe, station, season window). Every
 * part is measured. The station comes from `line_station_pool`, which already
 * gates on image + prose + safety notes + coordinates + ten live venues, so a
 * template cannot point at a city that has nothing in it — and because that
 * function is SECURITY INVOKER, an anonymous reader is never offered a city
 * whose scene the safety layer has decided not to show them. The vibe count is
 * the real venue count. The days come from the season window.
 *
 * `gradient` is gone with the list. Every station carries an image by
 * definition of the pool, so the chromatic fallback had nothing left to fall
 * back from, and the monochrome rule says a card is paper and a photo, not a
 * colour wash.
 */

export type TripTemplateSource = 'preference' | 'event' | 'seasonal';

export interface TripTemplate {
  id: string;
  title: string;
  /** Comma-separated city names for display. */
  cities: string;
  /** Resolved city IDs used to pre-populate trip_places after creation. */
  cityIds: string[];
  /**
   * Country of the FIRST resolved city. `trips.primary_city_id` and
   * `primary_country_id` are both NOT NULL, and until 2026-08 this type carried
   * neither — so "Use Template" sent an INSERT missing two non-nullable columns
   * and raised 23502 on every single click, for the whole life of the feature.
   * The unit test mocked `createTrip`, so nothing caught it.
   *
   * A template with no resolved city cannot supply these and is dropped rather
   * than shipped as a button that cannot work.
   */
  primaryCityId: string;
  primaryCountryId: string;
  days: number;
  currency: string;
  coverImageUrl: string | null;
  source: TripTemplateSource;
  /**
   * The parameters this template was derived from, carried through to the trip
   * so the itinerary generator starts from the same picks the reader made.
   * Null on the tiers that are not vibe-driven.
   */
  vibe: VibeId | null;
  /** A measured line about why this is here. Never a claim we cannot check. */
  reason: string | null;
}

/**
 * The seasonal tier, derived.
 *
 * One template per vibe, each anchored on the strongest station for that vibe.
 * "Strongest" is the real venue count from the pool, and a station that does
 * not clear the vibe's floor is not offered at all — below the floor a city has
 * a bar, not a scene, and sending somebody across a border for one venue is the
 * exact failure the floors exist to prevent.
 *
 * A station is preferred when it has an event inside the current season window,
 * because that is a reason the reader can check. It is not REQUIRED to: the
 * event corpus is a pride-season corpus (see `seasons.ts` — eight of the next
 * sixteen months carry almost nothing), so requiring an event would empty this
 * tier for half the year and make it look like the platform had shut down.
 * When there is no event the template says what it does have — the venue count
 * — rather than implying something is on.
 */
function deriveSeasonalTemplates(pool: Station[], now: Date): TripTemplate[] {
  if (pool.length === 0) return [];
  const window = seasonWindows(now)[0];
  const inWindow = new Set(window.months);
  const used = new Set<string>();
  const out: TripTemplate[] = [];

  for (const vibe of VIBE_IDS) {
    const eligible = pool
      .filter((s) => stationMeetsVibe(s, vibe) && !used.has(s.id) && !!s.countryId)
      .sort((a, b) => {
        // An event in the window is the strongest reason to surface a city, so
        // it outranks raw count — but only as a sort key, never as a filter.
        const aHas = a.eventMonths.some((m) => inWindow.has(m)) ? 1 : 0;
        const bHas = b.eventMonths.some((m) => inWindow.has(m)) ? 1 : 0;
        if (aHas !== bHas) return bHas - aHas;
        return vibeCount(b, vibe) - vibeCount(a, vibe);
      });

    const station = eligible[0];
    if (!station) continue;
    used.add(station.id);

    const hasEvent = station.eventMonths.some((m) => inWindow.has(m));
    out.push({
      id: `seasonal:${vibe}:${station.id}`,
      title: `${VIBE_TITLE[vibe]} in ${station.name}`,
      cities: station.name,
      cityIds: [station.id],
      primaryCityId: station.id,
      primaryCountryId: station.countryId,
      days: 4,
      currency: station.currency ?? 'USD',
      coverImageUrl: station.imageUrl,
      source: 'seasonal',
      vibe,
      reason:
        hasEvent && station.nextEventTitle
          ? station.nextEventTitle
          : `${vibeCount(station, vibe)} places listed`,
    });
  }
  return out;
}

const VIBE_TITLE: Record<VibeId, string> = {
  nightlife: 'Nightlife',
  sauna: 'Saunas',
  slow: 'Slow days',
  community: 'Community',
  outdoors: 'Outdoors',
};

function diffDays(start: string, end: string | null): number {
  if (!end) return 3;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 3;
  return Math.max(2, Math.round((e - s) / 86_400_000) + 1);
}

export function useTripTemplates() {
  const { data: prefs } = useUserTravelPreferences();
  const homeCountryId = prefs?.home_country_id ?? null;
  const homeCityId = prefs?.home_city_id ?? null;

  // The pool is already fetched and cached for an hour by /trips/discover, and
  // its query key carries the signed-in flag for the SECURITY INVOKER reason
  // documented there. Reusing the hook means this surface shares that cache
  // rather than opening a second, differently-gated copy of the same 346 rows.
  const { data: pool } = useLineStationPool();

  const remote = useQuery({
    queryKey: qk.trip.templates(new Date().getMonth(), homeCountryId, homeCityId),
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<TripTemplate[]> => {
      const now = new Date();
      const horizon = new Date(now.getTime() + 90 * 86_400_000);

      const [eventRes, prefRes] = await Promise.all([
        supabase
          .from('events')
          .select(
            'id, title, start_date, end_date, images, city_id, event_type, cities(id, name, image_url, country_id, countries:country_id(currency))',
          )
          .eq('is_featured', true)
          .gte('start_date', now.toISOString().slice(0, 10))
          .lte('start_date', horizon.toISOString().slice(0, 10))
          .or('event_type.ilike.%pride%,event_type.ilike.%festival%')
          .order('start_date', { ascending: true })
          .limit(3),
        homeCountryId
          ? supabase
              .from('cities')
              .select(
                'id, name, image_url, country_id, lgbt_friendly_rating, countries:country_id(currency)',
              )
              .eq('country_id', homeCountryId)
              .eq('is_major_city', true)
              .order('lgbt_friendly_rating', { ascending: false, nullsFirst: false })
              .limit(4)
          : Promise.resolve({ data: [], error: null }),
      ]);

      // Event lookup is best-effort — if it fails we still surface seasonal
      // templates. Log but don't block.
      if (eventRes.error) {
        console.warn('[useTripTemplates] event fetch failed', eventRes.error);
      }

      const eventTemplates: TripTemplate[] = [];
      type EventRow = {
        id: string;
        title: string;
        start_date: string;
        end_date: string | null;
        images: string[] | null;
        city_id: string | null;
        cities: {
          id: string;
          name: string;
          image_url: string | null;
          country_id: string | null;
          countries: { currency: string | null } | null;
        } | null;
      };
      for (const raw of (eventRes.data ?? []) as unknown as EventRow[]) {
        const city = raw.cities;
        if (!city?.country_id) continue;
        const cover = raw.images?.[0] ?? city.image_url ?? null;
        eventTemplates.push({
          id: `event:${raw.id}`,
          title: raw.title,
          cities: city.name,
          cityIds: [city.id],
          primaryCityId: city.id,
          primaryCountryId: city.country_id,
          days: diffDays(raw.start_date, raw.end_date),
          currency: city.countries?.currency ?? 'USD',
          coverImageUrl: cover,
          source: 'event',
          vibe: null,
          reason: raw.start_date.slice(0, 10),
        });
      }

      // Preference tier: 1–2 cities in the user's home country (excluding
      // home city). Best-effort — failures don't block other tiers.
      if (prefRes.error) {
        console.warn('[useTripTemplates] preference fetch failed', prefRes.error);
      }
      type PrefRow = {
        id: string;
        name: string;
        image_url: string | null;
        country_id: string | null;
        lgbt_friendly_rating: number | null;
        countries: { currency: string | null } | null;
      };
      const preferenceTemplates: TripTemplate[] = ((prefRes.data ?? []) as unknown as PrefRow[])
        .filter((c) => c.id !== homeCityId && !!c.country_id)
        .slice(0, 2)
        .map((c) => ({
          id: `preference:${c.id}`,
          title: `Weekend in ${c.name}`,
          cities: c.name,
          cityIds: [c.id],
          primaryCityId: c.id,
          primaryCountryId: c.country_id as string,
          days: 3,
          currency: c.countries?.currency ?? 'USD',
          coverImageUrl: c.image_url,
          source: 'preference',
          vibe: null,
          reason: null,
        }));

      // Only the two remote tiers here. The seasonal tier is derived from the
      // station pool, which is a different query with a different cache key —
      // merging happens in the hook body so this one can resolve without
      // waiting on it, and so a pool failure degrades the tier rather than the
      // whole surface.
      return [...preferenceTemplates, ...eventTemplates];
    },
  });

  return useMemo(() => {
    const remoteTemplates = remote.data ?? [];
    const seasonal = deriveSeasonalTemplates(pool ?? [], new Date());

    // Dedupe across tiers by city — preference wins, then event, then seasonal.
    // A reader offered the same city twice reads the second card as a bug.
    const claimed = new Set<string>();
    const merged: TripTemplate[] = [];
    for (const tpl of [...remoteTemplates, ...seasonal]) {
      if (tpl.cityIds.some((id) => claimed.has(id))) continue;
      for (const id of tpl.cityIds) claimed.add(id);
      merged.push(tpl);
    }

    return {
      ...remote,
      data: merged.slice(0, 6),
      // The surface is usable as soon as either source arrives; it is only
      // genuinely loading while BOTH are empty.
      isLoading: remote.isLoading && seasonal.length === 0,
    };
  }, [remote, pool]);
}
