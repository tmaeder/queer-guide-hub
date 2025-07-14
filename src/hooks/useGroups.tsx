import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

type CommunityGroup = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  is_private: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  member_count: number;
  rules: string | null;
  tags: string[] | null;
};

type GroupMembership = {
  id: string;
  group_id: string;
  user_id: string;
  role: string;
  joined_at: string;
};

export function useGroups() {
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [myGroups, setMyGroups] = useState<CommunityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('community_groups')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGroups(data || []);
    } catch (err: any) {
      setError(err.message);
      toast.error('Failed to fetch groups');
    } finally {
      setLoading(false);
    }
  };

  const fetchMyGroups = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('group_memberships')
        .select(`
          *,
          community_groups (*)
        `)
        .eq('user_id', user.id);

      if (error) throw error;
      
      const userGroups = data?.map(membership => membership.community_groups).filter(Boolean) || [];
      setMyGroups(userGroups as CommunityGroup[]);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const createGroup = async (groupData: {
    name: string;
    description?: string;
    is_private?: boolean;
    rules?: string;
    tags?: string[];
  }) => {
    if (!user) {
      toast.error('You must be logged in to create a group');
      return { data: null, error: 'Not authenticated' };
    }

    try {
      const { data, error } = await supabase
        .from('community_groups')
        .insert({
          ...groupData,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-join the creator as admin
      await joinGroup(data.id, 'admin');
      
      toast.success('Group created successfully!');
      fetchGroups();
      fetchMyGroups();
      return { data, error: null };
    } catch (err: any) {
      toast.error('Failed to create group');
      return { data: null, error: err.message };
    }
  };

  const joinGroup = async (groupId: string, role: string = 'member') => {
    if (!user) {
      toast.error('You must be logged in to join a group');
      return { joined: false, error: 'Not authenticated' };
    }

    try {
      const { error } = await supabase
        .from('group_memberships')
        .insert({
          group_id: groupId,
          user_id: user.id,
          role,
        });

      if (error) throw error;

      toast.success('Joined group successfully!');
      fetchGroups();
      fetchMyGroups();
      return { joined: true, error: null };
    } catch (err: any) {
      toast.error('Failed to join group');
      return { joined: false, error: err.message };
    }
  };

  const leaveGroup = async (groupId: string) => {
    if (!user) {
      toast.error('You must be logged in to leave a group');
      return { left: false, error: 'Not authenticated' };
    }

    try {
      const { error } = await supabase
        .from('group_memberships')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('Left group successfully!');
      fetchGroups();
      fetchMyGroups();
      return { left: true, error: null };
    } catch (err: any) {
      toast.error('Failed to leave group');
      return { left: false, error: err.message };
    }
  };

  const checkMembership = async (groupId: string) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('group_memberships')
        .select('*')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (err: any) {
      return null;
    }
  };

  useEffect(() => {
    fetchGroups();
    if (user) {
      fetchMyGroups();
    }
  }, [user]);

  return {
    groups,
    myGroups,
    loading,
    error,
    createGroup,
    joinGroup,
    leaveGroup,
    checkMembership,
    refetch: fetchGroups,
  };
}