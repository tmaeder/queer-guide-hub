import { supabase } from '@/integrations/supabase/client';

export interface PersonalizedCityRow {
  id: string;
  name: string;
  slug: string | null;
  image_url: string | null;
  is_capital?: boolean | null;
  is_regional_capital?: boolean | null;
  population: number | null;
  editorial_hook: string | null;
  best_time_to_visit: string | null;
  countries: { name: string; equality_score: number | null } | null;
}

export async function fetchPersonalizedCitiesByIds(
  cityIds: string[],
): Promise<PersonalizedCityRow[]> {
  if (cityIds.length === 0) return [];
  const { data, error } = await supabase
    .from('cities')
    .select(
      'id, name, slug, image_url, is_capital, is_regional_capital, population, editorial_hook, best_time_to_visit, countries:country_id(name, equality_score)',
    )
    .is('duplicate_of_id', null)
    .in('id', cityIds);
  if (error) throw error;
  return (data ?? []) as unknown as PersonalizedCityRow[];
}

/** The most populous cities in one country — the homepage's "near you" set. */
export async function fetchCountryCities(
  countryId: string,
  limit: number,
): Promise<PersonalizedCityRow[]> {
  const { data, error } = await supabase
    .from('cities')
    .select(
      'id, name, slug, image_url, is_capital, is_regional_capital, population, editorial_hook, best_time_to_visit, countries:country_id(name, equality_score)',
    )
    .eq('country_id', countryId)
    .is('duplicate_of_id', null)
    .not('slug', 'like', 'tmp-%')
    .order('population', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as PersonalizedCityRow[];
}

// Editorial whitelist — the cities actual queer travelers care about. Order
// is significant: matches are surfaced in the order listed here, so Berlin /
// Madrid / Mexico City beat whichever mid-size US city happens to win a raw
// `ORDER BY population DESC` race (e.g. Norfolk slipping in ahead of NYC
// because NYC isn't in the cities table at that population grade).
const FEATURED_CITY_WHITELIST = [
  'Berlin',
  'Madrid',
  'Barcelona',
  'Amsterdam',
  'Mexico City',
  'Bangkok',
  'Tel Aviv',
  'Lisbon',
  'Buenos Aires',
  'Toronto',
  'Montreal',
  'San Francisco',
  'New York',
  'Los Angeles',
  'London',
  'Paris',
  'Cape Town',
  'Sydney',
  'Melbourne',
  'Reykjavik',
  'Copenhagen',
  'Stockholm',
  'Brussels',
  'Vienna',
];

export async function fetchTrendingCities(
  minPopulation = 200000,
  limit = 6,
): Promise<PersonalizedCityRow[]> {
  // 1. Editorial whitelist by name, preserving curated order.
  const { data: whitelisted, error: whitelistError } = await supabase
    .from('cities')
    .select(
      'id, name, slug, image_url, is_capital, is_regional_capital, population, editorial_hook, best_time_to_visit, countries:country_id(name, equality_score)',
    )
    .in('name', FEATURED_CITY_WHITELIST)
    .is('duplicate_of_id', null)
    .not('slug', 'like', 'tmp-%');
  if (whitelistError) throw whitelistError;

  // Several DB cities can share a whitelist name (Berlin DE vs Berlin US) —
  // keep the most populous match so the famous one wins.
  const byName = new Map<string, PersonalizedCityRow>();
  for (const row of (whitelisted ?? []) as unknown as PersonalizedCityRow[]) {
    const cur = byName.get(row.name);
    if (!cur || (row.population ?? 0) > (cur.population ?? 0)) byName.set(row.name, row);
  }
  const ordered: PersonalizedCityRow[] = [];
  for (const name of FEATURED_CITY_WHITELIST) {
    const row = byName.get(name);
    if (row) ordered.push(row);
    if (ordered.length >= limit) break;
  }
  if (ordered.length >= limit) return ordered;

  // 2. Fallback — large cities in equality-friendly countries (>= 60).
  const { data: filtered, error: filteredError } = await supabase
    .from('cities')
    .select(
      'id, name, slug, image_url, is_capital, is_regional_capital, population, editorial_hook, best_time_to_visit, countries:country_id!inner(name, equality_score)',
    )
    .is('duplicate_of_id', null)
    .not('slug', 'like', 'tmp-%')
    .gte('population', minPopulation)
    .gte('countries.equality_score', 60)
    .order('population', { ascending: false })
    .limit(limit);
  if (filteredError) throw filteredError;
  const seenIds = new Set(ordered.map((r) => r.id));
  for (const row of (filtered ?? []) as unknown as PersonalizedCityRow[]) {
    if (!seenIds.has(row.id)) ordered.push(row);
    if (ordered.length >= limit) break;
  }
  return ordered;
}

/** A country or queer village shown beside cities in the homepage guides band. */
export interface HomePlaceRow {
  id: string;
  name: string;
  slug: string | null;
  image_url: string | null;
  editorial_hook: string | null;
  /** Village rows only: the city it sits in. */
  cityName?: string | null;
  /** Country rows only: ISO-3166 alpha-2, for the outline map. */
  code?: string | null;
}

/**
 * Countries for the guides band: the visitor's own first when known, then the
 * highest equality scores (most complete first on a tie). Ghost and merged rows are never shown.
 */
export async function fetchHomeCountries(
  limit: number,
  preferId?: string | null,
): Promise<HomePlaceRow[]> {
  const cols = 'id, name, slug, image_url, editorial_hook, code';
  const [preferred, top] = await Promise.all([
    preferId
      ? supabase.from('countries').select(cols).eq('id', preferId).is('duplicate_of_id', null)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('countries')
      .select(cols)
      .is('duplicate_of_id', null)
      .eq('seo_indexable', true)
      .gte('equality_score', 75)
      .order('equality_score', { ascending: false })
      .order('content_completeness_score', { ascending: false, nullsFirst: false })
      .limit(limit + 1),
  ]);
  if (preferred.error) throw preferred.error;
  if (top.error) throw top.error;
  const rows = [...(preferred.data ?? []), ...(top.data ?? [])] as HomePlaceRow[];
  const out = [...new Map(rows.map((r) => [r.id, r])).values()].slice(0, limit);
  // Most countries carry no photo of their own; borrow the largest pictured
  // city's, so a country card leads with a photo like the city cards do.
  const bare = out.filter((r) => !r.image_url).map((r) => r.id);
  if (bare.length) {
    const { data } = await supabase
      .from('cities')
      .select('country_id, image_url')
      .in('country_id', bare)
      .not('image_url', 'is', null)
      .is('duplicate_of_id', null)
      .order('population', { ascending: false, nullsFirst: false })
      .limit(bare.length * 5);
    const photo = new Map<string, string>();
    for (const c of (data ?? []) as { country_id: string; image_url: string }[])
      if (!photo.has(c.country_id)) photo.set(c.country_id, c.image_url);
    for (const r of out) r.image_url ??= photo.get(r.id) ?? null;
  }
  return out;
}

/**
 * Queer villages for the guides band: the visitor's country first, topped up
 * with the most trusted worldwide. Ghosts (no venues, deindexed) are excluded.
 */
export async function fetchHomeVillages(
  limit: number,
  countryId?: string | null,
): Promise<HomePlaceRow[]> {
  const base = () =>
    supabase
      .from('queer_villages')
      .select('id, name, slug, image_url, editorial_hook, cities:city_id(name)')
      .is('duplicate_of_id', null)
      .eq('seo_indexable', true)
      .neq('shell_status', 'ghost')
      .order('trust_score', { ascending: false, nullsFirst: false });
  const [local, top] = await Promise.all([
    countryId
      ? base().eq('country_id', countryId).limit(limit)
      : Promise.resolve({ data: [], error: null }),
    base().limit(limit + 1),
  ]);
  if (local.error) throw local.error;
  if (top.error) throw top.error;
  type Raw = Omit<HomePlaceRow, 'cityName'> & { cities: { name: string } | null };
  const rows = [...(local.data ?? []), ...(top.data ?? [])] as unknown as Raw[];
  const unique = [...new Map(rows.map((r) => [r.id, r])).values()].slice(0, limit);
  return unique.map(({ cities, ...v }) => ({ ...v, cityName: cities?.name ?? null }));
}

export interface CityHighlight {
  title: string;
  startDate: string;
}

/**
 * Cities with a Pride or festival in the next `days` days, soonest first.
 * One entry per city (its earliest such event).
 */
export async function fetchUpcomingHighlightCities(
  days = 60,
  limit = 60,
): Promise<Map<string, CityHighlight>> {
  const now = new Date();
  const until = new Date(now.getTime() + days * 86_400_000);
  const { data, error } = await supabase
    .from('events')
    .select('city_id, title, start_date')
    .in('event_type', ['pride', 'festival'])
    .gte('start_date', now.toISOString())
    .lte('start_date', until.toISOString())
    .not('city_id', 'is', null)
    .is('duplicate_of_id', null)
    .order('start_date', { ascending: true })
    .limit(limit);
  if (error) throw error;
  const out = new Map<string, CityHighlight>();
  for (const row of (data ?? []) as {
    city_id: string;
    title: string;
    start_date: string;
  }[]) {
    if (!out.has(row.city_id))
      out.set(row.city_id, { title: row.title, startDate: row.start_date });
  }
  return out;
}
