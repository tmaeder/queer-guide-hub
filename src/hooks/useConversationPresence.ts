import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import {
  channelName,
  shouldBroadcast,
  type PresenceScope,
  type PresenceVisibility,
} from '@/lib/presence';

interface PresenceEntry {
  user_id: string;
  online_at: string;
}

/**
 * Generic Supabase Realtime presence reader. Tracks the current user on the
 * scoped channel *only if* their visibility settings permit it (conversation
 * scope is always-on for participants), and returns the set of other user_ids
 * currently present. Reading is always allowed; appearing requires opt-in.
 *
 * Channel topic comes from `src/lib/presence.ts#channelName`, so every
 * presence-aware surface shares one naming contract.
 */
export function usePresenceSet(scope: PresenceScope, id?: string): Set<string> {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [online, setOnline] = useState<Set<string>>(() => new Set());

  const visibility = (profile?.presence_visibility ?? null) as PresenceVisibility | null;
  const broadcast = shouldBroadcast(scope, visibility);
  // Conversation scope needs an id; global does not. Bail if a scoped channel
  // is missing its id rather than throwing inside channelName.
  const needsId = scope !== 'global';
  const ready = !!user?.id && (!needsId || !!id);

  useEffect(() => {
    if (!ready) return;
    const topic = channelName(scope, id);
    const channel = supabase.channel(topic, {
      config: { presence: { key: user!.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceEntry>();
        const next = new Set<string>();
        for (const key of Object.keys(state)) {
          if (key === user!.id) continue; // others only
          if (state[key]?.length) next.add(key);
        }
        setOnline(next);
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        if (broadcast) {
          await channel.track({
            user_id: user!.id,
            online_at: new Date().toISOString(),
          } satisfies PresenceEntry);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [ready, scope, id, user, broadcast]);

  return online;
}

/** Presence for an open 1:1/group thread (always-on for participants). */
export function useConversationPresence(conversationId: string | undefined): Set<string> {
  return usePresenceSet('conversation', conversationId);
}

/** App-wide presence of users who opted into the global dot. */
export function useGlobalPresence(): Set<string> {
  return usePresenceSet('global');
}
