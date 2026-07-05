import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from './useAuth';
import { useGroups, type Group } from './useGroups';

interface RecRow {
  id: string;
  friendsInGroup?: number;
  tagMatches?: number;
}

/**
 * Personalized "For You" group recommendations. Calls the recommend_groups RPC
 * for the ranked id list, then hydrates against useGroups().groups so the cards
 * inherit accurate is_member / has_pending_request / user_role annotations.
 */
export function useRecommendedGroups(limit = 12) {
  const { user } = useAuth();
  const { groups, isLoading: groupsLoading } = useGroups();

  const { data: recs = [], isLoading: recsLoading } = useQuery({
    queryKey: ['recommended-groups', user?.id ?? null, limit],
    queryFn: async () => {
      const { data, error } = await untypedRpc<RecRow[]>('recommend_groups', {
        p_user_id: user!.id,
        p_limit: limit,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const byId = new Map(groups.map((g) => [g.id, g]));
  const hydrated: Group[] = recs
    .map((r) => byId.get(r.id))
    .filter((g): g is Group => !!g);

  return {
    groups: hydrated,
    isLoading: recsLoading || groupsLoading,
    isEmpty: !recsLoading && !groupsLoading && hydrated.length === 0,
  };
}
