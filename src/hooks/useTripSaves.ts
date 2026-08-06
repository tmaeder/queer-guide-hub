import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { qk } from '@/lib/queryKeys';

/**
 * Returns the set of trip IDs the current user has saved (bookmarked).
 * Hidden behind RLS — anon callers get an empty set rather than an error.
 * Gracefully degrades to empty when the `trip_saves` table doesn't exist
 * yet (migration not applied).
 */
export function useMyTripSaves() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.trip.savesFor(user?.id),
    enabled: !!user,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('trip_saves')
        .select('trip_id')
        .eq('user_id', user!.id);
      if (error) {
        // Table missing / RLS issue → treat as no saves; don't break the UI.
        return new Set();
      }
      return new Set((data ?? []).map((r) => r.trip_id as string));
    },
  });
}

export function useToggleTripSave() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tripId, saved }: { tripId: string; saved: boolean }) => {
      if (!user) throw new Error('Sign in to save trips');
      if (saved) {
        const { error } = await supabase
          .from('trip_saves')
          .delete()
          .eq('trip_id', tripId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('trip_saves')
          .insert({ trip_id: tripId, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.trip.savesFor(undefined) });
      queryClient.invalidateQueries({ queryKey: ['discoverable-trips'] });
    },
  });
}
