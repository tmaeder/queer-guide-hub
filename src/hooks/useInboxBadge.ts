/**
 * Header badge count for the /trips/inbox entry.
 *
 * Reads `inbox_orphan_count_v` for the current user. Poll every 60 s as
 * a safety net, but the main freshness signal is Supabase Realtime —
 * any INSERT / UPDATE on `reservations` for the user invalidates the
 * query, so a new imported_email arrival or an attach-to-trip flip
 * shows up without waiting for the next poll.
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const KEY = (userId: string | undefined) => ['inbox-orphan-count', userId] as const;

export function useInboxBadge(): number {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: KEY(user?.id),
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<number> => {
      if (!user) return 0;
      const { data, error } = await supabase
        .from('inbox_orphan_count_v')
        .select('orphan_count')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as { orphan_count: number } | null)?.orphan_count ?? 0;
    },
  });

  // Realtime invalidation — any change to the user's reservations can
  // move the counter. Cheaper than polling at 5 s.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`reservations:badge:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations', filter: `user_id=eq.${user.id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: KEY(user.id) });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  return query.data ?? 0;
}
