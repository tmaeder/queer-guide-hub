/**
 * Header badge count for the /trips entry.
 *
 * Counts rows in `reservations` that are orphan (no trip_id) and still
 * open (not cancelled/completed) for the current user. Poll every 60 s
 * as a safety net, but the main freshness signal is Supabase Realtime —
 * any INSERT / UPDATE on `reservations` for the user invalidates the
 * query, so a new imported_email arrival or an attach-to-trip flip
 * shows up without waiting for the next poll.
 *
 * Previously this read `inbox_orphan_count_v`, which made the badge brittle
 * to a deploy race between the frontend bundle and the migration that
 * creates the view — during that window every authenticated user logged
 * 404s on `/rest/v1/inbox_orphan_count_v`. A direct count on `reservations`
 * is cheap (index on user_id + trip_id filter) and never 404s.
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
    // Never retry — the badge is decorative. A 404/timeout just means
    // "no number shown this tick"; React Query's default 3-retry loop
    // would amplify the problem in any outage.
    retry: false,
    queryFn: async (): Promise<number> => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('trip_id', null)
        .not('status', 'in', '("cancelled","completed")');
      // Swallow any transient error (schema cache miss, 5xx, etc.) —
      // badge shows 0 until the next poll. No thrown error means no
      // network-failure entry in the feedback capture.
      if (error) return 0;
      return count ?? 0;
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
