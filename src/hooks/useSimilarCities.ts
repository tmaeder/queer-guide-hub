import { supabase } from '@/integrations/supabase/client';
import type { PersonalizedCityRow } from '@/hooks/usePersonalizedCities';

export type SimilarCityRow = PersonalizedCityRow & { country_id?: string };

export async function fetchSimilarCitiesPool(
  cityId: string,
  limit: number,
): Promise<SimilarCityRow[]> {
  const { data } = await supabase
    .from('cities')
    .select('id, name, population, country_id, countries:country_id(name, equality_score)')
    .neq('id', cityId)
    .gte('population', 100000)
    .order('population', { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown) as SimilarCityRow[];
}

export async function fetchSameCountryCities(
  countryId: string,
  cityId: string,
): Promise<SimilarCityRow[]> {
  const { data } = await supabase
    .from('cities')
    .select('id, name, population, country_id, countries:country_id(name, equality_score)')
    .eq('country_id', countryId)
    .neq('id', cityId)
    .gte('population', 50000)
    .order('population', { ascending: false })
    .limit(3);
  return ((data ?? []) as unknown) as SimilarCityRow[];
}
