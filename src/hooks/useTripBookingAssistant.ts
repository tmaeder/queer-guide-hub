import { supabase } from '@/integrations/supabase/client';

export interface BookingAssistantCity {
  id: string;
  name: string;
  country_id: string | null;
  countries?: { equality_score: number | null; name: string } | null;
}

export interface BookingAssistantReservation {
  id: string;
  type: string;
  title: string | null;
  provider: string | null;
  status: string | null;
}

export interface BookingAssistantVenue {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  foursquare_rating: number | null;
  is_featured: boolean | null;
  latitude: number | null;
  longitude: number | null;
  city_id: string | null;
  country_id: string | null;
}

export async function fetchBookingAssistantCities(
  cityIds: string[],
): Promise<BookingAssistantCity[]> {
  if (cityIds.length === 0) return [];
  const { data, error } = await supabase
    .from('cities')
    .select('id, name, country_id, countries:country_id(equality_score, name)')
    .in('id', cityIds);
  if (error) throw error;
  return (data || []) as BookingAssistantCity[];
}

export async function fetchTripReservations(
  tripId: string,
): Promise<BookingAssistantReservation[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select('id, type, title, provider, status')
    .eq('trip_id', tripId);
  if (error) throw error;
  return (data || []) as BookingAssistantReservation[];
}

export async function fetchBookingAssistantVenues(
  cityIds: string[],
): Promise<BookingAssistantVenue[]> {
  if (cityIds.length === 0) return [];
  const { data, error } = await supabase
    .from('venues')
    .select(
      'id, name, category, address, foursquare_rating, is_featured, latitude, longitude, city_id, country_id',
    )
    .in('city_id', cityIds)
    .order('foursquare_rating', { ascending: false, nullsFirst: false })
    .limit(20);
  if (error) throw error;
  return (data || []) as BookingAssistantVenue[];
}
