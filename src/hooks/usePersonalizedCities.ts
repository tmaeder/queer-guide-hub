import { supabase } from '@/integrations/supabase/client';

export interface PersonalizedCityRow {
  id: string;
  name: string;
  population: number | null;
  countries: { name: string; equality_score: number | null } | null;
}

export async function fetchPersonalizedCitiesByIds(
  cityIds: string[],
): Promise<PersonalizedCityRow[]> {
  if (cityIds.length === 0) return [];
  const { data } = await supabase
    .from('cities')
    .select('id, name, population, countries:country_id(name, equality_score)')
    .in('id', cityIds);
  return ((data ?? []) as unknown) as PersonalizedCityRow[];
}

// Editorial whitelist — the cities actual queer travelers care about. Order
// is significant: matches are surfaced in the order listed here, so Berlin /
// Madrid / Mexico City beat whichever mid-size US city happens to win a raw
// `ORDER BY population DESC` race (e.g. Norfolk slipping in ahead of NYC
// because NYC isn't in the cities table at that population grade).
const FEATURED_CITY_WHITELIST = [
  'Berlin', 'Madrid', 'Barcelona', 'Amsterdam', 'Mexico City', 'Bangkok',
  'Tel Aviv', 'Lisbon', 'Buenos Aires', 'Toronto', 'Montreal', 'San Francisco',
  'New York', 'Los Angeles', 'London', 'Paris', 'Cape Town', 'Sydney',
  'Melbourne', 'Reykjavik', 'Copenhagen', 'Stockholm', 'Brussels', 'Vienna',
];

export async function fetchTrendingCities(
  minPopulation = 200000,
  limit = 6,
): Promise<PersonalizedCityRow[]> {
  // 1. Editorial whitelist by name, preserving curated order.
  const { data: whitelisted } = await supabase
    .from('cities')
    .select('id, name, population, countries:country_id(name, equality_score)')
    .in('name', FEATURED_CITY_WHITELIST);

  const byName = new Map<string, PersonalizedCityRow>();
  for (const row of (whitelisted ?? []) as unknown as PersonalizedCityRow[]) {
    if (!byName.has(row.name)) byName.set(row.name, row);
  }
  const ordered: PersonalizedCityRow[] = [];
  for (const name of FEATURED_CITY_WHITELIST) {
    const row = byName.get(name);
    if (row) ordered.push(row);
    if (ordered.length >= limit) break;
  }
  if (ordered.length >= limit) return ordered;

  // 2. Fallback — large cities in equality-friendly countries (>= 60).
  const { data: filtered } = await supabase
    .from('cities')
    .select('id, name, population, countries:country_id!inner(name, equality_score)')
    .gte('population', minPopulation)
    .gte('countries.equality_score', 60)
    .order('population', { ascending: false })
    .limit(limit);
  const seenIds = new Set(ordered.map(r => r.id));
  for (const row of (filtered ?? []) as unknown as PersonalizedCityRow[]) {
    if (!seenIds.has(row.id)) ordered.push(row);
    if (ordered.length >= limit) break;
  }
  return ordered;
}
