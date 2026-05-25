import { useCallback, useMemo } from 'react';
import { useProfile } from '@/hooks/useProfile';
import {
  DEFAULT_PRESENCE_VISIBILITY,
  type PresenceVisibility,
} from '@/lib/presence';

export interface TravelMode {
  city_id?: string;
  city_name?: string;
  until?: string; // ISO timestamp
  note?: string;
}

export interface UserStatus {
  emoji: string | null;
  text: string | null;
  expiresAt: string | null;
  tags: string[];
  dndUntil: string | null;
  dndActive: boolean;
  travel: TravelMode | null;
  visibility: PresenceVisibility;
}

export interface StatusUpdate {
  emoji?: string | null;
  text?: string | null;
  expiresAt?: string | null;
  tags?: string[];
  dndUntil?: string | null;
  travel?: TravelMode | null;
  visibility?: Partial<PresenceVisibility>;
}

export const AVAILABILITY_TAGS = [
  'chat',
  'coffee',
  'meet',
  'advice',
  'venue-buddy',
  'event-buddy',
  'open-to-msg',
] as const;

export type AvailabilityTag = (typeof AVAILABILITY_TAGS)[number];

export const AVAILABILITY_TAG_LABELS: Record<AvailabilityTag, string> = {
  chat: 'Up for a chat',
  coffee: 'Coffee',
  meet: 'Meet up',
  advice: 'Need advice',
  'venue-buddy': 'Venue buddy',
  'event-buddy': 'Event buddy',
  'open-to-msg': 'Open to messages',
};

function parseVisibility(v: unknown): PresenceVisibility {
  if (!v || typeof v !== 'object') return { ...DEFAULT_PRESENCE_VISIBILITY };
  const obj = v as Record<string, unknown>;
  return {
    global_dot: Boolean(obj.global_dot),
    in_directory: Boolean(obj.in_directory),
    in_groups: Boolean(obj.in_groups),
    in_discovery: Boolean(obj.in_discovery),
  };
}

function parseTravel(v: unknown): TravelMode | null {
  if (!v || typeof v !== 'object') return null;
  const obj = v as Record<string, unknown>;
  if (!obj.city_id && !obj.city_name && !obj.note) return null;
  return {
    city_id: typeof obj.city_id === 'string' ? obj.city_id : undefined,
    city_name: typeof obj.city_name === 'string' ? obj.city_name : undefined,
    until: typeof obj.until === 'string' ? obj.until : undefined,
    note: typeof obj.note === 'string' ? obj.note : undefined,
  };
}

/**
 * Read + write the current user's status. Persists to public.profiles status
 * columns added in migration 20260525110000_profile_status_presence.sql.
 */
export function useStatus(): {
  status: UserStatus | null;
  loading: boolean;
  setStatus: (patch: StatusUpdate) => Promise<{ error: string | null }>;
  clearStatus: () => Promise<{ error: string | null }>;
} {
  const { profile, loading, updateProfile } = useProfile();

  const status = useMemo<UserStatus | null>(() => {
    if (!profile) return null;
    // The new columns aren't in the generated Tables<'profiles'> type yet;
    // cast for now (matches the project pattern in useGamification.ts).
    const p = profile as unknown as Record<string, unknown>;
    const dndUntilRaw = (p.dnd_until as string | null) ?? null;
    const dndUntil = dndUntilRaw ? new Date(dndUntilRaw) : null;
    return {
      emoji: (p.status_emoji as string | null) ?? null,
      text: (p.status_text as string | null) ?? null,
      expiresAt: (p.status_expires_at as string | null) ?? null,
      tags: ((p.availability_tags as string[]) ?? []) as string[],
      dndUntil: dndUntilRaw,
      // eslint-disable-next-line react-hooks/purity -- dndActive is recomputed when the profile changes; second-of-resolution staleness is acceptable for this UI hint.
      dndActive: dndUntil ? dndUntil.getTime() > Date.now() : false,
      travel: parseTravel(p.travel_mode),
      visibility: parseVisibility(p.presence_visibility),
    };
  }, [profile]);

  const setStatus = useCallback(
    async (patch: StatusUpdate) => {
      const updates: Record<string, unknown> = {};
      if (patch.emoji !== undefined) updates.status_emoji = patch.emoji;
      if (patch.text !== undefined) updates.status_text = patch.text;
      if (patch.expiresAt !== undefined) updates.status_expires_at = patch.expiresAt;
      if (patch.tags !== undefined) updates.availability_tags = patch.tags;
      if (patch.dndUntil !== undefined) updates.dnd_until = patch.dndUntil;
      if (patch.travel !== undefined) updates.travel_mode = patch.travel ?? {};
      if (patch.visibility !== undefined) {
        updates.presence_visibility = {
          ...(status?.visibility ?? DEFAULT_PRESENCE_VISIBILITY),
          ...patch.visibility,
        };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await updateProfile(updates as any);
      return { error: res.error };
    },
    [status, updateProfile],
  );

  const clearStatus = useCallback(
    () =>
      setStatus({
        emoji: null,
        text: null,
        expiresAt: null,
        tags: [],
      }),
    [setStatus],
  );

  return { status, loading, setStatus, clearStatus };
}

/**
 * Compute a short-form summary of a UserStatus for compact display
 * ("👋 Hello · open-to-msg · Visiting Berlin"). Returns empty string when
 * there's nothing visible.
 */
export function summarizeStatus(s: UserStatus | null): string {
  if (!s) return '';
  if (s.dndActive) return 'Do not disturb';
  const parts: string[] = [];
  if (s.emoji && s.text) parts.push(`${s.emoji} ${s.text}`);
  else if (s.emoji) parts.push(s.emoji);
  else if (s.text) parts.push(s.text);
  if (s.travel?.city_name) {
    parts.push(`Visiting ${s.travel.city_name}`);
  }
  return parts.join(' · ');
}
