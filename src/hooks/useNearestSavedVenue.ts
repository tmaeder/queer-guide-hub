import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useFavorites } from '@/hooks/useFavorites';
import { supabase } from '@/integrations/supabase/client';
import { calculateDistanceKm } from '@/utils/calculateDistance';

/**
 * Distance (km) from a point to the nearest of the signed-in user's saved
 * venues, excluding the current one. Null when logged out, no saved venues, or
 * no coordinates. Powers the personalisation band's "near your saved places".
 */
export function useNearestSavedVenueKm(
  currentVenueId: string,
  lat: number | null,
  lng: number | null,
): number | null {
  const { user } = useAuth();
  const { favoriteIds } = useFavorites('venue');
  const ids = useMemo(
    () => [...favoriteIds].filter((id) => id !== currentVenueId),
    [favoriteIds, currentVenueId],
  );
  const canQuery = Boolean(user) && lat != null && lng != null && ids.length > 0;

  const { data } = useQuery({
    queryKey: ['nearest-saved-venue', currentVenueId, ids.slice().sort().join(','), lat, lng],
    enabled: canQuery,
    staleTime: 60_000,
    queryFn: async (): Promise<number | null> => {
      const { data: rows, error } = await supabase
        .from('venues')
        .select('id, latitude, longitude')
        .in('id', ids);
      if (error || !rows) return null;
      let best: number | null = null;
      for (const v of rows as Array<{ latitude: number | null; longitude: number | null }>) {
        if (typeof v.latitude !== 'number' || typeof v.longitude !== 'number') continue;
        const km = calculateDistanceKm(lat!, lng!, v.latitude, v.longitude);
        if (best == null || km < best) best = km;
      }
      return best;
    },
  });
  return data ?? null;
}
