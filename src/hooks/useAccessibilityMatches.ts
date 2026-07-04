import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { fetchProfileTravelPreferences } from '@/hooks/useTravelPreferencesEditor';
import { matchNeeds } from '@/lib/accessibilityNeeds';

/** The signed-in user's saved accessibility needs (profiles.travel_preferences). */
export function useAccessibilityNeeds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['profile-travel-prefs-needs', user?.id],
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<string[]> => {
      const prefs = await fetchProfileTravelPreferences(user!.id);
      return prefs?.accessibility_needs ?? [];
    },
  });
}

/**
 * Which of the given venues satisfy at least one of the user's needs.
 * Unlisted attributes are honest absence of data, never a "no".
 */
export function useVenueAccessibilityMatches(
  needs: string[] | undefined,
  venueIds: string[],
) {
  const { user } = useAuth();
  const idsKey = [...venueIds].sort().join(',');
  return useQuery({
    queryKey: ['venue-access-matches', user?.id, idsKey],
    enabled: (needs?.length ?? 0) > 0 && venueIds.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('venues')
        .select('id, accessibility_attributes')
        .in('id', venueIds);
      if (error) throw error;
      const matched = new Set<string>();
      for (const v of data ?? []) {
        const attrs = (v.accessibility_attributes as string[] | null) ?? [];
        if (matchNeeds(needs!, attrs).matched.length > 0) matched.add(v.id);
      }
      return matched;
    },
  });
}
