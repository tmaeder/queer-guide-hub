import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useGlobalPresence } from '@/hooks/useConversationPresence';

/**
 * The user ids of the signed-in user's accepted friends.
 *
 * A friendship is one `user_relationships` row that can point either way, so
 * the other side of each row is the friend. RLS only exposes rows the caller
 * is part of, which is why this hook is for the caller's OWN friends only.
 *
 * Deliberately not `useUserRelationships`: that hook is uncached local state
 * and loads blocks and pending requests too, and this one is mounted in the
 * header on every page.
 */
export function useFriendIds(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['friend-ids', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('user_relationships')
        .select('user_id, target_user_id')
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},target_user_id.eq.${userId}`);
      if (error) throw error;
      return new Set(
        (data ?? []).map((row) => (row.user_id === userId ? row.target_user_id : row.user_id)),
      );
    },
  });
}

/**
 * How many of the caller's friends are online now, or null while the friend
 * list loads. Presence only carries users who opted into the global online
 * dot (presence_visibility.global_dot), so this counts the friends who chose
 * to be visible, never everyone who is connected.
 */
export function useFriendsOnlineCount(userId: string | null | undefined): number | null {
  const { data: friendIds } = useFriendIds(userId);
  const onlineUsers = useGlobalPresence();
  if (!friendIds) return null;
  let n = 0;
  for (const id of friendIds) if (onlineUsers.has(id)) n++;
  return n;
}
