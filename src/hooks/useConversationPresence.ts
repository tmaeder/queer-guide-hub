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

// Ref-counted singleton channels keyed by topic. Multiple hook instances (e.g.
// useGlobalPresence in both LayoutShell and MessagingInterface) MUST share one
// Supabase channel per topic — subscribing the same topic twice throws
// "cannot add callbacks after subscribe()" and blanks the consumer via the
// ErrorBoundary. Presence is inherently shared, so a singleton is also correct.
interface TopicEntry {
  channel: ReturnType<typeof supabase.channel>;
  online: Set<string>;
  listeners: Set<(s: Set<string>) => void>;
  refs: number;
}
const registry = new Map<string, TopicEntry>();

function acquireTopic(
  topic: string,
  userId: string,
  broadcast: boolean,
  onChange: (s: Set<string>) => void,
): () => void {
  let entry = registry.get(topic);
  if (!entry) {
    const channel = supabase.channel(topic, { config: { presence: { key: userId } } });
    const created: TopicEntry = { channel, online: new Set(), listeners: new Set(), refs: 0 };
    registry.set(topic, created);
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceEntry>();
        const next = new Set<string>();
        for (const key of Object.keys(state)) {
          if (key === userId) continue;
          if (state[key]?.length) next.add(key);
        }
        created.online = next;
        created.listeners.forEach((l) => l(next));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && broadcast) {
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          } satisfies PresenceEntry);
        }
      });
    entry = created;
  }
  entry.refs += 1;
  entry.listeners.add(onChange);
  onChange(entry.online);

  return () => {
    const e = registry.get(topic);
    if (!e) return;
    e.listeners.delete(onChange);
    e.refs -= 1;
    if (e.refs <= 0) {
      void supabase.removeChannel(e.channel);
      registry.delete(topic);
    }
  };
}

/**
 * Generic Supabase Realtime presence reader. Shares one ref-counted channel per
 * topic across all hook instances. Tracks the current user only if their
 * visibility settings permit (conversation scope is always-on for participants);
 * reading is always allowed.
 */
export function usePresenceSet(scope: PresenceScope, id?: string): Set<string> {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [online, setOnline] = useState<Set<string>>(() => new Set());

  const visibility = (profile?.presence_visibility ?? null) as PresenceVisibility | null;
  const broadcast = shouldBroadcast(scope, visibility);
  const needsId = scope !== 'global';
  const ready = !!user?.id && (!needsId || !!id);

  useEffect(() => {
    if (!ready) return;
    const topic = channelName(scope, id);
    const release = acquireTopic(topic, user!.id, broadcast, setOnline);
    return release;
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
