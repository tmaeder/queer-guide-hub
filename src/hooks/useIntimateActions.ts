import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useVerifiedEmail() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['verified-email', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('verified_email')
        .eq('id', user!.id)
        .maybeSingle();
      return Boolean(data?.verified_email);
    },
  });
}

export function useProfileDisplay(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile-display', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', userId!)
        .maybeSingle();
      return data as { display_name: string | null; avatar_url: string | null } | null;
    },
  });
}

export function useSendFriendRequest() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!user) throw new Error('not signed in');
      const { error } = await supabase.from('user_relationships').insert({
        user_id: user.id,
        target_user_id: targetUserId,
        relationship_type: 'friend',
        status: 'pending',
      });
      if (error) throw error;
    },
  });
}

export function useBlockUser() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!user) throw new Error('not signed in');
      const { error } = await supabase.from('user_relationships').insert({
        user_id: user.id,
        target_user_id: targetUserId,
        relationship_type: 'block',
        status: 'accepted',
      });
      if (error) throw error;
    },
  });
}
