import { useCallback, useEffect, type MutableRefObject } from 'react';
import maplibregl from 'maplibre-gl';
import { PULSE_LAYER } from '@/config/mapLayers';

interface UsePulseAnimationParams {
  mapRef: MutableRefObject<maplibregl.Map | null>;
  mapReady: boolean;
  prefersReducedMotion: boolean;
  pulseRafRef: MutableRefObject<number | null>;
}

/**
 * Drives the PULSE_LAYER ring around live/open-now pins. rAF receives a
 * DOMHighResTimeStamp so we never call Date.now(). Reduced-motion → a static
 * ring. Extracted verbatim from ExploreMap — behavior-preserving. `pulseRafRef`
 * stays component-owned (init teardown + points effect also cancel it).
 */
export function usePulseAnimation({
  mapRef,
  mapReady,
  prefersReducedMotion,
  pulseRafRef,
}: UsePulseAnimationParams) {
  const startPulse = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(PULSE_LAYER)) return;
    if (pulseRafRef.current) cancelAnimationFrame(pulseRafRef.current);

    if (prefersReducedMotion) {
      map.setPaintProperty(PULSE_LAYER, 'circle-radius', 12);
      map.setPaintProperty(PULSE_LAYER, 'circle-opacity', 0.18);
      return;
    }

    const period = 1800;
    const tick = (t: number) => {
      const m = mapRef.current;
      if (!m || !m.getLayer(PULSE_LAYER)) {
        pulseRafRef.current = null;
        return;
      }
      const phase = (t % period) / period; // 0 → 1
      m.setPaintProperty(PULSE_LAYER, 'circle-radius', 8 + phase * 16);
      m.setPaintProperty(PULSE_LAYER, 'circle-opacity', 0.35 * (1 - phase));
      pulseRafRef.current = requestAnimationFrame(tick);
    };
    pulseRafRef.current = requestAnimationFrame(tick);
  }, [prefersReducedMotion, mapRef, pulseRafRef]);

  // Restart the pulse loop when the motion preference flips (the point effect
  // early-returns on data updates, so it can't catch this on its own).
  useEffect(() => {
    startPulse();
    return () => {
      if (pulseRafRef.current) {
        cancelAnimationFrame(pulseRafRef.current);
        pulseRafRef.current = null;
      }
    };
  }, [startPulse, mapReady, pulseRafRef]);

  return { startPulse };
}
