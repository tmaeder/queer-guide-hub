/**
 * useWatchedUrls — manage a signed-in user's watched sites. CRUD goes straight
 * to the `watched_urls` table; RLS ("users manage own watched_urls") scopes
 * everything to auth.uid(), so no worker/edge call is needed. The
 * refresh-watched-urls cron re-checks each row and auto-imports new content.
 */

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface WatchedUrl {
  id: string;
  url: string;
  frequency_minutes: number;
  is_active: boolean;
  last_checked_at: string | null;
  last_imported_at: string | null;
  imported_count: number;
  created_at: string;
}

const SELECT = 'id,url,frequency_minutes,is_active,last_checked_at,last_imported_at,imported_count,created_at';

// `as 'venues'` mirrors useSubmission — watched_urls isn't in the generated types.
const table = () => supabase.from('watched_urls' as 'venues');

export function useWatchedUrls() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = useMemo(() => ['watched_urls', user?.id], [user?.id]);

  const { data: watches = [], isLoading } = useQuery<WatchedUrl[]>({
    queryKey: key,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await table()
        .select(SELECT)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as WatchedUrl[];
    },
  });

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: key }), [qc, key]);

  const addWatch = useMutation({
    mutationFn: async ({ url, frequency_minutes = 1440 }: { url: string; frequency_minutes?: number }) => {
      if (!user) throw new Error('sign in required');
      const { error } = await table().insert({
        url,
        frequency_minutes,
        user_id: user.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const toggleWatch = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await table().update({ is_active } as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeWatch = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await table().delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { watches, isLoading, addWatch, toggleWatch, removeWatch };
}
