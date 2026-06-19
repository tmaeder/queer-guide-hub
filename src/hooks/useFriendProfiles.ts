import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FriendProfile {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

/** Resolve a set of user ids to their public profile cards (for invite pickers). */
export function useFriendProfiles(userIds: string[], enabled = true) {
  const key = [...userIds].sort().join(',');
  const { data = [] } = useQuery({
    queryKey: ['friend-profiles', key],
    queryFn: async () => {
      if (userIds.length === 0) return [] as FriendProfile[];
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);
      if (error) throw error;
      return (data ?? []) as FriendProfile[];
    },
    enabled: enabled && userIds.length > 0,
  });
  return data;
}
