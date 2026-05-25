import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_PRESENCE_VISIBILITY,
  type PresenceVisibility,
} from '@/lib/presence';
import type { TravelMode, UserStatus } from '@/hooks/useStatus';

interface ProfileStatusRow {
  user_id: string;
  status_emoji: string | null;
  status_text: string | null;
  status_expires_at: string | null;
  availability_tags: string[] | null;
  dnd_active: boolean | null;
  travel_mode: Record<string, unknown> | null;
}

function rowToStatus(row: ProfileStatusRow | null): UserStatus | null {
  if (!row) return null;
  let travel: TravelMode | null = null;
  if (row.travel_mode && typeof row.travel_mode === 'object') {
    const obj = row.travel_mode as Record<string, unknown>;
    if (obj.city_id || obj.city_name || obj.note) {
      travel = {
        city_id: typeof obj.city_id === 'string' ? obj.city_id : undefined,
        city_name: typeof obj.city_name === 'string' ? obj.city_name : undefined,
        until: typeof obj.until === 'string' ? obj.until : undefined,
        note: typeof obj.note === 'string' ? obj.note : undefined,
      };
    }
  }
  // Visibility is implicit: presence of the row in the view means in_directory=true.
  const visibility: PresenceVisibility = {
    ...DEFAULT_PRESENCE_VISIBILITY,
    in_directory: true,
  };
  return {
    emoji: row.status_emoji,
    text: row.status_text,
    expiresAt: row.status_expires_at,
    tags: row.availability_tags ?? [],
    dndUntil: null,
    dndActive: Boolean(row.dnd_active),
    travel,
    visibility,
  };
}

/**
 * Read another user's status from the public profile_status_v view. Returns
 * null when the target hasn't opted in to status visibility.
 */
export function usePublicStatus(userId: string | null | undefined): {
  status: UserStatus | null;
  loading: boolean;
} {
  const [row, setRow] = useState<ProfileStatusRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setRow(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('profile_status_v' as any)
        .select(
          'user_id, status_emoji, status_text, status_expires_at, availability_tags, dnd_active, travel_mode',
        )
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      setRow((data as ProfileStatusRow | null) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { status: rowToStatus(row), loading };
}
