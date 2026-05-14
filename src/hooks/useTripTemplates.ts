import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserTravelPreferences } from '@/hooks/useUserTravelPreferences';

/**
 * Dynamic trip templates surfaced on /trips.
 *
 * Source signals (merged in priority order):
 *   1. `event`     — upcoming featured LGBTQ+ events in the next 90 days.
 *                    Cover photo and cities come directly from the event row.
 *   2. `seasonal`  — curated city pool biased by current month
 *                    (pride season, shoulder season, winter sun).
 *                    Cover photo is hydrated from `cities.image_url`.
 *
 * User-preference templates are a planned extension but require a
 * `profiles.saved_cities` / bookmark surface that doesn't exist yet.
 */

export type TripTemplateSource = 'preference' | 'event' | 'seasonal';

export interface TripTemplate {
  id: string;
  title: string;
  /** Comma-separated city names for display. */
  cities: string;
  /** Resolved city IDs used to pre-populate trip_places after creation. */
  cityIds: string[];
  days: number;
  currency: string;
  coverImageUrl: string | null;
  /** CSS gradient fallback when photo is missing or fails to load. */
  gradient: string;
  source: TripTemplateSource;
}

interface SeasonalSeed {
  key: string;
  title: string;
  citySlugs: string[];
  cityDisplayNames: string[];
  days: number;
  currency: string;
  gradient: string;
  /** 1-indexed months this template is relevant for (inclusive). */
  months: number[];
}

// ── Seasonal pool ─────────────────────────────────────────────────────
// Kept small + curated. The month buckets overlap so there's always
// something to show; the list is filtered to the current month at runtime.

const SEASONAL_POOL: SeasonalSeed[] = [
  // Pride season (Apr–Aug)
  {
    key: 'berlin-pride',
    title: 'Pride Week Berlin',
    citySlugs: ['berlin'],
    cityDisplayNames: ['Berlin'],
    days: 7,
    currency: 'EUR',
    gradient: 'linear-gradient(135deg, #7C3AED 0%, #DB2777 100%)',
    months: [6, 7, 8],
  },
  {
    key: 'amsterdam-cologne',
    title: 'Amsterdam & Cologne Pride Circuit',
    citySlugs: ['amsterdam', 'cologne'],
    cityDisplayNames: ['Amsterdam', 'Cologne'],
    days: 5,
    currency: 'EUR',
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)',
    months: [7, 8],
  },
  {
    key: 'nyc-pride',
    title: 'NYC Pride & Beyond',
    citySlugs: ['new-york-city', 'new-york'],
    cityDisplayNames: ['New York City'],
    days: 5,
    currency: 'USD',
    gradient: 'linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%)',
    months: [6, 7],
  },
  {
    key: 'madrid-orgullo',
    title: 'Madrid Orgullo',
    citySlugs: ['madrid'],
    cityDisplayNames: ['Madrid'],
    days: 5,
    currency: 'EUR',
    gradient: 'linear-gradient(135deg, #F43F5E 0%, #8B5CF6 100%)',
    months: [6, 7],
  },
  {
    key: 'sao-paulo-parada',
    title: 'São Paulo Parada',
    citySlugs: ['sao-paulo'],
    cityDisplayNames: ['São Paulo'],
    days: 5,
    currency: 'BRL',
    gradient: 'linear-gradient(135deg, #10B981 0%, #F59E0B 100%)',
    months: [5, 6],
  },
  // Shoulder (Sep–Nov)
  {
    key: 'sitges-bears',
    title: 'Sitges Bears Week',
    citySlugs: ['sitges'],
    cityDisplayNames: ['Sitges'],
    days: 6,
    currency: 'EUR',
    gradient: 'linear-gradient(135deg, #A16207 0%, #B45309 100%)',
    months: [9],
  },
  {
    key: 'palm-springs-pride',
    title: 'Palm Springs Pride',
    citySlugs: ['palm-springs'],
    cityDisplayNames: ['Palm Springs'],
    days: 4,
    currency: 'USD',
    gradient: 'linear-gradient(135deg, #F97316 0%, #DB2777 100%)',
    months: [10, 11],
  },
  {
    key: 'ptown',
    title: 'Provincetown Weekend',
    citySlugs: ['provincetown'],
    cityDisplayNames: ['Provincetown'],
    days: 4,
    currency: 'USD',
    gradient: 'linear-gradient(135deg, #0EA5E9 0%, #8B5CF6 100%)',
    months: [8, 9, 10],
  },
  // Winter sun (Dec–Mar)
  {
    key: 'bangkok-phuket',
    title: 'Bangkok & Phuket LGBTQ+ Explorer',
    citySlugs: ['bangkok', 'phuket'],
    cityDisplayNames: ['Bangkok', 'Phuket'],
    days: 10,
    currency: 'THB',
    gradient: 'linear-gradient(135deg, #10B981 0%, #6366F1 100%)',
    months: [1, 2, 3, 11, 12],
  },
  {
    key: 'mykonos',
    title: 'Mykonos Island Escape',
    citySlugs: ['mykonos'],
    cityDisplayNames: ['Mykonos'],
    days: 6,
    currency: 'EUR',
    gradient: 'linear-gradient(135deg, #0EA5E9 0%, #6366F1 100%)',
    months: [5, 6, 7, 8, 9],
  },
  {
    key: 'rio-carnival',
    title: 'Rio Carnival',
    citySlugs: ['rio-de-janeiro'],
    cityDisplayNames: ['Rio de Janeiro'],
    days: 7,
    currency: 'BRL',
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #EC4899 100%)',
    months: [2, 3],
  },
  {
    key: 'gran-canaria-winter',
    title: 'Gran Canaria Winter Pride',
    citySlugs: ['las-palmas-de-gran-canaria', 'maspalomas'],
    cityDisplayNames: ['Maspalomas'],
    days: 5,
    currency: 'EUR',
    gradient: 'linear-gradient(135deg, #F97316 0%, #3B82F6 100%)',
    months: [11, 12, 1, 2, 3],
  },
  // Always-on fallback — Barcelona — so a new user in March still sees photos
  {
    key: 'barcelona',
    title: 'Barcelona Beach & Nightlife',
    citySlugs: ['barcelona'],
    cityDisplayNames: ['Barcelona'],
    days: 4,
    currency: 'EUR',
    gradient: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  },
];

const EVENT_GRADIENT = 'linear-gradient(135deg, #DB2777 0%, #7C3AED 100%)';
const PREFERENCE_GRADIENT = 'linear-gradient(135deg, #0EA5E9 0%, #22C55E 100%)';

function pickSeasonal(now: Date): SeasonalSeed[] {
  const m = now.getMonth() + 1;
  const onSeason = SEASONAL_POOL.filter((s) => s.months.includes(m));
  // Always include Barcelona-style fallback if we'd otherwise have nothing.
  return onSeason.length >= 3 ? onSeason : SEASONAL_POOL;
}

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

  return useQuery({
    queryKey: ['trip-templates', new Date().getMonth(), homeCountryId, homeCityId],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<TripTemplate[]> => {
      const now = new Date();
      const horizon = new Date(now.getTime() + 90 * 86_400_000);

      const seasonalSeeds = pickSeasonal(now);
      const allSlugs = Array.from(
        new Set(seasonalSeeds.flatMap((s) => s.citySlugs)),
      );

      // Fetch seasonal city photos + event-driven templates + preference
      // cities (when a home country is set) in parallel.
      const [cityRes, eventRes, prefRes] = await Promise.all([
        allSlugs.length
          ? supabase
              .from('cities')
              .select('id, name, slug, image_url')
              .in('slug', allSlugs)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('events')
          .select(
            'id, title, start_date, end_date, images, city_id, event_type, cities:city_id(id, name, image_url, countries:country_id(currency))',
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
                'id, name, image_url, lgbt_friendly_rating, countries:country_id(currency)',
              )
              .eq('country_id', homeCountryId)
              .eq('is_major_city', true)
              .order('lgbt_friendly_rating', { ascending: false, nullsFirst: false })
              .limit(4)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (cityRes.error) throw cityRes.error;
      // Event lookup is best-effort — if it fails we still surface seasonal
      // templates. Log but don't block.
      if (eventRes.error) {
        console.warn('[useTripTemplates] event fetch failed', eventRes.error);
      }

      const citiesBySlug = new Map<
        string,
        { id: string; name: string; image_url: string | null }
      >();
      for (const c of cityRes.data ?? []) {
        citiesBySlug.set(c.slug, {
          id: c.id,
          name: c.name,
          image_url: c.image_url,
        });
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
          countries: { currency: string | null } | null;
        } | null;
      };
      for (const raw of (eventRes.data ?? []) as unknown as EventRow[]) {
        const city = raw.cities;
        if (!city) continue;
        const cover = raw.images?.[0] ?? city.image_url ?? null;
        eventTemplates.push({
          id: `event:${raw.id}`,
          title: raw.title,
          cities: city.name,
          cityIds: [city.id],
          days: diffDays(raw.start_date, raw.end_date),
          currency: city.countries?.currency ?? 'USD',
          coverImageUrl: cover,
          gradient: EVENT_GRADIENT,
          source: 'event',
        });
      }

      const seasonalTemplates: TripTemplate[] = seasonalSeeds.map((seed) => {
        const resolved = seed.citySlugs
          .map((slug) => citiesBySlug.get(slug))
          .filter((c): c is { id: string; name: string; image_url: string | null } => !!c);
        const cover = resolved.find((c) => c.image_url)?.image_url ?? null;
        return {
          id: `seasonal:${seed.key}`,
          title: seed.title,
          cities: seed.cityDisplayNames.join(', '),
          cityIds: resolved.map((c) => c.id),
          days: seed.days,
          currency: seed.currency,
          coverImageUrl: cover,
          gradient: seed.gradient,
          source: 'seasonal',
        };
      });

      // Preference tier: 1–2 cities in the user's home country (excluding
      // home city). Best-effort — failures don't block other tiers.
      if (prefRes.error) {
        console.warn('[useTripTemplates] preference fetch failed', prefRes.error);
      }
      type PrefRow = {
        id: string;
        name: string;
        image_url: string | null;
        lgbt_friendly_rating: number | null;
        countries: { currency: string | null } | null;
      };
      const preferenceTemplates: TripTemplate[] = (
        (prefRes.data ?? []) as unknown as PrefRow[]
      )
        .filter((c) => c.id !== homeCityId)
        .slice(0, 2)
        .map((c) => ({
          id: `preference:${c.id}`,
          title: `Weekend in ${c.name}`,
          cities: c.name,
          cityIds: [c.id],
          days: 3,
          currency: c.countries?.currency ?? 'USD',
          coverImageUrl: c.image_url,
          gradient: PREFERENCE_GRADIENT,
          source: 'preference',
        }));

      // Dedupe across tiers by cityIds — preference wins, then event, then seasonal.
      const preferenceCityIds = new Set(preferenceTemplates.flatMap((t) => t.cityIds));
      const eventFiltered = eventTemplates.filter((t) =>
        t.cityIds.every((id) => !preferenceCityIds.has(id)),
      );
      const eventCityIds = new Set(eventFiltered.flatMap((t) => t.cityIds));
      const seasonalFiltered = seasonalTemplates.filter((t) =>
        t.cityIds.every(
          (id) => !preferenceCityIds.has(id) && !eventCityIds.has(id),
        ),
      );

      // Preference first (personalized), then events (timeliest), then seasonal.
      return [...preferenceTemplates, ...eventFiltered, ...seasonalFiltered].slice(0, 6);
    },
  });
}
