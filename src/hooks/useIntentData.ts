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
        .select('id, name, slug, category, city, description, images, hours')
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
    queryFn: async (): Promise<{ events: IntentEvent[]; window: EventWindow }> => {
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
export function useAllCountriesRights() {
  return useQuery({
    queryKey: ['intent-rights-countries'],
    staleTime: 600_000,
    queryFn: async (): Promise<RightsCountry[]> => {
      const { data, error } = await supabase
        .from('countries')
        .select('id, name, slug, code, equality_score, lgbti_criminalization, lgbti_same_sex_unions')
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

export interface VerifiedBrand {
  id: string;
  /** `marketplace_brands` has no `name` column — the label is `display_name`. */
  display_name: string | null;
  brand_key: string;
  slug: string | null;
  logo_url: string | null;
  product_count: number | null;
  ownership_tags: string[] | null;
}

/**
 * Brands we have actually verified as queer-owned.
 *
 * 24 of 2,583 brands carry `ownership_tags` (0.93%). That is why the marketplace
 * is labelled "Shop" and not "queer-owned": ownership is a property of the rows
 * below, never an adjective for the catalogue. The count is rendered literally
 * so the claim stays checkable.
 */
export function useVerifiedOwnedBrands(limit = 24) {
  return useQuery({
    queryKey: ['intent-verified-brands', limit],
    staleTime: 600_000,
    queryFn: async (): Promise<VerifiedBrand[]> => {
      const { data, error } = await supabase
        .from('marketplace_brands')
        .select('id, display_name, brand_key, slug, logo_url, product_count, ownership_tags')
        .not('ownership_tags', 'is', null)
        .order('product_count', { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) throw error;
      return ((data ?? []) as VerifiedBrand[]).filter(
        (b) => Array.isArray(b.ownership_tags) && b.ownership_tags.length > 0,
      );
    },
  });
}

/** Marketplace categories for the Shop browse section. */
export function useShopCategories(limit = 18) {
  return useQuery({
    queryKey: ['intent-shop-categories', limit],
    staleTime: 600_000,
    queryFn: async (): Promise<{ id: string; name: string; slug: string | null }[]> => {
      const { data, error } = await supabase
        .from('marketplace_categories')
        .select('id, name, slug')
        .order('name', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; slug: string | null }[];
    },
  });
}

/** Recent news scoped to a country, for the intent pages' news sections. */
export function useIntentNews(countryId: string | null | undefined, limit = 5) {
  return useQuery({
    queryKey: ['intent-news', countryId, limit],
    staleTime: 300_000,
    queryFn: async (): Promise<{ id: string; title: string; slug: string | null; published_at: string | null }[]> => {
      let q = supabase
        .from('news_articles')
        .select('id, title, slug, published_at')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(limit);
      if (countryId) q = q.contains('country_ids', [countryId]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as { id: string; title: string; slug: string | null; published_at: string | null }[];
    },
  });
}
