import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type CommunityPost = Database['public']['Tables']['community_posts']['Row'];
type CommunityPostInsert = Database['public']['Tables']['community_posts']['Insert'];
type PostComment = Database['public']['Tables']['post_comments']['Row'];

export function useCommunity() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = async (filters?: {
    userId?: string;
    postType?: string;
    tags?: string[];
    search?: string;
  }) => {
    try {
      setLoading(true);
      let query = supabase
        .from('community_posts')
        .select(`
          *,
          profiles:user_id(display_name, avatar_url),
          post_likes(id),
          post_comments(id)
        `)
        .eq('visibility', 'public')
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters?.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters?.postType) {
        query = query.eq('post_type', filters.postType);
      }

      if (filters?.tags && filters.tags.length > 0) {
        query = query.overlaps('tags', filters.tags);
      }

      if (filters?.search) {
        query = query.ilike('content', `%${filters.search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setPosts(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch posts');
    } finally {
      setLoading(false);
    }
  };

  const createPost = async (post: CommunityPostInsert) => {
    try {
      const { data, error } = await supabase
        .from('community_posts')
        .insert([post])
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (err) {
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Failed to create post' 
      };
    }
  };

  const toggleLike = async (postId: string) => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error('Must be logged in to like posts');

      const { data: existing } = await supabase
        .from('post_likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .single();

      if (existing) {
        // Remove like
        const { error } = await supabase
          .from('post_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id);
        if (error) throw error;
        
        // Update likes count
        await supabase.rpc('decrement_post_likes', { post_id: postId });
        return { liked: false, error: null };
      } else {
        // Add like
        const { error } = await supabase
          .from('post_likes')
          .insert({ post_id: postId, user_id: user.id });
        if (error) throw error;
        
        // Update likes count
        await supabase.rpc('increment_post_likes', { post_id: postId });
        return { liked: true, error: null };
      }
    } catch (err) {
      return { 
        liked: false,
        error: err instanceof Error ? err.message : 'Failed to toggle like' 
      };
    }
  };

  const addComment = async (postId: string, content: string, parentCommentId?: string) => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error('Must be logged in to comment');

      const { data, error } = await supabase
        .from('post_comments')
        .insert({
          post_id: postId,
          user_id: user.id,
          content,
          parent_comment_id: parentCommentId
        })
        .select()
        .single();

      if (error) throw error;
      
      // Update comments count
      await supabase.rpc('increment_post_comments', { post_id: postId });
      return { data, error: null };
    } catch (err) {
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Failed to add comment' 
      };
    }
  };

  const followUser = async (userId: string) => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error('Must be logged in to follow users');

      const { data: existing } = await supabase
        .from('user_follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', userId)
        .single();

      if (existing) {
        // Unfollow
        const { error } = await supabase
          .from('user_follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', userId);
        if (error) throw error;
        return { following: false, error: null };
      } else {
        // Follow
        const { error } = await supabase
          .from('user_follows')
          .insert({ follower_id: user.id, following_id: userId });
        if (error) throw error;
        return { following: true, error: null };
      }
    } catch (err) {
      return { 
        following: false,
        error: err instanceof Error ? err.message : 'Failed to toggle follow' 
      };
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  return {
    posts,
    loading,
    error,
    fetchPosts,
    createPost,
    toggleLike,
    addComment,
    followUser,
    refetch: () => fetchPosts(),
  };
}