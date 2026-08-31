/**
 * Trip suggestion + map data fetchers.
 *
 * The naive suggestion path — `fetchTripSuggestionVenues` /
 * `fetchTripSuggestionEvents`, `order by foursquare_rating limit 30` — was
 * removed on 2026-08-31. `TripSuggestions.tsx` has read the recommendation
 * engine (`fetchRecommendations`) since it was rewritten, and its own header
 * said so; the two functions had no caller left in `src/` except their own
 * tests, which is what a dead path looks like when nothing deletes it.
 *
 * What remains has live callers: the city lookup (`TripSuggestions`,
 * `useSavedItemsByCity`) and the two map fetchers (`TripMap`).
 */

import { supabase } from '@/integrations/supabase/client';

export interface TripSuggestionCity {
  id: string;
  name: string;
  country_id: string | null;
  countries?: { equality_score: number | null; name: string } | null;
}

export async function fetchTripSuggestionCities(cityIds: string[]): Promise<TripSuggestionCity[]> {
  if (cityIds.length === 0) return [];
  const { data, error } = await supabase
    .from('cities')
    .select('id, name, country_id, countries:country_id(equality_score, name)')
    .in('id', cityIds);
  if (error) throw error;
  return (data || []) as TripSuggestionCity[];
}

export async function fetchTripMapVenues<T = unknown>(cityIds: string[]): Promise<T[]> {
  if (cityIds.length === 0) return [];
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, category, latitude, longitude')
    .in('city_id', cityIds)
    .neq('review_status', 'archived')
    .is('duplicate_of_id', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('foursquare_rating', { ascending: false, nullsFirst: false })
    .limit(50);
  if (error) throw error;
  return (data || []) as T[];
}

export async function fetchTripMapEvents<T = unknown>(
  cityIds: string[],
  startDate: string | undefined,
  endDate: string | undefined,
): Promise<T[]> {
  if (cityIds.length === 0) return [];
  let query = supabase
    .from('events')
    .select('id, title, event_type, start_date, latitude, longitude')
    .in('city_id', cityIds)
    .is('duplicate_of_id', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  if (startDate) query = query.gte('start_date', startDate);
  if (endDate) query = query.lte('start_date', endDate);
  const { data, error } = await query.order('start_date', { ascending: true }).limit(50);
  if (error) throw error;
  return (data || []) as T[];
}
