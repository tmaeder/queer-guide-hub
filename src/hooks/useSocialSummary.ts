import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SocialSummary {
  friends: number;
  groups: number;
  posts: number;
}

/** Lightweight head-count summary of a user's social graph for the profile Overview. */
export function useSocialSummary(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['social-summary', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<SocialSummary> => {
      const [friends, groups, posts] = await Promise.all([
        supabase
          .from('user_relationships')
          .select('id', { count: 'exact', head: true })
          .eq('relationship_type', 'friend')
          .eq('status', 'accepted')
          .or(`user_id.eq.${userId},target_user_id.eq.${userId}`),
        supabase
          .from('group_memberships')
          .select('group_id', { count: 'exact', head: true })
          .eq('user_id', userId!),
        supabase
          .from('community_posts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId!),
      ]);
      return {
        friends: friends.count ?? 0,
        groups: groups.count ?? 0,
        posts: posts.count ?? 0,
      };
    },
  });
}
