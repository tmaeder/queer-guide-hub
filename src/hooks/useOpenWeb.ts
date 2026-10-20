import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CommunityPost } from '@/hooks/useCommunityPosts';

export type ResolvedHandle = {
  user_id?: string;
  username?: string;
  open_web?: boolean;
  redirect?: string;
};

/** /@handle → user id (or the new handle after a rename). Null = no such handle. */
export function useResolveHandle(handle: string | null) {
  return useQuery({
    queryKey: ['resolve-handle', handle],
    enabled: !!handle,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('resolve_handle', { p_handle: handle! });
      if (error) throw error;
      return (data ?? null) as ResolvedHandle | null;
    },
  });
}

/** One community post (RLS decides visibility) with its author's display fields. */
export function usePost(postId: string | undefined) {
  return useQuery({
    queryKey: ['community-post', postId],
    enabled: !!postId,
    queryFn: async (): Promise<CommunityPost | null> => {
      const { data: post, error } = await supabase
        .from('community_posts')
        .select('*')
        .eq('id', postId!)
        .maybeSingle();
      if (error) throw error;
      if (!post) return null;
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .eq('user_id', post.user_id)
        .maybeSingle();
      return {
        ...post,
        profiles: profile
          ? {
              user_id: profile.user_id,
              display_name: profile.display_name ?? 'Unknown User',
              avatar_url: profile.avatar_url,
            }
          : undefined,
      } as CommunityPost;
    },
  });
}
