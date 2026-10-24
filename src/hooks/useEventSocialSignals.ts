import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface EventSocialSignal {
  event_id: string;
  friends_going: number;
  attending_count: number;
}

/**
 * Batch-fetch social-proof counts for events. Mirror of useVenueSocialSignals.
 * Returns a Map<event_id, EventSocialSignal>.
 *
 * Signed-in only: the RPC is not executable by `anon` (revoked on purpose —
 * `p_viewer_id` is caller-supplied, so an anon grant would expose any
 * user's friend counts). Calling it signed out only produced 401s.
 */
export function useEventSocialSignals(eventIds: string[] | undefined) {
  const { user } = useAuth();
  const ids = (eventIds ?? []).filter(Boolean).sort();
  const key = ids.join(',');

  return useQuery({
    queryKey: ['event-social-signals', key, user?.id ?? 'anon'],
    enabled: !!user && ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, EventSocialSignal>> => {
      const { data, error } = await supabase.rpc('get_event_social_signals', {
        p_event_ids: ids,
        p_viewer_id: user?.id ?? null,
      });
      if (error) throw error;
      const out = new Map<string, EventSocialSignal>();
      for (const row of (data ?? []) as EventSocialSignal[]) {
        out.set(row.event_id, row);
      }
      return out;
    },
  });
}
