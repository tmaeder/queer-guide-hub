import { supabase } from '@/integrations/supabase/client';

export interface TripSuggestionCity {
  id: string;
  name: string;
  country_id: string | null;
  countries?: { equality_score: number | null; name: string } | null;
}

export interface TripSuggestionVenue {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  foursquare_rating: number | null;
  featured: boolean | null;
  latitude: number | null;
  longitude: number | null;
  city_id: string | null;
  country_id: string | null;
}

export interface TripSuggestionEvent {
  id: string;
  title: string;
  event_type: string | null;
  start_date: string | null;
  end_date: string | null;
  latitude: number | null;
  longitude: number | null;
  city_id: string | null;
  country_id: string | null;
}

export async function fetchTripSuggestionCities(
  cityIds: string[],
): Promise<TripSuggestionCity[]> {
  if (cityIds.length === 0) return [];
  const { data, error } = await supabase
    .from('cities')
    .select('id, name, country_id, countries:country_id(equality_score, name)')
    .in('id', cityIds);
  if (error) throw error;
  return (data || []) as TripSuggestionCity[];
}

export async function fetchTripSuggestionVenues(
  cityIds: string[],
): Promise<TripSuggestionVenue[]> {
  if (cityIds.length === 0) return [];
  const { data, error } = await supabase
    .from('venues')
    .select(
      'id, name, category, address, foursquare_rating, is_featured, latitude, longitude, city_id, country_id',
    )
    .in('city_id', cityIds)
    .order('foursquare_rating', { ascending: false, nullsFirst: false })
    .limit(30);
  if (error) throw error;
  return (data || []) as TripSuggestionVenue[];
}

export async function fetchTripSuggestionEvents(
  cityIds: string[],
  startDate: string | undefined,
  endDate: string | undefined,
): Promise<TripSuggestionEvent[]> {
  if (cityIds.length === 0) return [];
  let query = supabase
    .from('events')
    .select(
      'id, title, event_type, start_date, end_date, latitude, longitude, city_id, country_id',
    )
    .in('city_id', cityIds);
  if (startDate) query = query.gte('start_date', startDate);
  if (endDate) query = query.lte('start_date', endDate);
  const { data, error } = await query.order('start_date', { ascending: true }).limit(20);
  if (error) throw error;
  return (data || []) as TripSuggestionEvent[];
}
