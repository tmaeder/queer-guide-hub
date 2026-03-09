import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/integrations/api/client';
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

  // Fetch all public groups and user's private groups
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get all public groups and private groups the user is a member of
      const { data, error } = await supabase
        .from('community_groups')
        .select(`
          *,
          group_memberships!left(role, user_id)
        `)
        .or(`is_private.eq.false,and(is_private.eq.true,group_memberships.user_id.eq.${user.id})`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform data to include user membership info
      return data.map(group => {
        const userMembership = group.group_memberships?.find(m => m.user_id === user.id);
        return {
          ...group,
          user_role: userMembership?.role,
          is_member: !!userMembership
        };
      });
    },
    enabled: !!user
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
      return data.map(membership => ({
        ...membership.community_groups,
        user_role: membership.role,
        is_member: true
      }));
    },
    enabled: !!user?.id
  });

  // Create group mutation
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
          created_by: user.id
        })
        .select()
        .single();

      if (error) throw error;

      // Add creator as admin
      const { error: membershipError } = await supabase
        .from('group_memberships')
        .insert({
          group_id: data.id,
          user_id: user.id,
          role: 'admin'
        });

      if (membershipError) throw membershipError;

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['user-groups'] });
      toast({
        title: "Success",
        description: "Group created successfully!"
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Join group mutation
  const joinGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('group_memberships')
        .insert({
          group_id: groupId,
          user_id: user.id,
          role: 'member'
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['user-groups'] });
      toast({
        title: "Success",
        description: "Joined group successfully!"
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Leave group mutation
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
      toast({
        title: "Success",
        description: "Left group successfully!"
      });
    },
    onError: (error) => {
      toast({
        title: "Error", 
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Update group mutation
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
      toast({
        title: "Success",
        description: "Group updated successfully!"
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  return {
    groups,
    userGroups,
    isLoading,
    createGroup: createGroupMutation.mutate,
    isCreating: createGroupMutation.isPending,
    joinGroup: joinGroupMutation.mutate,
    isJoining: joinGroupMutation.isPending,
    leaveGroup: leaveGroupMutation.mutate,
    isLeaving: leaveGroupMutation.isPending,
    updateGroup: updateGroupMutation.mutate,
    isUpdating: updateGroupMutation.isPending
  };
};