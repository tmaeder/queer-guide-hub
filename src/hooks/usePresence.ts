import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  channelName,
  shouldBroadcast,
  type PresenceScope,
  type PresenceVisibility,
} from '@/lib/presence';

export interface PresencePayload {
  user_id: string;
  last_seen: string;
  [key: string]: unknown;
}

interface UsePresenceArgs {
  scope: PresenceScope;
  id?: string;
  visibility: PresenceVisibility | null;
  /** Extra payload merged into the broadcast (e.g. activity hints). */
  extra?: Record<string, unknown>;
  /** Disable entirely (useful while data is loading). */
  enabled?: boolean;
}

/**
 * Joins a Supabase Realtime Presence channel. Always reads other participants;
 * only broadcasts self when the user has opted in for the scope (see
 * shouldBroadcast()). Tears down on tab hidden + on unmount.
 */
export function usePresence({
  scope,
  id,
  visibility,
  extra,
  enabled = true,
}: UsePresenceArgs): PresencePayload[] {
  const { user } = useAuth();
  const [others, setOthers] = useState<PresencePayload[]>([]);

  useEffect(() => {
    if (!enabled || !user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setOthers([]);
      return;
    }

    let channel: RealtimeChannel | null = null;
    let cleanup: (() => void) | null = null;
    const name = channelName(scope, id);

    const init = () => {
      channel = supabase.channel(name, {
        config: { presence: { key: user.id } },
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          if (!channel) return;
          const state = channel.presenceState<PresencePayload>();
          const list: PresencePayload[] = [];
          for (const [uid, payloads] of Object.entries(state)) {
            if (uid === user.id) continue;
            if (payloads && payloads[0]) list.push(payloads[0]);
          }
          setOthers(list);
        })
        .subscribe(async (status) => {
          if (status !== 'SUBSCRIBED' || !channel) return;
          if (shouldBroadcast(scope, visibility)) {
            await channel.track({
              user_id: user.id,
              last_seen: new Date().toISOString(),
              ...extra,
            });
          }
        });
    };

    const onVisibility = () => {
      if (document.hidden && channel) {
        void supabase.removeChannel(channel);
        channel = null;
        setOthers([]);
      } else if (!channel && !document.hidden) {
        init();
      }
    };

    init();
    document.addEventListener('visibilitychange', onVisibility);

    cleanup = () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (channel) void supabase.removeChannel(channel);
    };
    return () => cleanup?.();
  }, [enabled, user, scope, id, visibility, extra]);

  return others;
}
