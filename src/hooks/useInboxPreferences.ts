import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface InboxPreferences {
  post_likes: boolean;
  post_comments: boolean;
  post_mentions: boolean;
}

/** Everything on until the member turns something off (no row = all on). */
export const DEFAULT_INBOX_PREFERENCES: InboxPreferences = {
  post_likes: true,
  post_comments: true,
  post_mentions: true,
};

const key = (userId: string | undefined) => ['inbox-preferences', userId] as const;

/** Which post notifications show in the member's own inbox. */
export function useInboxPreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: key(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<InboxPreferences> => {
      const { data, error } = await supabase
        .from('inbox_preferences')
        .select('post_likes, post_comments, post_mentions')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return { ...DEFAULT_INBOX_PREFERENCES, ...(data ?? {}) };
    },
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<InboxPreferences>) => {
      const next = { ...(query.data ?? DEFAULT_INBOX_PREFERENCES), ...patch };
      const { error } = await supabase.from('inbox_preferences').upsert(
        { user_id: user!.id, ...next, updated_at: new Date().toISOString() },
        {
          onConflict: 'user_id',
        },
      );
      if (error) throw error;
      return next;
    },
    onMutate: async (patch) => {
      const previous = queryClient.getQueryData<InboxPreferences>(key(user?.id));
      queryClient.setQueryData<InboxPreferences>(key(user?.id), {
        ...(previous ?? DEFAULT_INBOX_PREFERENCES),
        ...patch,
      });
      return { previous };
    },
    onError: (_error, _patch, context) => {
      queryClient.setQueryData(key(user?.id), context?.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key(user?.id) });
      // The inbox list and badges read these settings server-side.
      void queryClient.invalidateQueries({ queryKey: ['inbox-feed'] });
      void queryClient.invalidateQueries({ queryKey: ['inbox-unread'] });
      void queryClient.invalidateQueries({ queryKey: ['inbox-orphan-count'] });
    },
  });

  return {
    preferences: query.data ?? DEFAULT_INBOX_PREFERENCES,
    isLoading: query.isLoading,
    error: update.error,
    setPreference: (patch: Partial<InboxPreferences>) => update.mutate(patch),
  };
}
