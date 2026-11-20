import { supabase } from '@/integrations/supabase/client';

export interface TravelPreferencesPayload {
  budget_level: string;
  safety_threshold: number;
  preferred_accommodation: string[];
  interests: string[];
  travel_style: string[];
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

/**
 * `travel_preferences` is not in the `authenticated` column allowlist on `profiles`, so
 * this reads through the SECURITY DEFINER self-read. Every caller already passes the
 * signed-in user's own id; `userId` is now only checked against the row the RPC returns
 * (it scopes itself to auth.uid()), so a stale caller gets null rather than someone
 * else's preferences.
 */
export async function fetchProfileTravelPreferences(
  userId: string,
): Promise<Partial<TravelPreferencesPayload> | null> {
  const { data } = await supabase.rpc('get_my_profile').maybeSingle();
  if (!data || data.user_id !== userId) return null;
  return (data.travel_preferences as Partial<TravelPreferencesPayload> | undefined) ?? null;
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

/**
 * Best guess at the member's current city from their profile address ("Zürich,
 * Switzerland"), used only to prefill an empty home-city field. Matches the first
 * comma segment as a city name, preferring the last segment as its country.
 */
export async function guessHomeCityFromProfile(
  userId: string,
): Promise<TravelPrefsHomeCity | null> {
  const { data } = await supabase.rpc('get_my_profile').maybeSingle();
  if (!data || data.user_id !== userId || !data.location) return null;
  const parts = data.location
    .split(',')
    .map((p: string) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const country = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : null;
  const { data: rows } = await supabase
    .from('cities')
    .select('id, name, timezone, population, country:country_id(id, name, code)')
    .ilike('name', parts[0])
    .is('duplicate_of_id', null)
    .order('population', { ascending: false, nullsFirst: false })
    .limit(10);
  const list = (rows ?? []) as Record<string, unknown>[];
  const pick =
    list.find((r) => {
      const c = r.country as { name: string; code: string | null } | null;
      return (
        !!country && !!c && (c.name.toLowerCase() === country || c.code?.toLowerCase() === country)
      );
    }) ?? (country ? null : list[0]);
  if (!pick) return null;
  const c = pick.country as { id: string; name: string; code: string | null } | null;
  if (!c) return null;
  return {
    cityId: pick.id as string,
    cityName: pick.name as string,
    countryId: c.id,
    countryName: c.name,
    countryCode: c.code ?? null,
    timezone: (pick.timezone as string | null) ?? null,
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
