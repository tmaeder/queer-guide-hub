import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchTrendingCities } from '@/hooks/usePersonalizedCities';

/**
 * Data layer for the Intent Router composite pages.
 *
 * Queries live here rather than in the page components because
 * `queerguide/no-supabase-from-in-pages` (eslint.config.js) restricts
 * `supabase.from()` to src/hooks.
 *
 * Every query below is shaped by measured corpus coverage, not by what the
 * schema permits — see the coverage notes on each hook. The recurring rule:
 * a column that is <5% populated may inform a badge, never a filter, because
 * filtering on it silently discards the other 95%.
 */

/**
 * The venue categories that actually mean "going out".
 *
 * `venues.category` is 59% the literal string 'other' (13,853 of 23,484), so an
 * unfiltered venue query is not a nightlife query. These seven categories are
 * the 7,015 rows that are.
 */
export const NIGHTLIFE_CATEGORIES = [
  'bar',
  'club',
  'cafe',
  'restaurant',
  'sauna',
  'cruising',
  'event-venue',
] as const;

export interface IntentVenue {
  id: string;
  name: string;
  slug: string | null;
  category: string | null;
  city: string | null;
  description: string | null;
  /** `venues.images` is text[]; there is no `image_url` column on this table. */
  images: string[] | null;
  /**
   * Opening hours are present on 609 of 23,484 venues (2.6%). Null is the norm,
   * not a defect — render nothing rather than "hours unknown".
   */
  hours: unknown;
  /**
   * The rest is what VenueCard actually renders. `images` and `hours` were
   * already selected and then thrown away by the caller, which is why /going-out
   * was a text list while the card component sitting next to it could show a
   * photo, an open-now state and a verified badge from the same row.
   */
  state: string | null;
  tags: string[] | null;
  price_range: number | null;
  verified: boolean | null;
  verification_status: string | null;
  closed_at: string | null;
}

/** Nightlife venues for a city, ranked by the site's own quality signal. */
export function useNightlifeVenues(cityId: string | null | undefined, limit = 12) {
  return useQuery({
    queryKey: ['intent-nightlife', cityId, limit],
    enabled: !!cityId,
    staleTime: 300_000,
    queryFn: async (): Promise<IntentVenue[]> => {
      const { data, error } = await supabase
        .from('venues')
        .select(
          'id, name, slug, category, city, state, description, images, hours, tags, price_range, verified, verification_status, closed_at',
        )
        .eq('city_id', cityId!)
        .is('duplicate_of_id', null)
        .in('category', NIGHTLIFE_CATEGORIES as unknown as string[])
        .order('quality_score', { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as IntentVenue[];
    },
  });
}

export interface IntentEvent {
  id: string;
  title: string;
  slug: string | null;
  start_date: string;
  city: string | null;
}

/** Which rung of the fallback ladder produced the events we are showing. */
export type EventWindow = 'tonight' | 'this-weekend' | 'next-7-days' | 'next-30-days' | 'anywhere';

/** What useEventsWithFallback resolves to. Named so shared consumers (see
 *  components/intent/UpcomingEvents) do not restate the shape and drift. */
export interface EventsWithFallback {
  events: IntentEvent[];
  window: EventWindow;
}

const WINDOW_DAYS: Record<Exclude<EventWindow, 'anywhere'>, number> = {
  tonight: 1,
  'this-weekend': 3,
  'next-7-days': 7,
  'next-30-days': 30,
};

/**
 * Events for a city, widening the time window until something is found.
 *
 * There are 315 future events in the entire corpus — 18 within the next 7 days,
 * across 130 cities — so the median city has nothing on tonight. A fixed
 * "tonight" query would render an empty grid on almost every city page. This
 * returns the window it actually landed on so the UI can say so plainly, and
 * falls back to the soonest events anywhere rather than to nothing.
 */
export function useEventsWithFallback(cityId: string | null | undefined, limit = 6) {
  return useQuery({
    queryKey: ['intent-events-fallback', cityId, limit],
    staleTime: 300_000,
    queryFn: async (): Promise<EventsWithFallback> => {
      const select = 'id, title, slug, start_date, city';
      const now = new Date().toISOString();

      if (cityId) {
        for (const w of ['tonight', 'this-weekend', 'next-7-days', 'next-30-days'] as const) {
          const until = new Date(Date.now() + WINDOW_DAYS[w] * 86_400_000).toISOString();
          const { data, error } = await supabase
            .from('events')
            .select(select)
            .eq('city_id', cityId)
            .gte('start_date', now)
            .lte('start_date', until)
            .order('start_date', { ascending: true })
            .limit(limit);
          if (error) throw error;
          if (data && data.length > 0) return { events: data as IntentEvent[], window: w };
        }
      }

      // Nothing in this city in the next 30 days (the common case). Show the
      // soonest events anywhere instead of an empty state.
      const { data, error } = await supabase
        .from('events')
        .select(select)
        .gte('start_date', now)
        .order('start_date', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return { events: (data ?? []) as IntentEvent[], window: 'anywhere' };
    },
  });
}

export interface MeetSpace {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  /** 'venue' rows link to /venues/:slug, 'village' rows to /place/:slug. */
  kind: 'venue' | 'village';
}

/** Which rung of the fallback ladder produced the spaces we are showing. */
export type MeetScope = 'city' | 'country' | 'none';

/**
 * Places whose whole purpose is meeting people: community centres and the
 * queer villages/neighbourhoods that anchor a scene.
 *
 * Coverage is narrow but real: 175 venues carry `category = 'community_center'`
 * (171 with a city, across 120 cities) and 190 `queer_villages` rows all carry
 * both a city and a country, across 104 cities. So a given city usually has
 * neither, and the ladder falls back to the country.
 *
 * There is deliberately **no global rung**. Events widen to "soonest anywhere"
 * because a festival worth travelling to is still useful; a community centre
 * 5,000 km away is not. When the country rung is empty this returns nothing and
 * the page falls through to its "Elsewhere" cities section instead.
 */
export function useMeetSpaces(
  cityId: string | null | undefined,
  countryCode: string | null | undefined,
  limit = 8,
) {
  return useQuery({
    queryKey: ['intent-meet-spaces', cityId, countryCode, limit],
    staleTime: 300_000,
    queryFn: async (): Promise<{ spaces: MeetSpace[]; scope: MeetScope }> => {
      const venueCols = 'id, name, slug, description';
      const villageCols = 'id, name, slug, description';

      const collect = async (
        column: 'city_id' | 'country_id',
        value: string,
      ): Promise<MeetSpace[]> => {
        const [venues, villages] = await Promise.all([
          supabase
            .from('venues')
            .select(venueCols)
            .eq('category', 'community_center')
            .eq(column, value)
            .is('duplicate_of_id', null)
            .order('quality_score', { ascending: false, nullsFirst: false })
            .limit(limit),
          supabase
            .from('queer_villages')
            .select(villageCols)
            .eq(column, value)
            .is('duplicate_of_id', null)
            .order('trust_score', { ascending: false, nullsFirst: false })
            .limit(limit),
        ]);
        if (venues.error) throw venues.error;
        if (villages.error) throw villages.error;
        return [
          ...((villages.data ?? []) as Omit<MeetSpace, 'kind'>[]).map((v): MeetSpace => ({
            ...v,
            kind: 'village',
          })),
          ...((venues.data ?? []) as Omit<MeetSpace, 'kind'>[]).map((v): MeetSpace => ({
            ...v,
            kind: 'venue',
          })),
        ].slice(0, limit);
      };

      if (cityId) {
        const spaces = await collect('city_id', cityId);
        if (spaces.length > 0) return { spaces, scope: 'city' };
      }

      if (countryCode) {
        // Resolve the country id the same way useIntentLocation does; both
        // venues and queer_villages key on country_id, not on the ISO code.
        const { data: country } = await supabase
          .from('countries')
          .select('id')
          .ilike('code', countryCode)
          .maybeSingle();
        if (country?.id) {
          const spaces = await collect('country_id', country.id as string);
          if (spaces.length > 0) return { spaces, scope: 'country' };
        }
      }

      return { spaces: [], scope: 'none' };
    },
  });
}

export interface LocalGroup {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  member_count: number | null;
  tags: string[] | null;
}

/**
 * Public community groups, most-joined first.
 *
 * **Deliberately not city-scoped.** `community_groups.city` is populated on 0 of
 * the 11 rows, so filtering on it would return an empty list in every city on
 * the site — the "a sparsely populated column may inform a badge, never a
 * filter" rule at the top of this file, in its most extreme form. When the
 * column starts being written, add a city rung here and not before.
 */
export function useLocalGroups(limit = 6) {
  return useQuery({
    queryKey: ['intent-local-groups', limit],
    staleTime: 300_000,
    queryFn: async (): Promise<LocalGroup[]> => {
      const { data, error } = await supabase
        .from('community_groups')
        .select('id, name, description, image_url, member_count, tags')
        .eq('is_private', false)
        .is('duplicate_of_id', null)
        .order('member_count', { ascending: false, nullsFirst: false })
        .order('last_activity_at', { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as LocalGroup[];
    },
  });
}

export interface RightsCountry {
  id: string;
  name: string;
  slug: string | null;
  code: string | null;
  equality_score: number | null;
  /** jsonb — shaped for the helpers in src/utils/equalityScore.ts. */
  lgbti_criminalization: Record<string, unknown> | null;
  lgbti_same_sex_unions: Record<string, unknown> | null;
}

/**
 * Every country, with its legal status.
 *
 * This is the best-covered dataset on the site: 250 of 250 countries carry
 * `lgbti_criminalization` and 239 carry an `equality_score`. It is fetched
 * directly rather than through the search proxy because `search_hybrid` has no
 * numeric-range filter, so "equality_score < 40" is not expressible there.
 * `useTripSafety` already sets this precedent.
 */
/**
 * `id, name, slug, code, equality_score` plus every column named by
 * RIGHT_TOPICS.
 *
 * Written out rather than derived from the catalog on purpose. Importing
 * rightsCatalog here pulled its 14 lucide icon modules into useIntentData,
 * which every intent page imports — it slowed the full-router test render from
 * 12.5s to 20.2s and tipped cmsPageRouting over its 15s timeout. A data hook
 * should not depend on a module that exists to carry icons.
 *
 * The guarantee that this list stays complete moved to a test
 * (src/lib/rights/__tests__/rightsColumns.test.ts), which fails if a topic is
 * added to the catalog without being added here. Same protection, no import.
 */
// One `as const` literal, NOT [...].join(', '). PostgREST's typegen resolves
// columns from the literal type of the select string; building it at runtime
// widens it to `string`, inference collapses to GenericStringError[] and the
// row cast below becomes a TS2352. Caught by the typecheck ratchet.
export const RIGHTS_SELECT_COLUMNS =
  'id, name, slug, code, equality_score, lgbti_criminalization, lgbti_expression_restrictions, lgbti_association_restrictions, lgbti_constitutional_protection, lgbti_employment_protection, lgbti_housing_protection, lgbti_education_protection, lgbti_health_protection, lgbti_goods_services_protection, lgbti_bullying_protection, lgbti_hate_crime_law, lgbti_incitement_prohibition, lgbti_same_sex_unions, lgbti_adoption_rights, lgbti_gender_recognition, lgbti_conversion_therapy_regulation, lgbti_intersex_protection' as const;

/**
 * The NARROW fetch: what /travel and /rights/sources actually read.
 *
 * /travel uses this only to locate the visitor's country, count criminalising
 * ones and show a total — three fields. It must not pay for the 22-column
 * payload the /rights summary needs; widening the shared hook made a
 * high-traffic entry page download 250 rows of jsonb protection matrices to
 * render a number.
 */
export function useAllCountriesRights() {
  return useQuery({
    queryKey: ['intent-rights-countries', 'core'],
    staleTime: 600_000,
    queryFn: async (): Promise<RightsCountry[]> => {
      const { data, error } = await supabase
        .from('countries')
        .select(
          'id, name, slug, code, equality_score, lgbti_criminalization, lgbti_same_sex_unions',
        )
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RightsCountry[];
    },
  });
}

/**
 * The WIDE fetch: every column RIGHT_TOPICS names, for the /rights per-right
 * summary. Separate query key, so the two are cached independently and no
 * other page inherits the cost.
 */
export function useAllCountriesRightsFull() {
  return useQuery({
    queryKey: ['intent-rights-countries', 'full'],
    staleTime: 600_000,
    queryFn: async (): Promise<RightsCountry[]> => {
      const { data, error } = await supabase
        .from('countries')
        // Written out rather than derived from RIGHT_TOPICS — importing the
        // catalog here dragged its lucide icons into every intent page.
        // rightsColumns.test.ts is what stops the two drifting.
        .select(RIGHTS_SELECT_COLUMNS)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RightsCountry[];
    },
  });
}

/**
 * Cities worth recommending as destinations.
 *
 * Deliberately delegates to the existing `fetchTrendingCities`, which leads with
 * an editorial whitelist. There is no denormalised venue count on `cities`, and
 * only 71 of the 2,230 cities that have any venue have 50 or more — so a naive
 * "cities that have venues" ranking would present cities with three listings as
 * nightlife destinations.
 */
export function useDestinationCities(limit = 8) {
  return useQuery({
    queryKey: ['intent-destination-cities', limit],
    staleTime: 600_000,
    queryFn: () => fetchTrendingCities(200_000, limit),
  });
}

// `VerifiedBrand` + `useVerifiedOwnedBrands` moved to
// src/hooks/useMarketplaceBrands.ts when /shop folded into /marketplace. This
// file is the data layer for the Intent Router composite pages; with no intent
// page consuming it, a marketplace query living here only invites the next
// person to import intent data into a marketplace component.

/** Recent news scoped to a country, for the intent pages' news sections. */
export function useIntentNews(countryId: string | null | undefined, limit = 5) {
  return useQuery({
    queryKey: ['intent-news', countryId, limit],
    staleTime: 300_000,
    queryFn: async (): Promise<
      { id: string; title: string; slug: string | null; published_at: string | null }[]
    > => {
      let q = supabase
        .from('news_articles')
        .select('id, title, slug, published_at')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(limit);
      if (countryId) q = q.contains('country_ids', [countryId]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        title: string;
        slug: string | null;
        published_at: string | null;
      }[];
    },
  });
}
