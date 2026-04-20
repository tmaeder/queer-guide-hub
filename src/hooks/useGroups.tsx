import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';

export interface Group {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  is_private: boolean;
  member_count: number;
  rules: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  tags?: string[];
  user_role?: string;
  is_member?: boolean;
  has_pending_request?: boolean;
}

export interface GroupMembership {
  id: string;
  group_id: string;
  user_id: string;
  role: string;
  joined_at: string;
}

export const useGroups = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all visible groups (public + private, via RLS) with user membership + pending request flag.
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['groups', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const [{ data: rows, error }, { data: pending, error: pendingError }] = await Promise.all([
        supabase
          .from('community_groups')
          .select(`
            *,
            group_memberships!left(role, user_id)
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('group_join_requests')
          .select('group_id')
          .eq('user_id', user.id)
          .eq('status', 'pending'),
      ]);

      if (error) throw error;
      if (pendingError) throw pendingError;

      const pendingSet = new Set((pending ?? []).map((r) => r.group_id));

      return (rows ?? []).map((group) => {
        const userMembership = group.group_memberships?.find(
          (m: { user_id: string }) => m.user_id === user.id,
        );
        return {
          ...group,
          user_role: userMembership?.role,
          is_member: !!userMembership,
          has_pending_request: pendingSet.has(group.id),
        };
      });
    },
    enabled: !!user,
  });

  // Fetch user's groups
  const { data: userGroups = [] } = useQuery({
    queryKey: ['user-groups', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('group_memberships')
        .select(`
          *,
          community_groups(*)
        `)
        .eq('user_id', user.id);

      if (error) throw error;
      return data.map((membership) => ({
        ...membership.community_groups,
        user_role: membership.role,
        is_member: true,
      }));
    },
    enabled: !!user?.id,
  });

  const createGroupMutation = useMutation({
    mutationFn: async ({ name, description, isPrivate, imageUrl, rules, tags }: {
      name: string;
      description?: string;
      isPrivate?: boolean;
      imageUrl?: string;
      rules?: string;
      tags?: string[];
    }) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('community_groups')
        .insert({
          name,
          description,
          is_private: isPrivate || false,
          image_url: imageUrl,
          rules,
          tags: tags || [],
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      const { error: membershipError } = await supabase
        .from('group_memberships')
        .insert({ group_id: data.id, user_id: user.id, role: 'admin' });

      if (membershipError) throw membershipError;

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['user-groups'] });
      toast({ title: 'Success', description: 'Group created successfully!' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Direct join - used for public groups (or by request-approval flow internally).
  const joinGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('group_memberships')
        .insert({ group_id: groupId, user_id: user.id, role: 'member' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['user-groups'] });
      toast({ title: 'Success', description: 'Joined group successfully!' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Request to join - used for private groups.
  const requestJoinMutation = useMutation({
    mutationFn: async ({ groupId, message }: { groupId: string; message?: string }) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('group_join_requests')
        .insert({ group_id: groupId, user_id: user.id, message: message ?? null });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
      toast({ title: 'Request sent', description: 'A group admin will review your request.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const cancelJoinRequestMutation = useMutation({
    mutationFn: async (groupId: string) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('group_join_requests')
        .update({ status: 'cancelled' })
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .eq('status', 'pending');

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['group-join-requests'] });
      toast({ title: 'Request cancelled' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const leaveGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('group_memberships')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['user-groups'] });
      toast({ title: 'Success', description: 'Left group successfully!' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: async ({ groupId, updates }: {
      groupId: string;
      updates: Partial<Pick<Group, 'name' | 'description' | 'image_url' | 'is_private' | 'rules' | 'tags'>>;
    }) => {
      const { error } = await supabase
        .from('community_groups')
        .update(updates)
        .eq('id', groupId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['user-groups'] });
      toast({ title: 'Success', description: 'Group updated successfully!' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  return {
    groups,
    userGroups,
    isLoading,
    createGroup: createGroupMutation.mutate,
    isCreating: createGroupMutation.isPending,
    joinGroup: joinGroupMutation.mutate,
    isJoining: joinGroupMutation.isPending,
    requestJoin: requestJoinMutation.mutate,
    isRequesting: requestJoinMutation.isPending,
    cancelJoinRequest: cancelJoinRequestMutation.mutate,
    isCancellingRequest: cancelJoinRequestMutation.isPending,
    leaveGroup: leaveGroupMutation.mutate,
    isLeaving: leaveGroupMutation.isPending,
    updateGroup: updateGroupMutation.mutate,
    isUpdating: updateGroupMutation.isPending,
  };
};
