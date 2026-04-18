import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getViewerFingerprint } from '@/hooks/useTripReactions';

const DISPLAY_NAME_KEY = 'qg.viewerDisplayName';

export function getViewerDisplayName(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(DISPLAY_NAME_KEY);
  } catch {
    return null;
  }
}

export function setViewerDisplayName(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DISPLAY_NAME_KEY, name.slice(0, 60));
  } catch {
    // ignore
  }
}

export interface TripComment {
  id: string;
  trip_id: string;
  place_id: string;
  body: string;
  display_name: string;
  viewer_id: string | null;
  viewer_fingerprint: string | null;
  created_at: string;
}

/**
 * Load all comments for a trip in one query, bucketed by place_id.
 * Returns `Map<place_id, TripComment[]>` (newest last) so the page
 * can render threads next to each place without N+1 queries.
 */
export function useTripComments(tripId: string | undefined) {
  return useQuery({
    queryKey: ['trip-comments', tripId],
    enabled: !!tripId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Map<string, TripComment[]>> => {
      const { data, error } = await supabase
        .from('trip_share_comments')
        .select('*')
        .eq('trip_id', tripId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const byPlace = new Map<string, TripComment[]>();
      for (const c of (data ?? []) as TripComment[]) {
        const list = byPlace.get(c.place_id) ?? [];
        list.push(c);
        byPlace.set(c.place_id, list);
      }
      return byPlace;
    },
  });
}

interface PostInput {
  tripId: string;
  placeId: string;
  body: string;
  displayName: string;
}

export function usePostTripComment() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const fingerprint = getViewerFingerprint();

  return useMutation({
    mutationFn: async ({ tripId, placeId, body, displayName }: PostInput) => {
      const trimmedBody = body.trim();
      const trimmedName = displayName.trim();
      if (!trimmedBody || !trimmedName) throw new Error('body and name required');
      const { error } = await supabase.from('trip_share_comments').insert({
        trip_id: tripId,
        place_id: placeId,
        body: trimmedBody.slice(0, 600),
        display_name: trimmedName.slice(0, 60),
        viewer_id: user?.id ?? null,
        viewer_fingerprint: user ? null : fingerprint,
      });
      if (error) throw error;
      if (!user) setViewerDisplayName(trimmedName);
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['trip-comments', vars.tripId] });
    },
  });
}

export function useDeleteTripComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; tripId: string }) => {
      const { error } = await supabase.from('trip_share_comments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['trip-comments', vars.tripId] });
    },
  });
}
