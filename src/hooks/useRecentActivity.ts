import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { CommunityDomain } from '@/lib/score';

export interface ActivityEventRow {
  id: number;
  user_id: string;
  domain: CommunityDomain;
  event_type: string;
  target_kind: string | null;
  target_id: string | null;
  points_delta: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Reads the current user's most recent activity events (self-RLS only — other
 * users' events are never readable). Realtime subscribes so new events show
 * up live without refresh.
 */
export function useRecentActivity(
  limit = 12,
  userId?: string,
): {
  events: ActivityEventRow[];
  loading: boolean;
} {
  const { user } = useAuth();
  const targetId = userId ?? user?.id;
  const isSelf = !!targetId && targetId === user?.id;
  const [events, setEvents] = useState<ActivityEventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!targetId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('user_activity_events' as any)
        .select('id, user_id, domain, event_type, target_kind, target_id, points_delta, metadata, created_at')
        .eq('user_id', targetId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (cancelled) return;
      setEvents((data as ActivityEventRow[]) ?? []);
      setLoading(false);
    })();

    // Realtime only for the signed-in user's own feed. Another user's feed (when
    // RLS permits it via their opt-in) is fetched once, not live-subscribed.
    if (!isSelf) {
      return () => {
        cancelled = true;
      };
    }

    const channel = supabase
      .channel(`activity:${targetId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_activity_events',
          filter: `user_id=eq.${targetId}`,
        },
        (payload) => {
          const ev = payload.new as ActivityEventRow;
          setEvents((prev) => [ev, ...prev].slice(0, limit));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [targetId, isSelf, limit]);

  return { events, loading };
}
