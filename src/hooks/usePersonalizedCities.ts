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
  minPopulation = 500000,
  limit = 6,
): Promise<PersonalizedCityRow[]> {
  const { data } = await supabase
    .from('cities')
    .select('id, name, population, countries:country_id(name, equality_score)')
    .gte('population', minPopulation)
    .order('population', { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown) as PersonalizedCityRow[];
}
