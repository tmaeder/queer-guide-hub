import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface FollowedTag {
  tagId: string;
  name: string;
  slug: string | null;
}

async function fetchFollowedTags(): Promise<FollowedTag[]> {
  const { data, error } = await supabase.rpc('get_followed_tags');
  if (error || !data) return [];
  return (data as Array<{ tag_id: string; name: string; slug: string | null }>).map((r) => ({
    tagId: r.tag_id,
    name: r.name,
    slug: r.slug,
  }));
}

/**
 * Follow/unfollow tags and read the signed-in user's followed set. Anonymous
 * users get an empty set and a sign-in prompt on follow. Backed by the
 * tag_follows table via follow_tag / unfollow_tag / get_followed_tags RPCs.
 */
export function useFollowedTags() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const key = ['followed-tags', user?.id];

  const { data: followedTags = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: fetchFollowedTags,
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const isFollowing = (tagId: string) => followedTags.some((t) => t.tagId === tagId);

  const mutation = useMutation({
    mutationFn: async ({ tagId, follow }: { tagId: string; follow: boolean }) => {
      const fn = follow ? 'follow_tag' : 'unfollow_tag';
      const { error } = await supabase.rpc(fn, { p_tag_id: tagId });
      if (error) throw error;
    },
    onError: () => {
      toast({ title: 'Could not update follow', variant: 'destructive' });
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const toggleFollow = (tag: { tagId: string; name?: string; slug?: string | null }) => {
    if (!user) {
      toast({ title: 'Sign in to follow tags' });
      return;
    }
    const follow = !isFollowing(tag.tagId);
    // Optimistic
    queryClient.setQueryData<FollowedTag[]>(key, (prev = []) =>
      follow
        ? [{ tagId: tag.tagId, name: tag.name ?? '', slug: tag.slug ?? null }, ...prev]
        : prev.filter((t) => t.tagId !== tag.tagId),
    );
    mutation.mutate({ tagId: tag.tagId, follow });
  };

  return { followedTags, isFollowing, toggleFollow, loading: isLoading, signedIn: !!user };
}
