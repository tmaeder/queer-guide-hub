import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';

export interface PresentMember {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  online_at: string;
}

/**
 * Supabase Realtime Presence — surfaces "who else is viewing this trip
 * right now". Each connected client `track()`s itself in a channel
 * keyed by tripId; everyone else sees the diff. Channel auto-cleans
 * on unmount via `removeChannel`.
 *
 * Caller must be authed (the current user is excluded from the returned
 * list — we only show the OTHER people present).
 */
export function useTripPresence(tripId: string | undefined): PresentMember[] {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [members, setMembers] = useState<PresentMember[]>([]);

  const displayName = profile?.display_name ?? null;
  const avatarUrl = profile?.avatar_url ?? null;

  useEffect(() => {
    if (!tripId || !user?.id) return;

    const channel = supabase.channel(`trip-presence:${tripId}`, {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresentMember>();
        const flat: PresentMember[] = [];
        for (const userId of Object.keys(state)) {
          if (userId === user.id) continue; // exclude self
          const entries = state[userId];
          if (entries && entries.length > 0) {
            flat.push(entries[0]);
          }
        }
        setMembers(flat);
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        await channel.track({
          user_id: user.id,
          display_name: displayName,
          avatar_url: avatarUrl,
          online_at: new Date().toISOString(),
        } satisfies PresentMember);
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tripId, user?.id, displayName, avatarUrl]);

  return members;
}
