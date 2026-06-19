import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ResolvedInvite {
  inviteId: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: string;
  group: {
    id: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    isPrivate: boolean;
    memberCount: number;
  };
  invitedBy: { displayName: string | null; avatarUrl: string | null };
  alreadyMember: boolean;
}

export function inviteUrl(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://queer.guide';
  return `${origin}/groups/invite/${token}`;
}

/** Invite friends to a group + create shareable links + accept by token. */
export function useGroupInvites() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const inviteFriends = useMutation({
    mutationFn: async ({ groupId, userIds }: { groupId: string; userIds: string[] }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('invite_friends_to_group', {
        p_group_id: groupId,
        p_friend_ids: userIds,
      });
      if (error) throw error;
      return (data ?? []) as unknown[];
    },
    onSuccess: (data) => {
      const n = Array.isArray(data) ? data.length : 0;
      toast({
        title: 'Invites sent',
        description: n === 1 ? '1 friend invited.' : `${n} friends invited.`,
      });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const createInviteLink = async (groupId: string): Promise<string> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('create_group_invite', {
      p_group_id: groupId,
      p_invited_user_id: null,
      p_email: null,
    });
    if (error) throw error;
    const token = (data as { token?: string })?.token;
    if (!token) throw new Error('No invite token returned');
    return inviteUrl(token);
  };

  const acceptInvite = useMutation({
    mutationFn: async (token: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('accept_group_invite', {
        p_token: token,
      });
      if (error) throw error;
      return data as { group_id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['user-groups'] });
    },
    onError: (error) => {
      toast({ title: 'Could not accept invite', description: error.message, variant: 'destructive' });
    },
  });

  return {
    inviteFriends: inviteFriends.mutate,
    isInviting: inviteFriends.isPending,
    createInviteLink,
    acceptInvite: acceptInvite.mutateAsync,
    isAccepting: acceptInvite.isPending,
  };
}

/** Resolve an invite token for the accept-invite landing page. */
export function useResolveGroupInvite(token?: string) {
  return useQuery({
    queryKey: ['group-invite', token],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('resolve_group_invite', {
        p_token: token,
      });
      if (error) throw error;
      return (data ?? null) as ResolvedInvite | null;
    },
    enabled: !!token,
  });
}
