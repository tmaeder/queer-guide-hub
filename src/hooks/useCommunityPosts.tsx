import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useId, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';

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

const PAGE_SIZE = 20;

type Page = { posts: CommunityPost[]; nextPage: number | null };

export const useCommunityPosts = (userId?: string) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Unique per hook instance. Feed and CreatePostDialog both call this hook on
  // the signed-in feed; a shared static channel topic made the second mount call
  // `.on()` on an already-subscribed channel, which throws and crashed the page.
  const instanceId = useId();

  const {
    data,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<Page>({
    queryKey: ['community-posts', userId ?? null, user?.id ?? null],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const page = (pageParam as number) ?? 0;
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('community_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (userId) {
        query = query.eq('user_id', userId);
      } else {
        query = query.eq('visibility', 'public');
      }

      const { data: rows, error: queryError } = await query;
      if (queryError) throw queryError;
      if (!rows?.length) return { posts: [], nextPage: null };

      // Resolve profiles + likes in parallel. We avoid PostgREST embedding
      // (`profiles ( ... )`) because community_posts has no direct FK to
      // public.profiles — both reference auth.users — and an ambiguous embed
      // would surface as a render-time crash on the Feed page (D1).
      const userIds = Array.from(new Set(rows.map((p) => p.user_id).filter(Boolean)));
      const [profilesRes, likesRes] = await Promise.all([
        userIds.length
          ? supabase
              .from('profiles')
              .select('user_id, display_name, avatar_url')
              .in('user_id', userIds)
          : Promise.resolve({
              data: [] as Array<{
                user_id: string;
                display_name: string | null;
                avatar_url: string | null;
              }>,
            }),
        user
          ? supabase
              .from('post_likes')
              .select('post_id')
              .in('post_id', rows.map((p) => p.id))
              .eq('user_id', user.id)
          : Promise.resolve({ data: [] as Array<{ post_id: string }> }),
      ]);

      const profileMap = new Map(
        (profilesRes.data ?? []).map((p) => [p.user_id, p]),
      );
      const likedPostIds = new Set((likesRes.data ?? []).map((l) => l.post_id));

      const posts = rows.map((post) => {
        const profile = profileMap.get(post.user_id);
        return {
          ...post,
          profiles: profile
            ? {
                user_id: profile.user_id,
                display_name: profile.display_name ?? 'Unknown User',
                avatar_url: profile.avatar_url,
              }
            : undefined,
          user_liked: likedPostIds.has(post.id),
        };
      }) as CommunityPost[];

      return {
        posts,
        nextPage: rows.length === PAGE_SIZE ? page + 1 : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

  const posts = useMemo(
    () => data?.pages.flatMap((p) => p.posts) ?? ([] as CommunityPost[]),
    [data],
  );

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
      .channel(`community-posts-changes-${instanceId}`)
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
  }, [queryClient, instanceId]);

  return {
    posts,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
    createPost: createPostMutation.mutate,
    isCreatingPost: createPostMutation.isPending,
    likePost: likePostMutation.mutate,
    unlikePost: unlikePostMutation.mutate,
    isLikingPost: likePostMutation.isPending || unlikePostMutation.isPending,
    deletePost: deletePostMutation.mutate,
    isDeletingPost: deletePostMutation.isPending,
  };
};
