import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * People matching — wraps the `people_discovery` / `compute_compatibility`
 * RPCs (migration 20260624090000). The engine runs server-side in auth-uid
 * space; the viewer is always the signed-in user (the RPC rejects any other
 * p_viewer), so callers never pass an identity. Block enforcement, the dating
 * age/opt-in wall, and per-context presence gating all live in SQL — this hook
 * is a thin, typed client over the result.
 */

export type PeopleMode = 'locals' | 'dating' | 'friends' | 'travel';

export interface PeopleMatchShared {
  shared_events?: number;
  mutual_groups?: number;
  mutual_friends?: number;
}

export interface PeopleMatch {
  userId: string;
  score: number;
  shared: PeopleMatchShared;
}

export interface PeopleDiscoveryParams {
  mode: PeopleMode;
  cityId?: string;
  eventId?: string;
  tripId?: string;
  limit?: number;
  /** Defaults to true; pass false to hold the query (e.g. presence not opted in). */
  enabled?: boolean;
}

/** Ranked people for the signed-in viewer in a mode + optional place context. */
export function usePeopleDiscovery(params: PeopleDiscoveryParams) {
  const { mode, cityId, eventId, tripId, limit = 60, enabled = true } = params;
  const { user } = useAuth();

  return useQuery({
    queryKey: ['people-discovery', mode, user?.id, cityId, eventId, tripId, limit],
    enabled: !!user && enabled,
    queryFn: async (): Promise<PeopleMatch[]> => {
      if (!user) return [];
      const { data, error } = await supabase.rpc('people_discovery', {
        p_viewer: user.id,
        p_mode: mode,
        p_city_id: cityId ?? undefined,
        p_event_id: eventId ?? undefined,
        p_trip_id: tripId ?? undefined,
        p_limit: limit,
      });
      if (error) throw error;
      return ((data as { user_id: string; score: number; shared: PeopleMatchShared | null }[]) ?? []).map(
        (r) => ({ userId: r.user_id, score: r.score, shared: r.shared ?? {} }),
      );
    },
  });
}

/** Single-pair compatibility (0–100) between the viewer and one candidate. */
export function useCompatibility(candidateId: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['compatibility', user?.id, candidateId],
    enabled: !!user && !!candidateId,
    queryFn: async (): Promise<number> => {
      if (!user || !candidateId) return 0;
      const { data, error } = await supabase.rpc('compute_compatibility', {
        p_viewer: user.id,
        p_candidate: candidateId,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
  });
}
