import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';

export interface SharedMobilityNear {
  count: number;
  radius_m: number;
  /** False where the feed has no vehicles within ~3 km: render nothing, never "0". */
  covered: boolean;
  generated_at: string;
  attribution: string;
}

/**
 * Rideable shared bikes & e-scooters near a point, from the national snapshot
 * (`shared_mobility_near`, migration 99991792693301). Reads our own table only —
 * the browser never calls the upstream feed.
 */
export function useSharedMobilityNear(
  lat: number | null | undefined,
  lng: number | null | undefined,
) {
  const ok = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  return useQuery({
    queryKey: ['shared-mobility-near', lat, lng],
    enabled: ok,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await untypedRpc<SharedMobilityNear | null>('shared_mobility_near', {
        p_lat: lat,
        p_lng: lng,
        p_radius_m: 300,
      });
      if (error) throw error;
      return data;
    },
  });
}

/** Minutes since the snapshot was taken; null when unknown. */
export function snapshotAgeMinutes(
  generatedAt: string | undefined,
  now = Date.now(),
): number | null {
  const t = generatedAt ? Date.parse(generatedAt) : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 60000)) : null;
}

/** Older than this, a "now" count is not shown at all. */
export const SHARED_MOBILITY_STALE_MIN = 20;
