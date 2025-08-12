import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';

export interface GroupPost {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  post_type: 'text' | 'announcement' | 'poll';
  is_pinned: boolean;
  likes_count: number;
  comments_count: number;
  poll_data?: {
    question: string;
    options: string[];
    multiple_choice?: boolean;
    expires_at?: string;
  } | null;
  images?: string[] | null;
  mentions?: Array<{ user_id: string; username: string }>;
  created_at: string;
  updated_at: string;
  // Joined data
  profiles?: {
    display_name: string;
    avatar_url: string;
  };
  user_liked?: boolean;
  user_vote?: number | null;
}

export interface GroupComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  parent_comment_id?: string | null;
  likes_count: number;
  mentions?: Array<{ user_id: string; username: string }>;
  created_at: string;
  updated_at: string;
  // Joined data
  profiles?: {
    display_name: string;
    avatar_url: string;
  };
  user_liked?: boolean;
  replies?: GroupComment[];
}

export const useGroupPosts = (groupId: string) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch group posts
  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['group-posts', groupId],
    queryFn: async () => {
      // Simple query without complex joins
      const { data, error } = await supabase
        .from('group_posts')
        .select('*')
        .eq('group_id', groupId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get user profiles separately
      const userIds = [...new Set(data?.map(post => post.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles_public')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);

      // Get user likes
      const postIds = data?.map(post => post.id) || [];
      const { data: likes } = await supabase
        .from('group_post_likes')
        .select('post_id, user_id')
        .in('post_id', postIds)
        .eq('user_id', user?.id || '');

      // Get user votes
      const { data: votes } = await supabase
        .from('group_poll_votes')
        .select('post_id, user_id, option_index')
        .in('post_id', postIds)
        .eq('user_id', user?.id || '');

      // Transform data
      return (data || []).map(post => {
        const userProfile = profiles?.find(p => p.user_id === post.user_id);
        const userLiked = likes?.some(like => like.post_id === post.id);
        const userVote = votes?.find(vote => vote.post_id === post.id);

        return {
          ...post,
          post_type: post.post_type as 'text' | 'announcement' | 'poll',
          profiles: userProfile ? {
            display_name: userProfile.display_name || 'Unknown User',
            avatar_url: userProfile.avatar_url || ''
          } : { display_name: 'Unknown User', avatar_url: '' },
          user_liked: userLiked || false,
          user_vote: userVote?.option_index || null,
          poll_data: post.poll_data as any,
          mentions: (post.mentions as any) || []
        };
      });
    },
    enabled: !!user && !!groupId
  });

  // Fetch group members for @mentions and member list
  const { data: groupMembers = [] } = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: async () => {
      const { data: memberships, error } = await supabase
        .from('group_memberships')
        .select('user_id, role, joined_at')
        .eq('group_id', groupId)
        .order('role', { ascending: true })
        .order('joined_at', { ascending: true });

      if (error) throw error;

      const userIds = memberships?.map(m => m.user_id) || [];
      const { data: profiles } = await supabase
        .from('profiles_public')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);

      return memberships?.map(membership => {
        const profile = profiles?.find(p => p.user_id === membership.user_id);
        return {
          user_id: membership.user_id,
          role: membership.role,
          joined_at: membership.joined_at,
          profiles: {
            display_name: profile?.display_name || 'Unknown User',
            avatar_url: profile?.avatar_url || '',
            social_links: {}
          }
        };
      }) || [];
    },
    enabled: !!user && !!groupId
  });

  // Create post mutation
  const createPostMutation = useMutation({
    mutationFn: async ({ 
      content, 
      postType = 'text', 
      isPinned = false, 
      pollData = null,
      mentions = []
    }: {
      content: string;
      postType?: 'text' | 'announcement' | 'poll';
      isPinned?: boolean;
      pollData?: any;
      mentions?: Array<{ user_id: string; username: string }>;
    }) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('group_posts')
        .insert({
          group_id: groupId,
          user_id: user.id,
          content,
          post_type: postType,
          is_pinned: isPinned,
          poll_data: pollData,
          mentions: mentions
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-posts', groupId] });
      toast({
        title: "Post created",
        description: "Your post has been shared with the group."
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to create post",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Like post mutation
  const likePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('group_post_likes')
        .insert({
          post_id: postId,
          user_id: user.id
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-posts', groupId] });
    }
  });

  // Unlike post mutation
  const unlikePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('group_post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-posts', groupId] });
    }
  });

  // Vote on poll mutation
  const voteOnPollMutation = useMutation({
    mutationFn: async ({ postId, optionIndex }: { postId: string; optionIndex: number }) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('group_poll_votes')
        .upsert({
          post_id: postId,
          user_id: user.id,
          option_index: optionIndex
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-posts', groupId] });
    }
  });

  // Pin/unpin post mutation
  const togglePinMutation = useMutation({
    mutationFn: async ({ postId, isPinned }: { postId: string; isPinned: boolean }) => {
      const { error } = await supabase
        .from('group_posts')
        .update({ is_pinned: isPinned })
        .eq('id', postId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-posts', groupId] });
      toast({
        title: "Post updated",
        description: "Post pin status has been updated."
      });
    }
  });

  return {
    posts,
    groupMembers,
    isLoading,
    createPost: createPostMutation.mutate,
    isCreatingPost: createPostMutation.isPending,
    likePost: likePostMutation.mutate,
    unlikePost: unlikePostMutation.mutate,
    isLikingPost: likePostMutation.isPending || unlikePostMutation.isPending,
    voteOnPoll: voteOnPollMutation.mutate,
    isVoting: voteOnPollMutation.isPending,
    togglePin: togglePinMutation.mutate,
    isTogglingPin: togglePinMutation.isPending
  };
};