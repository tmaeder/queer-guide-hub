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

export async function fetchTrendingCities(
  minPopulation = 200000,
  limit = 6,
): Promise<PersonalizedCityRow[]> {
  // Queer-relevant "trending": prefer cities in countries with strong LGBTQ+
  // protections (equality_score >= 60). Fall back to population only if the
  // filtered query returns too few results.
  const { data } = await supabase
    .from('cities')
    .select('id, name, population, countries:country_id!inner(name, equality_score)')
    .gte('population', minPopulation)
    .gte('countries.equality_score', 60)
    .order('population', { ascending: false })
    .limit(limit);

  const rows = ((data ?? []) as unknown) as PersonalizedCityRow[];
  if (rows.length >= limit) return rows;

  // Fallback — top down by population so we still render something useful
  const { data: fallback } = await supabase
    .from('cities')
    .select('id, name, population, countries:country_id(name, equality_score)')
    .gte('population', minPopulation)
    .order('population', { ascending: false })
    .limit(limit);
  return ((fallback ?? []) as unknown) as PersonalizedCityRow[];
}
