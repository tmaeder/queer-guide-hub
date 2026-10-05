import { useCallback, useEffect, type MutableRefObject } from 'react';
import * as maplibregl from 'maplibre-gl';
import { PULSE_LAYER } from '@/config/mapLayers';

interface UsePulseAnimationParams {
  mapRef: MutableRefObject<maplibregl.Map | null>;
  mapReady: boolean;
  prefersReducedMotion: boolean;
  pulseRafRef: MutableRefObject<number | null>;
}

/**
 * How long one breath takes, and how many of them a burst is worth.
 *
 * BOUNDED IS THE WHOLE POINT — see the header below. The product intent is
 * "draw the eye to pins that are live right now", which a few breaths serve as
 * well as an endless loop; what an endless loop additionally does is hold the
 * main thread at 100% for as long as the page is open.
 */
const PULSE_PERIOD_MS = 1800;
const PULSE_CYCLES = 3;

/** The ring at rest. Also exactly what reduced-motion gets, so a settled map
 *  and a reduced-motion map are the same picture rather than two designs. */
const RESTING_RADIUS = 12;
const RESTING_OPACITY = 0.18;

function settle(map: maplibregl.Map) {
  map.setPaintProperty(PULSE_LAYER, 'circle-radius', RESTING_RADIUS);
  map.setPaintProperty(PULSE_LAYER, 'circle-opacity', RESTING_OPACITY);
}

/**
 * Drives the PULSE_LAYER ring around live/open-now pins, as a BOUNDED burst.
 *
 * ── The defect this shape exists for ──────────────────────────────────────
 * This loop used to be unbounded: `requestAnimationFrame` calling
 * `setPaintProperty` twice, every frame, for as long as the page was open.
 * Measured against production 2026-10-04 on `/map?lat&lng&z`, after the data
 * had loaded and with NO interaction of any kind:
 *
 *   normal motion   → 1.2 / 0.4 fps idle, MapLibre `idle` NEVER fires
 *   reducedMotion   → 15.7 / 33.2 fps idle, `idle` fires
 *
 * 13-80x, and the only thing switching it off was a user who had already asked
 * the whole OS for less motion. A programmatic `panBy` measured 4.4 fps against
 * 4.8 fps idle — i.e. panning this map was *not slower than doing nothing*,
 * because doing nothing was already saturating the thread.
 *
 * **The `setPaintProperty` calls are NOT the cost.** Fifty of them back to back
 * measured **0 ms**. The cost is the full repaint each one forces on a
 * 79-layer style carrying a heatmap and ~1,374 clustered features. So the only
 * available lever is HOW OFTEN we repaint, and the only way to reach zero is to
 * stop — which is why this is bounded rather than throttled. A throttle makes
 * the burn smaller and still never lets the map idle, and on a slow device,
 * where one repaint already costs ~1 s, a 10 fps throttle is unreachable and
 * buys nothing at all.
 *
 * ── Why bounding costs no product value ───────────────────────────────────
 * `startPulse` is called from the points effect (`usePointLayers`), which
 * re-runs whenever the point data changes — which is every pan, filter and
 * line toggle. So a burst fires exactly when new pins arrive, which is when the
 * ring has something to say, and the map settles when the user stops. The ring
 * stays visible the whole time; it simply stops breathing. Note `live-pulse`
 * renders ~104 features on the default camera, so this is a real effect with a
 * real audience — do not "optimise" it by deleting the layer.
 *
 * ── What this fixes, and what it measurably does NOT ──────────────────────
 * FIXED: the at-rest burn. **MapLibre `idle` becomes reachable** — measured
 * paired against production with the same instrument, attaching `idle` AFTER
 * the burst window: prod `false` after 32 s with the ring frozen mid-animation
 * (r=22.68, o=0.029), this build `true` with the ring settled (r=12, o=0.18).
 * Paint writes stop outright (2 in the last 8 s vs 0). Nothing in the app
 * consumed `idle`, but it was also impossible to use: anything gating on it
 * waited forever. (`load` had the mirror problem for a different reason — see
 * `useMapInstance`.)
 *
 * NOT FIXED, and an earlier draft of this comment wrongly claimed otherwise:
 * `e2e/map-shell-degraded.spec.ts`'s offline case. It was predicted to get
 * faster because Playwright's `page.mouse.*` are raw CDP dispatches whose acks
 * wait on a renderer frame. Measured paired, prod vs this build, back to back
 * on the same machine: **1.5m vs 1.6m, then 53.9s vs 1.2m — no improvement.**
 * The reason is this design working as intended: that spec pans the moment
 * `points-source` appears, i.e. inside the burst, and every pan changes the
 * point data, which re-arms `startPulse`. During interaction the map has to
 * repaint anyway, so the pulse's cost there is marginal — the defect was always
 * the IDLE case, and the spec never measures it. Its remaining cost is the
 * second, independent one: dragging ~1,374 clustered features is expensive on
 * its own (8-12 s per drag even with the pulse off).
 *
 * rAF receives a DOMHighResTimeStamp so we never call Date.now(). The phase is
 * measured from the FIRST frame of this burst rather than from the absolute
 * timestamp, so a burst always opens on the small radius instead of wherever
 * `t % period` happened to land. `pulseRafRef` stays component-owned (the init
 * teardown and the points effect also cancel it).
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
    pulseRafRef.current = null;

    if (prefersReducedMotion) {
      settle(map);
      return;
    }

    const duration = PULSE_CYCLES * PULSE_PERIOD_MS;
    let startedAt: number | null = null;

    const tick = (t: number) => {
      const m = mapRef.current;
      if (!m || !m.getLayer(PULSE_LAYER)) {
        pulseRafRef.current = null;
        return;
      }
      startedAt ??= t;
      const elapsed = t - startedAt;
      if (elapsed >= duration) {
        // Clear the handle BEFORE settling: `settle` is the last paint write of
        // the burst, and leaving a stale id here would have the next teardown
        // cancel a frame that is no longer scheduled.
        pulseRafRef.current = null;
        settle(m);
        return;
      }
      const phase = (elapsed % PULSE_PERIOD_MS) / PULSE_PERIOD_MS; // 0 → 1
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
