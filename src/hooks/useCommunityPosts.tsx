import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Tables } from '@/integrations/supabase/types';

export type CommunityPost = Tables<'community_posts'> & {
  profiles?: {
    display_name: string;
    avatar_url: string | null;
    user_id: string;
  };
  user_liked?: boolean;
};

export interface CreatePostData {
  content: string;
  images?: string[];
  post_type?: 'text' | 'image' | 'link' | 'poll';
  visibility?: 'public' | 'friends' | 'private';
  link_url?: string;
  link_title?: string;
  link_description?: string;
  poll_options?: Record<string, unknown>;
  mentions?: Array<{ user_id: string; username: string }>;
  tags?: string[];
}

export const useCommunityPosts = (userId?: string) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch posts for a specific user or all public posts
  const { data: posts = [], isLoading, error } = useQuery({
    queryKey: ['community-posts', userId],
    queryFn: async () => {
      let query = supabase
        .from('community_posts')
        .select(`
          *,
          profiles (
            display_name,
            avatar_url,
            user_id
          )
        `)
        .order('created_at', { ascending: false });

      // If userId is provided, filter by that user
      if (userId) {
        query = query.eq('user_id', userId);
      } else {
        // Otherwise get public posts
        query = query.eq('visibility', 'public');
      }

      const { data, error } = await query;
      
      if (error) throw error;

      // Check which posts the current user has liked
      if (user && data?.length) {
        const postIds = data.map(post => post.id);
        const { data: likes } = await supabase
          .from('post_likes')
          .select('post_id')
          .in('post_id', postIds)
          .eq('user_id', user.id);

        const likedPostIds = new Set(likes?.map(like => like.post_id));

        return data.map(post => ({
          ...post,
          user_liked: likedPostIds.has(post.id)
        })) as CommunityPost[];
      }

      return data as CommunityPost[];
    },
    enabled: true,
  });

  // Create post mutation
  const createPostMutation = useMutation({
    mutationFn: async (postData: CreatePostData) => {
      if (!user) throw new Error('Must be logged in to create posts');

      const { data, error } = await supabase
        .from('community_posts')
        .insert({
          user_id: user.id,
          content: postData.content,
          images: postData.images || [],
          post_type: postData.post_type || 'text',
          visibility: postData.visibility || 'public',
          link_url: postData.link_url,
          link_title: postData.link_title,
          link_description: postData.link_description,
          poll_options: postData.poll_options,
          mentions: postData.mentions || [],
          tags: postData.tags || [],
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      toast({
        title: "Post created",
        description: "Your post has been shared successfully."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create post",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Like post mutation
  const likePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      if (!user) throw new Error('Must be logged in to like posts');

      const { error } = await supabase
        .from('post_likes')
        .insert({
          post_id: postId,
          user_id: user.id,
        });

      if (error) throw error;

      // Increment likes count
      await supabase.rpc('increment_post_likes', { post_id: postId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
    },
  });

  // Unlike post mutation
  const unlikePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      if (!user) throw new Error('Must be logged in to unlike posts');

      const { error } = await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id);

      if (error) throw error;

      // Decrement likes count
      await supabase.rpc('decrement_post_likes', { post_id: postId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
    },
  });

  // Delete post mutation
  const deletePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      if (!user) throw new Error('Must be logged in to delete posts');

      const { error } = await supabase
        .from('community_posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', user.id); // Only allow users to delete their own posts

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      toast({
        title: "Post deleted",
        description: "Your post has been deleted successfully."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete post",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Set up real-time subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('community-posts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_posts'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['community-posts'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_likes'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['community-posts'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_comments'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['community-posts'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    posts,
    isLoading,
    error,
    createPost: createPostMutation.mutate,
    isCreatingPost: createPostMutation.isPending,
    likePost: likePostMutation.mutate,
    unlikePost: unlikePostMutation.mutate,
    isLikingPost: likePostMutation.isPending || unlikePostMutation.isPending,
    deletePost: deletePostMutation.mutate,
    isDeletingPost: deletePostMutation.isPending,
  };
};
