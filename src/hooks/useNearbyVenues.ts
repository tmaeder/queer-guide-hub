import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type VenueRow = Database['public']['Tables']['venues']['Row'];

/**
 * Categories whose visitors are looking for a service, not a night out. For
 * these the onward list never falls back to other kinds of place: a reader
 * leaving a counselling centre was shown an online pump shop, a law firm and
 * hotels because the list was simply the city's venues in alphabetical order.
 */
export const SERVICE_ONLY_CATEGORIES = new Set(['community_center']);

export type NearbyRelation = 'same_category' | 'same_city';

export interface NearbyVenueGroup {
  relation: NearbyRelation;
  venues: VenueRow[];
}

const LIMIT = 6;

function distanceSq(a: Pick<VenueRow, 'latitude' | 'longitude'>, lat: number, lng: number) {
  if (typeof a.latitude !== 'number' || typeof a.longitude !== 'number') return Infinity;
  const dLat = a.latitude - lat;
  const dLng = (a.longitude - lng) * Math.cos((lat * Math.PI) / 180);
  return dLat * dLat + dLng * dLng;
}

/**
 * Rank onward places by the visitor's need, then by location: same category
 * first, nearest first; other kinds of place only fill the remainder, and
 * never for a service category. Pure so the ordering is testable.
 */
export function rankNearbyVenues(
  source: Pick<VenueRow, 'category' | 'latitude' | 'longitude'>,
  candidates: VenueRow[],
  limit = LIMIT,
): NearbyVenueGroup[] {
  const hasPoint = typeof source.latitude === 'number' && typeof source.longitude === 'number';
  const byDistance = (list: VenueRow[]) =>
    hasPoint
      ? [...list].sort(
          (a, b) =>
            distanceSq(a, source.latitude as number, source.longitude as number) -
            distanceSq(b, source.latitude as number, source.longitude as number),
        )
      : list;
  const same = source.category
    ? byDistance(candidates.filter((v) => v.category === source.category)).slice(0, limit)
    : [];
  const groups: NearbyVenueGroup[] = [];
  if (same.length) groups.push({ relation: 'same_category', venues: same });
  const serviceOnly = source.category ? SERVICE_ONLY_CATEGORIES.has(source.category) : false;
  const room = limit - same.length;
  if (!serviceOnly && room > 0) {
    const rest = byDistance(
      candidates.filter((v) => !same.includes(v) && v.category !== source.category),
    );
    if (rest.length) groups.push({ relation: 'same_city', venues: rest.slice(0, room) });
  }
  return groups;
}

export async function fetchNearbyVenues(id: string) {
  const { data: source, error } = await supabase
    .from('venues')
    .select('city_id, category, latitude, longitude')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  // No global fallback: a missing city must never recommend another country.
  if (!source?.city_id) return [];
  const base = () =>
    supabase
      .from('venues')
      .select('*')
      .eq('city_id', source.city_id as string)
      .neq('id', id)
      .neq('review_status', 'archived')
      .neq('data_source', 'refuge-restrooms')
      .is('duplicate_of_id', null)
      .is('closed_at', null);
  // Same category: a wider pool so distance ordering has something to rank.
  const sameQ = source.category
    ? base().eq('category', source.category).limit(60)
    : Promise.resolve({ data: [] as VenueRow[], error: null });
  const otherQ =
    source.category && SERVICE_ONLY_CATEGORIES.has(source.category)
      ? Promise.resolve({ data: [] as VenueRow[], error: null })
      : (source.category ? base().neq('category', source.category) : base()).limit(60);
  const [same, other] = await Promise.all([sameQ, otherQ]);
  if (same.error) throw same.error;
  if (other.error) throw other.error;
  return rankNearbyVenues(source, [...(same.data ?? []), ...(other.data ?? [])]);
}

export function useNearbyVenues(id: string) {
  return useQuery({
    queryKey: ['nearby-venues', id],
    queryFn: () => fetchNearbyVenues(id),
    staleTime: 300000,
  });
}
