import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface TripGroupLink {
  trip_id: string;
  group_id: string;
  created_by: string | null;
  created_at: string;
}

/** Groups a trip is linked to. */
export function useTripGroups(tripId: string | null | undefined) {
  return useQuery({
    queryKey: ['trip-groups', tripId],
    enabled: !!tripId,
    queryFn: async (): Promise<TripGroupLink[]> => {
      if (!tripId) return [];
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('trip_group_links' as any)
        .select('*')
        .eq('trip_id', tripId);
      if (error) throw error;
      return (data as TripGroupLink[]) ?? [];
    },
  });
}

/** Trips linked to a group. */
export function useGroupTrips(groupId: string | null | undefined) {
  return useQuery({
    queryKey: ['group-trips', groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<TripGroupLink[]> => {
      if (!groupId) return [];
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('trip_group_links' as any)
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as TripGroupLink[]) ?? [];
    },
  });
}

/** Link a trip to a group (trip owner only, must be group member). */
export function useLinkTripToGroup() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { tripId: string; groupId: string }) => {
      if (!user) throw new Error('not signed in');
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('trip_group_links' as any)
        .insert({ trip_id: args.tripId, group_id: args.groupId, created_by: user.id });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['trip-groups', vars.tripId] });
      qc.invalidateQueries({ queryKey: ['group-trips', vars.groupId] });
    },
  });
}

/** Unlink (trip owner or group mod). */
export function useUnlinkTripFromGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { tripId: string; groupId: string }) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('trip_group_links' as any)
        .delete()
        .eq('trip_id', args.tripId)
        .eq('group_id', args.groupId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['trip-groups', vars.tripId] });
      qc.invalidateQueries({ queryKey: ['group-trips', vars.groupId] });
    },
  });
}
