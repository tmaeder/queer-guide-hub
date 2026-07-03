import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useUserMode } from '@/hooks/useUserMode';
import { useStatus, type TravelMode } from '@/hooks/useStatus';
import type { UserMode } from '@/config/navigation';

/**
 * Intent capture for the People hub. The three signals already exist as profile
 * columns but had no unified setter:
 *   - user_mode   (single soft mode)        → useUserMode
 *   - looking_for (text[] of what you want) → here, via updateProfile
 *   - travel_mode (city you're heading to)  → useStatus.setStatus({ travel })
 * This hook ties them together and exposes the trip-derived travel suggestion
 * (derive_travel_intent RPC) so a user never has to re-enter a destination.
 */

export const LOOKING_FOR_OPTIONS = [
  'friends',
  'dating',
  'travel_buddies',
  'locals',
  'networking',
] as const;
export type LookingFor = (typeof LOOKING_FOR_OPTIONS)[number];

export const LOOKING_FOR_LABELS: Record<LookingFor, string> = {
  friends: 'Friends',
  dating: 'Dating',
  travel_buddies: 'Travel buddies',
  locals: 'Locals where I am',
  networking: 'Networking',
};

export interface DerivedTravelIntent {
  tripId: string;
  cityId: string | null;
  cityName: string | null;
  startDate: string | null;
  endDate: string | null;
}

export function useUserIntent() {
  const { profile, updateProfile } = useProfile();
  const { mode, setMode } = useUserMode();
  const { status, setStatus } = useStatus();

  const lookingFor = ((profile as unknown as { looking_for?: string[] })?.looking_for ?? []).filter(
    (v): v is LookingFor => (LOOKING_FOR_OPTIONS as readonly string[]).includes(v),
  );

  const setLookingFor = useCallback(
    async (next: LookingFor[]) => {
      const res = await updateProfile({ looking_for: next });
      return { error: res.error };
    },
    [updateProfile],
  );

  const toggleLookingFor = useCallback(
    (value: LookingFor) => {
      const has = lookingFor.includes(value);
      return setLookingFor(has ? lookingFor.filter((v) => v !== value) : [...lookingFor, value]);
    },
    [lookingFor, setLookingFor],
  );

  const setTravel = useCallback(
    (travel: TravelMode | null) => setStatus({ travel }),
    [setStatus],
  );

  return {
    mode,
    setMode: (m: UserMode) => setMode(m),
    lookingFor,
    setLookingFor,
    toggleLookingFor,
    travel: status?.travel ?? null,
    setTravel,
    hasIntent: !!profile?.user_mode,
  };
}

/** The viewer's nearest upcoming trip with a known city, or null. */
export function useDerivedTravelIntent(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['derived-travel-intent', user?.id],
    enabled: !!user && enabled,
    queryFn: async (): Promise<DerivedTravelIntent | null> => {
      const { data, error } = await supabase.rpc('derive_travel_intent');
      if (error) throw error;
      const row = (data as { trip_id: string; city_id: string | null; city_name: string | null; start_date: string | null; end_date: string | null }[] | null)?.[0];
      if (!row) return null;
      return {
        tripId: row.trip_id,
        cityId: row.city_id,
        cityName: row.city_name,
        startDate: row.start_date,
        endDate: row.end_date,
      };
    },
  });
}
