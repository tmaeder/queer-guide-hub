import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Venue = Database['public']['Tables']['venues']['Row'];

const LIMIT = 6;

type VenueRow = { id: string; category?: string | null };

export interface NearbyVenuesResult<T extends VenueRow = VenueRow> {
  venues: T[];
  /** True when every venue shown shares the source venue's category, so the
   *  rail can say "similar places" instead of just "places in this city". */
  sameCategory: boolean;
}

/**
 * Same-category venues first, topped up with the rest of the city only when
 * there are too few. A counselling centre used to get the first six venues of
 * its city alphabetically, which were bars and shops.
 */
export function combineNearby<T extends VenueRow>(
  same: T[],
  rest: T[],
  limit = LIMIT,
): NearbyVenuesResult<T> {
  const seen = new Set(same.map((v) => v.id));
  const venues = [...same, ...rest.filter((v) => !seen.has(v.id))].slice(0, limit);
  return { venues, sameCategory: venues.length > 0 && same.length >= venues.length };
}

function cityVenues(cityId: string, id: string) {
  return supabase
    .from('venues')
    .select('*')
    .eq('city_id', cityId)
    .neq('id', id)
    .neq('review_status', 'archived')
    .neq('data_source', 'refuge-restrooms')
    .is('duplicate_of_id', null)
    .is('closed_at', null);
}

export async function fetchNearbyVenues(id: string) {
  const { data: source, error } = await supabase
    .from('venues')
    .select('city_id, category')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  // No global fallback: a missing city must never recommend another country.
  if (!source?.city_id) return combineNearby<Venue>([], []);
  const category = source.category && source.category !== 'other' ? source.category : null;

  let same: Venue[] = [];
  if (category) {
    const { data, error: sameError } = await cityVenues(source.city_id, id)
      .eq('category', category)
      .order('name')
      .limit(LIMIT);
    if (sameError) throw sameError;
    same = data ?? [];
  }
  if (same.length >= LIMIT) return combineNearby(same, []);

  let restQuery = cityVenues(source.city_id, id);
  if (category) restQuery = restQuery.neq('category', category);
  const { data, error: listError } = await restQuery.order('name').limit(LIMIT);
  if (listError) throw listError;
  return combineNearby(same, data ?? []);
}

export function useNearbyVenues(id: string) {
  return useQuery({
    queryKey: ['nearby-venues', id],
    queryFn: () => fetchNearbyVenues(id),
    staleTime: 300000,
  });
}
