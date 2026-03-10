import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/integrations/api/client';
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
      // Fetch posts with author profiles in a single query
      const { data, error } = await api
        .from('group_posts')
        .select('*, profiles!group_posts_user_id_fkey(display_name, avatar_url)')
        .eq('group_id', groupId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch user's likes and votes in parallel
      const postIds = data?.map((post) => post.id) || [];
      const [likesResult, votesResult] = await Promise.all([
        api
          .from('group_post_likes')
          .select('post_id')
          .in('post_id', postIds)
          .eq('user_id', user?.id || ''),
        api
          .from('group_poll_votes')
          .select('post_id, option_index')
          .in('post_id', postIds)
          .eq('user_id', user?.id || ''),
      ]);

      const likes = likesResult.data;
      const votes = votesResult.data;

      return (data || []).map((post) => {
        const profile = (post as any).profiles;
        return {
          ...post,
          post_type: post.post_type as 'text' | 'announcement' | 'poll',
          profiles: profile
            ? {
                display_name: profile.display_name || 'Unknown User',
                avatar_url: profile.avatar_url || '',
              }
            : { display_name: 'Unknown User', avatar_url: '' },
          user_liked: likes?.some((like) => like.post_id === post.id) || false,
          user_vote: votes?.find((vote) => vote.post_id === post.id)?.option_index || null,
          poll_data: post.poll_data as any,
          mentions: (post.mentions as any) || [],
        };
      });
    },
    enabled: !!user && !!groupId,
  });

  // Fetch group members for @mentions and member list
  const { data: groupMembers = [] } = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: async () => {
      const { data: memberships, error } = await api
        .from('group_memberships')
        .select(
          'user_id, role, joined_at, profiles!group_memberships_user_id_fkey(display_name, avatar_url)',
        )
        .eq('group_id', groupId)
        .order('role', { ascending: true })
        .order('joined_at', { ascending: true });

      if (error) throw error;

      return (
        memberships?.map((membership) => {
          const profile = (membership as any).profiles;
          return {
            user_id: membership.user_id,
            role: membership.role,
            joined_at: membership.joined_at,
            profiles: {
              display_name: profile?.display_name || 'Unknown User',
              avatar_url: profile?.avatar_url || '',
              social_links: {},
            },
          };
        }) || []
      );
    },
    enabled: !!user && !!groupId,
  });

  // Create post mutation
  const createPostMutation = useMutation({
    mutationFn: async ({
      content,
      postType = 'text',
      isPinned = false,
      pollData = null,
      mentions = [],
    }: {
      content: string;
      postType?: 'text' | 'announcement' | 'poll';
      isPinned?: boolean;
      pollData?: any;
      mentions?: Array<{ user_id: string; username: string }>;
    }) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await api
        .from('group_posts')
        .insert({
          group_id: groupId,
          user_id: user.id,
          content,
          post_type: postType,
          is_pinned: isPinned,
          poll_data: pollData,
          mentions: mentions,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-posts', groupId] });
      toast({
        title: 'Post created',
        description: 'Your post has been shared with the group.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to create post',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Like post mutation
  const likePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { error } = await api.from('group_post_likes').insert({
        post_id: postId,
        user_id: user.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-posts', groupId] });
    },
  });

  // Unlike post mutation
  const unlikePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { error } = await api
        .from('group_post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-posts', groupId] });
    },
  });

  // Vote on poll mutation
  const voteOnPollMutation = useMutation({
    mutationFn: async ({ postId, optionIndex }: { postId: string; optionIndex: number }) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { error } = await api.from('group_poll_votes').upsert({
        post_id: postId,
        user_id: user.id,
        option_index: optionIndex,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-posts', groupId] });
    },
  });

  // Pin/unpin post mutation
  const togglePinMutation = useMutation({
    mutationFn: async ({ postId, isPinned }: { postId: string; isPinned: boolean }) => {
      const { error } = await api
        .from('group_posts')
        .update({ is_pinned: isPinned })
        .eq('id', postId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-posts', groupId] });
      toast({
        title: 'Post updated',
        description: 'Post pin status has been updated.',
      });
    },
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
    isTogglingPin: togglePinMutation.isPending,
  };
};
