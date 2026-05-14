import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';

export type PostComment = Tables<'post_comments'> & {
  profiles?: {
    display_name: string;
    avatar_url: string | null;
    user_id: string;
  };
  user_liked?: boolean;
};

export interface CreateCommentData {
  content: string;
  parent_comment_id?: string;
  mentions?: Array<{ user_id: string; username: string }>;
}

export const useComments = (postId: string) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch comments for a post
  const { data: comments = [], isLoading, error } = useQuery({
    queryKey: ['post-comments', postId],
    queryFn: async () => {
      const commentsPromise = supabase
        .from('post_comments')
        .select(`
          *,
          profiles (
            display_name,
            avatar_url,
            user_id
          )
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      const likesPromise = user
        ? supabase
            .from('comment_likes')
            .select('comment_id')
            .eq('user_id', user.id)
        : Promise.resolve({ data: null });

      const [commentsResult, likesResult] = await Promise.all([commentsPromise, likesPromise]);

      if (commentsResult.error) throw commentsResult.error;
      const data = commentsResult.data;

      if (user && data?.length && likesResult.data) {
        const commentIds = new Set(data.map(c => c.id));
        const likedCommentIds = new Set(
          likesResult.data
            .filter(like => commentIds.has(like.comment_id))
            .map(like => like.comment_id)
        );

        return data.map(comment => ({
          ...comment,
          user_liked: likedCommentIds.has(comment.id)
        })) as PostComment[];
      }

      return data as PostComment[];
    },
    enabled: !!postId,
  });

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: async (commentData: CreateCommentData) => {
      if (!user) throw new Error('Must be logged in to comment');

      const { data, error } = await supabase
        .from('post_comments')
        .insert({
          post_id: postId,
          user_id: user.id,
          content: commentData.content,
          parent_comment_id: commentData.parent_comment_id,
          mentions: commentData.mentions || [],
        })
        .select()
        .single();

      if (error) throw error;

      // Increment comments count on post
      await supabase.rpc('increment_post_comments', { post_id: postId });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      toast({
        title: "Comment added",
        description: "Your comment has been posted successfully."
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to post comment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Like comment mutation
  const likeCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      if (!user) throw new Error('Must be logged in to like comments');

      const { error } = await supabase
        .from('comment_likes')
        .insert({
          comment_id: commentId,
          user_id: user.id,
        });

      if (error) throw error;

      // Increment likes count
      await supabase.rpc('increment_comment_likes', { comment_id: commentId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
    },
  });

  // Unlike comment mutation
  const unlikeCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      if (!user) throw new Error('Must be logged in to unlike comments');

      const { error } = await supabase
        .from('comment_likes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', user.id);

      if (error) throw error;

      // Decrement likes count
      await supabase.rpc('decrement_comment_likes', { comment_id: commentId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
    },
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      if (!user) throw new Error('Must be logged in to delete comments');

      const { error } = await supabase
        .from('post_comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', user.id); // Only allow users to delete their own comments

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      toast({
        title: "Comment deleted",
        description: "Your comment has been deleted successfully."
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete comment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Set up real-time subscriptions for comments
  useEffect(() => {
    const channel = supabase
      .channel(`post-comments-${postId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_comments',
          filter: `post_id=eq.${postId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comment_likes'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['post-comments', postId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [postId, queryClient]);

  return {
    comments,
    isLoading,
    error,
    createComment: createCommentMutation.mutate,
    isCreatingComment: createCommentMutation.isPending,
    likeComment: likeCommentMutation.mutate,
    unlikeComment: unlikeCommentMutation.mutate,
    isLikingComment: likeCommentMutation.isPending || unlikeCommentMutation.isPending,
    deleteComment: deleteCommentMutation.mutate,
    isDeletingComment: deleteCommentMutation.isPending,
  };
};