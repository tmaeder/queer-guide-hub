import { supabase } from '@/integrations/supabase/client';

export interface TravelPreferencesPayload {
  budget_level: string;
  safety_threshold: number;
  preferred_accommodation: string[];
  interests: string[];
  travel_style: string;
  accessibility_needs: string[];
}

export interface TravelPrefsHomeCity {
  cityId: string;
  cityName: string;
  countryId: string;
  countryName: string;
  countryCode: string | null;
  timezone: string | null;
}

export async function fetchProfileTravelPreferences(
  userId: string,
): Promise<Partial<TravelPreferencesPayload> | null> {
  const { data } = await supabase
    .from('profiles')
    .select('travel_preferences')
    .eq('user_id', userId)
    .single();
  return (data?.travel_preferences as Partial<TravelPreferencesPayload> | undefined) ?? null;
}

export async function fetchTravelPrefsHomeCity(
  cityId: string,
): Promise<TravelPrefsHomeCity | null> {
  const { data } = await supabase
    .from('cities')
    .select('id, name, timezone, country:country_id(id, name, code)')
    .eq('id', cityId)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const country = row.country as { id: string; name: string; code: string | null } | null;
  if (!country) return null;
  return {
    cityId: row.id as string,
    cityName: row.name as string,
    countryId: country.id,
    countryName: country.name,
    countryCode: country.code ?? null,
    timezone: (row.timezone as string | null) ?? null,
  };
}

export async function saveProfileTravelPreferences(
  userId: string,
  prefs: TravelPreferencesPayload,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ travel_preferences: prefs })
    .eq('user_id', userId);
  if (error) throw error;
}
