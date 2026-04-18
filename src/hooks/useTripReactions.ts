import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const FINGERPRINT_KEY = 'qg.viewerFingerprint';

/**
 * Per-browser anonymous viewer ID. Persisted in localStorage so a
 * returning visitor keeps their reactions. Falls back to a fresh ID
 * when localStorage is unavailable (private browsing).
 */
export function getViewerFingerprint(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    const existing = localStorage.getItem(FINGERPRINT_KEY);
    if (existing) return existing;
    const next = crypto.randomUUID();
    localStorage.setItem(FINGERPRINT_KEY, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

export interface ReactionRow {
  id: string;
  trip_id: string;
  place_id: string;
  emoji: string;
  viewer_id: string | null;
  viewer_fingerprint: string | null;
}

export interface PlaceReactionSummary {
  /** emoji -> count */
  counts: Record<string, number>;
  /** emojis the current viewer has already reacted with */
  mine: Set<string>;
}

/**
 * Load all reactions for a trip in one query and bucket by place_id.
 * Returns a map<place_id, {counts, mine}> ready to render per place.
 */
export function useTripReactions(tripId: string | undefined) {
  const { user } = useAuth();
  const fingerprint = getViewerFingerprint();

  return useQuery({
    queryKey: ['trip-reactions', tripId, user?.id ?? fingerprint],
    enabled: !!tripId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Map<string, PlaceReactionSummary>> => {
      const { data, error } = await supabase
        .from('trip_share_reactions')
        .select('id, trip_id, place_id, emoji, viewer_id, viewer_fingerprint')
        .eq('trip_id', tripId!);
      if (error) throw error;

      const byPlace = new Map<string, PlaceReactionSummary>();
      for (const row of (data ?? []) as ReactionRow[]) {
        let summary = byPlace.get(row.place_id);
        if (!summary) {
          summary = { counts: {}, mine: new Set() };
          byPlace.set(row.place_id, summary);
        }
        summary.counts[row.emoji] = (summary.counts[row.emoji] ?? 0) + 1;
        const isMine = user
          ? row.viewer_id === user.id
          : row.viewer_fingerprint === fingerprint;
        if (isMine) summary.mine.add(row.emoji);
      }
      return byPlace;
    },
  });
}

interface ToggleInput {
  tripId: string;
  placeId: string;
  emoji: string;
  /** true = currently reacted, will be removed; false = will be added */
  active: boolean;
}

export function useToggleReaction() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const fingerprint = getViewerFingerprint();

  return useMutation({
    mutationFn: async ({ tripId, placeId, emoji, active }: ToggleInput) => {
      if (active) {
        // Delete my reaction
        const query = supabase
          .from('trip_share_reactions')
          .delete()
          .eq('place_id', placeId)
          .eq('emoji', emoji);
        const finalQuery = user
          ? query.eq('viewer_id', user.id)
          : query.eq('viewer_fingerprint', fingerprint);
        const { error } = await finalQuery;
        if (error) throw error;
      } else {
        const { error } = await supabase.from('trip_share_reactions').insert({
          trip_id: tripId,
          place_id: placeId,
          emoji,
          viewer_id: user?.id ?? null,
          viewer_fingerprint: user ? null : fingerprint,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['trip-reactions', vars.tripId] });
    },
  });
}

export const REACTION_EMOJIS = ['❤️', '✨', '🌈', '📍', '💡'] as const;
