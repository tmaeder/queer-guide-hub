import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';
import type { Group } from './useGroups';

export interface UserGroup extends Pick<Group, 'id' | 'name' | 'description' | 'image_url' | 'is_private' | 'member_count'> {
  tags?: string[];
  role?: string;
  joinedAt?: string;
}

/**
 * Groups a user belongs to, for profile surfacing. The get_user_groups RPC is
 * privacy-aware: public groups are always returned; private groups only when the
 * viewer is the owner or a co-member.
 */
export function useUserGroups(userId?: string) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['user-groups-public', userId],
    queryFn: async () => {
      type Row = {
        id: string; name: string; description: string | null; imageUrl: string | null;
        isPrivate: boolean; memberCount: number; tags?: string[]; role?: string; joinedAt?: string;
      };
      const { data: rows, error } = await untypedRpc<Row[]>('get_user_groups', {
        p_user_id: userId,
      });
      if (error) throw error;
      return (rows ?? []).map((r): UserGroup => ({
        id: r.id,
        name: r.name,
        description: r.description,
        image_url: r.imageUrl,
        is_private: r.isPrivate,
        member_count: r.memberCount,
        tags: r.tags,
        role: r.role,
        joinedAt: r.joinedAt,
      }));
    },
    enabled: !!userId,
  });

  return { groups: data, isLoading };
}
