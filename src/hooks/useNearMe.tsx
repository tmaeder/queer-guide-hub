import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Coords {
  lat: number;
  lng: number;
  accuracy?: number;
}

export type PresenceVisibilityMode = 'discovery' | 'friends_only';

export interface PresenceLiveStatus {
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
  const [liveStatus, setLiveStatus] = useState<PresenceLiveStatus | null>(null);

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
    async (visibility: PresenceVisibilityMode = 'discovery'): Promise<PresenceLiveStatus | null> => {
      const c = await request();
      if (!c) return null;
      const { data, error: rpcError } = await supabase.rpc('presence_upsert', {
        p_lat: c.lat,
        p_lng: c.lng,
        p_source: 'go_live',
        p_visibility: visibility,
      });
      if (rpcError) {
        setError('presence_failed');
        return null;
      }
      const row = (data as {
        city_id: string | null;
        precision_m: number | null;
        is_high_risk: boolean;
        expires_at: string | null;
        written: boolean;
      }[] | null)?.[0];
      const status: PresenceLiveStatus = {
        cityId: row?.city_id ?? null,
        precisionM: row?.precision_m ?? null,
        isHighRisk: row?.is_high_risk ?? false,
        expiresAt: row?.expires_at ?? null,
        written: row?.written ?? false,
      };
      setLiveStatus(status);
      return status;
    },
    [request],
  );

  /** Panic / quick-exit: removes the presence point from every radius query. */
  const goInvisible = useCallback(async () => {
    setLiveStatus(null);
    setCoords(null);
    await supabase.rpc('presence_clear');
  }, []);

  return { supported, coords, loading, error, request, clear, goLive, goInvisible, liveStatus };
}
