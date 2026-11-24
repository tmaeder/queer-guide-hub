import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Coords {
  lat: number;
  lng: number;
  accuracy?: number;
}

/**
 * Who sees a live presence. One row per member, one audience at a time:
 * everyone/friends appear in Nearby (per person, snapped); dating feeds only
 * the dating map's per-city counts and never Nearby (enforced server-side).
 */
export type PresenceAudience = 'everyone' | 'friends' | 'dating';

export interface GoLiveOptions {
  /** 15-240, clamped server-side; default 60. */
  durationMinutes?: number;
  /** Skip device location and use the city centroid (city precision). */
  cityId?: string | null;
  /** Required once before the first dating presence. */
  safetyAcknowledged?: boolean;
}

export interface PresenceLiveStatus {
  audience: PresenceAudience;
  cityId: string | null;
  precisionM: number | null;
  isHighRisk: boolean;
  expiresAt: string | null;
  written: boolean;
}

/**
 * Web Geolocation wrapper for the "Near me" affordance. `request` captures
 * coords once for ad-hoc use; `goLive` persists an ephemeral, server-fuzzed
 * presence point (presence_upsert owns the snap + high-risk gating);
 * `goInvisible` clears it instantly (panic / quick-exit).
 */
export function useNearMe() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  // Live status comes from the server row, not component state, so every
  // surface (Nearby page, Hub menu switch) agrees and a reload keeps it.
  const { data: liveStatus = null } = useQuery({
    queryKey: ['my-presence', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<PresenceLiveStatus | null> => {
      const { data, error } = await supabase
        .from('user_presence_location')
        .select('city_id, precision_m, is_high_risk, expires_at, visibility, dating_visible')
        .eq('user_id', userId!)
        .gt('expires_at', new Date().toISOString())
        .or('visibility.neq.off,dating_visible.eq.true')
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        audience: data.dating_visible
          ? 'dating'
          : data.visibility === 'friends_only'
            ? 'friends'
            : 'everyone',
        cityId: data.city_id,
        precisionM: data.precision_m,
        isHighRisk: data.is_high_risk,
        expiresAt: data.expires_at,
        written: true,
      };
    },
  });

  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const request = useCallback(() => {
    if (!supported) {
      setError('unsupported');
      return Promise.resolve<Coords | null>(null);
    }
    setLoading(true);
    setError(null);
    return new Promise<Coords | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c: Coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          setCoords(c);
          setLoading(false);
          resolve(c);
        },
        (err) => {
          setError(err.code === 1 ? 'denied' : 'unavailable');
          setLoading(false);
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
      );
    });
  }, [supported]);

  const clear = useCallback(() => {
    setCoords(null);
    setError(null);
  }, []);

  /**
   * Capture location and persist an ephemeral presence point. The raw coords
   * are sent to presence_upsert, which snaps them server-side before storing —
   * the client never persists an exact position. Returns the live status (or
   * null on denial / write rejection in a high-risk country).
   */
  const goLive = useCallback(
    async (
      audience: PresenceAudience = 'everyone',
      options: GoLiveOptions = {},
    ): Promise<PresenceLiveStatus | null> => {
      const c = options.cityId ? null : await request();
      if (!c && !options.cityId) return null;
      setError(null);
      const { data, error: rpcError } = await supabase.rpc('presence_upsert', {
        p_lat: c?.lat,
        p_lng: c?.lng,
        p_city_id: options.cityId ?? undefined,
        p_source: 'go_live',
        p_visibility: audience === 'friends' ? 'friends_only' : 'discovery',
        p_dating: audience === 'dating',
        p_duration_minutes: options.durationMinutes,
        p_safety_acknowledged: options.safetyAcknowledged ?? false,
      });
      if (rpcError) {
        setError(
          /safety acknowledgement/i.test(rpcError.message) ? 'safety_required' : 'presence_failed',
        );
        return null;
      }
      const row = (
        data as
          | {
              city_id: string | null;
              precision_m: number | null;
              is_high_risk: boolean;
              expires_at: string | null;
              written: boolean;
            }[]
          | null
      )?.[0];
      const status: PresenceLiveStatus = {
        audience,
        cityId: row?.city_id ?? null,
        precisionM: row?.precision_m ?? null,
        isHighRisk: row?.is_high_risk ?? false,
        expiresAt: row?.expires_at ?? null,
        written: row?.written ?? false,
      };
      queryClient.setQueryData(['my-presence', userId], status.written ? status : null);
      void queryClient.invalidateQueries({ queryKey: ['cruising-presence-areas'] });
      return status;
    },
    [request, queryClient, userId],
  );

  /** Panic / quick-exit: removes the presence point from every radius query. */
  const goInvisible = useCallback(async () => {
    queryClient.setQueryData(['my-presence', userId], null);
    setCoords(null);
    await supabase.rpc('presence_clear');
    void queryClient.invalidateQueries({ queryKey: ['my-presence', userId] });
    void queryClient.invalidateQueries({ queryKey: ['cruising-presence-areas'] });
  }, [queryClient, userId]);

  return { supported, coords, loading, error, request, clear, goLive, goInvisible, liveStatus };
}
