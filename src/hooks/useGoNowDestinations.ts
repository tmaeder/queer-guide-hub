import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchTrendingCities, type PersonalizedCityRow } from './usePersonalizedCities';

export interface GoNowReason {
  kind: 'event' | 'season' | 'trending';
  label: string;
}

export interface GoNowDestination {
  cityId: string;
  name: string;
  slug: string | null;
  imageUrl: string | null;
  editorialHook: string | null;
  countryName: string | null;
  equalityScore: number | null;
  reason: GoNowReason;
}

interface GoNowEventRow {
  title: string;
  start_date: string | null;
  end_date: string | null;
  city: {
    id: string;
    name: string;
    slug: string | null;
    image_url: string | null;
    editorial_hook: string | null;
  } | null;
  country: { name: string; equality_score: number | null } | null;
}

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };

/** "8–17 Aug" / "22 Aug" — compact range for a card reason line. */
export function formatEventDateLabel(start: string | null, end: string | null): string {
  if (!start) return '';
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return '';
  const e = end ? new Date(end) : null;
  const fmt = (d: Date) => d.toLocaleDateString(undefined, DAY_MONTH);
  if (!e || Number.isNaN(e.getTime()) || fmt(e) === fmt(s)) return fmt(s);
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}–${e.getDate()} ${s.toLocaleDateString(undefined, { month: 'short' })}`;
  }
  return `${fmt(s)} – ${fmt(e)}`;
}

/**
 * Does a free-text `best_time_to_visit` mention the given month?
 * Display hint only — the sparse column is never used as a filter
 * (coverage rule: a badge, never a filter).
 */
export function monthMatchesBestTime(text: string | null | undefined, now: Date): boolean {
  if (!text) return false;
  const long = now.toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
  const abbr = long.slice(0, 3);
  const hay = text.toLowerCase();
  return hay.includes(long) || new RegExp(`\\b${abbr}\\b`, 'i').test(text);
}

/** Soonest event per city, preserving the query's ascending date order. */
export function groupEventsByCity(rows: GoNowEventRow[]): GoNowDestination[] {
  const seen = new Set<string>();
  const out: GoNowDestination[] = [];
  for (const row of rows) {
    const city = row.city;
    if (!city || seen.has(city.id)) continue;
    seen.add(city.id);
    const dates = formatEventDateLabel(row.start_date, row.end_date);
    out.push({
      cityId: city.id,
      name: city.name,
      slug: city.slug,
      imageUrl: city.image_url,
      editorialHook: city.editorial_hook,
      countryName: row.country?.name ?? null,
      equalityScore: row.country?.equality_score ?? null,
      reason: { kind: 'event', label: dates ? `${row.title} · ${dates}` : row.title },
    });
  }
  return out;
}

/** Event cities lead; trending cities fill, deduped, until `limit`. */
export function mergeGoNowDestinations(
  eventCities: GoNowDestination[],
  fillCities: PersonalizedCityRow[],
  limit: number,
  now: Date,
): GoNowDestination[] {
  const out = eventCities.slice(0, limit);
  const seen = new Set(out.map((d) => d.cityId));
  for (const city of fillCities) {
    if (out.length >= limit) break;
    if (seen.has(city.id)) continue;
    seen.add(city.id);
    out.push({
      cityId: city.id,
      name: city.name,
      slug: city.slug,
      imageUrl: city.image_url,
      editorialHook: city.editorial_hook,
      countryName: city.countries?.name ?? null,
      equalityScore: city.countries?.equality_score ?? null,
      reason: monthMatchesBestTime(city.best_time_to_visit, now)
        ? { kind: 'season', label: city.best_time_to_visit! }
        : { kind: 'trending', label: 'Trending now' },
    });
  }
  return out;
}

/**
 * Month-aware "go now" destinations: cities hosting a pride/festival in the
 * next two months lead (soonest event per city), whitelist-backed trending
 * cities fill the rest — so the rail is never empty even in a thin month.
 */
export function useGoNowDestinations(limit = 6) {
  const month = new Date().getMonth();
  return useQuery({
    queryKey: ['go-now-destinations', month, limit],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<GoNowDestination[]> => {
      const now = new Date();
      const end = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
      const { data } = await supabase
        .from('events')
        .select(
          `title, start_date, end_date,
           city:cities(id, name, slug, image_url, editorial_hook),
           country:countries(name, equality_score)`,
        )
        .or('event_type.ilike.%pride%,event_type.ilike.%festival%')
        .gte('start_date', now.toISOString())
        .lte('start_date', end.toISOString())
        .is('duplicate_of_id', null)
        .not('city_id', 'is', null)
        .order('start_date', { ascending: true })
        .limit(24);

      const eventCities = groupEventsByCity((data ?? []) as unknown as GoNowEventRow[]);
      const fill =
        eventCities.length >= limit ? [] : await fetchTrendingCities(200_000, limit * 2);
      return mergeGoNowDestinations(eventCities, fill, limit, now);
    },
  });
}
