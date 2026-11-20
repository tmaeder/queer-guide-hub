import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface BlockedUser {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

const key = (userId: string | undefined) => ['blocked-users', userId] as const;

/** Everyone the signed-in member has blocked, newest first, with Unblock. */
export function useBlockedUsers() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: key(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<BlockedUser[]> => {
      const { data: rows, error } = await supabase
        .from('user_relationships')
        .select('target_user_id, created_at')
        .eq('user_id', user!.id)
        .eq('relationship_type', 'block')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const ids = (rows ?? []).map((r) => r.target_user_id as string);
      if (!ids.length) return [];
      const { data: people } = await supabase
        .from('profiles')
        .select('user_id, display_name, username, avatar_url')
        .in('user_id', ids);
      const byId = new Map((people ?? []).map((p) => [p.user_id as string, p]));
      return ids.map((id) => {
        const p = byId.get(id);
        return {
          user_id: id,
          display_name: (p?.display_name as string | null) ?? null,
          username: (p?.username as string | null) ?? null,
          avatar_url: (p?.avatar_url as string | null) ?? null,
        };
      });
    },
  });
  const unblock = useMutation({
    mutationFn: async (targetUserId: string) => {
      const { error } = await supabase
        .from('user_relationships')
        .delete()
        .eq('user_id', user!.id)
        .eq('target_user_id', targetUserId)
        .eq('relationship_type', 'block');
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(user?.id) }),
  });
  return { list, unblock };
}
