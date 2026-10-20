import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const KEY = ['user-follows'];

/** Who the signed-in user follows (existing `user_follows` table, Bluesky-style one-way follow). */
export function useFollows() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: [...KEY, user?.id ?? null],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_follows')
        .select('following_id')
        .eq('follower_id', user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.following_id);
    },
  });

  const following = useMemo(() => new Set(query.data ?? []), [query.data]);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: ['community-posts'] });
  };

  const follow = useMutation({
    mutationFn: async (targetId: string) => {
      if (!user) throw new Error('Sign in first');
      const { error } = await supabase
        .from('user_follows')
        .insert({ follower_id: user.id, following_id: targetId });
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: invalidate,
  });
  const unfollow = useMutation({
    mutationFn: async (targetId: string) => {
      if (!user) throw new Error('Sign in first');
      const { error } = await supabase
        .from('user_follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', targetId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    followingIds: following,
    isFollowing: (id: string) => following.has(id),
    follow,
    unfollow,
  };
}
