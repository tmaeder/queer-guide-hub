import { useEffect, useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/** Delay before the first ring lands, in ms — the first leg is already drawing. */
const FIRST_ARRIVAL_MS = 260;
/** Leg-crossing cadence. Between stagger.normal (60) and stagger.slow (100). */
export const LEG_STAGGER_MS = 90;

/**
 * Sequences the arrival of a generated line: leg draws, ring pops, plate lands.
 *
 * WHY THE STAGGER IS JAVASCRIPT AND NOT `animation-delay`.
 *
 * `.station-pop` is `animation-fill-mode: both` and starts at `scale(0)`. A
 * delayed instance therefore holds the ring INVISIBLE for the whole delay — and
 * if animations never run at all (print, a headless browser, an engine that
 * skips the keyframe) it stays invisible forever. That breaks the contract
 * `.station-arrive` and `RouteFade` both state: animate only FROM a displaced
 * state, so content that is never animated still renders at rest.
 *
 * So the classes are applied per element as a counter advances, and the
 * displaced state is only ever reachable while `animate` is true. Reduced
 * motion gets two independent guards — this hook never applies `opacity-0`, and
 * each keyframe in index.css disables itself under the media query.
 *
 * ANIMATION IS KEYED ON `generation`, NEVER ON MOUNT. The first render of the
 * page shows a static default line. CLAUDE.md keeps travel content free of
 * decorative motion because it is safety-adjacent; this is result-arrival
 * feedback on an explicit user action, which is the functional category the
 * design system already runs on this route (RouteFade wraps every route in
 * `.station-arrive`, Button's loading state is a TrackLoader). Firing it on
 * page load would move it out of that category.
 */
export function useRouteReveal(count: number, generation: number) {
  const reduced = useReducedMotion();
  const animate = !reduced && generation > 0 && count > 0;

  // Reset DURING RENDER when the generation changes, not in an effect.
  //
  // React's sanctioned "adjusting state when a prop changes" pattern: setting
  // state while rendering re-runs this component immediately without committing
  // the intermediate frame. The effect-based version painted one frame of the
  // OLD line at full opacity before the reset landed, so a reroll flashed the
  // previous route — and it tripped react-hooks/set-state-in-effect, which is
  // pointing at exactly that cascading render.
  const [progress, setProgress] = useState({ gen: generation, revealed: count - 1, settled: true });
  if (progress.gen !== generation) {
    setProgress({
      gen: generation,
      revealed: animate ? -1 : count - 1,
      settled: !animate,
    });
  }
  const { revealed, settled } = progress;

  useEffect(() => {
    if (!animate) return;
    // Every write is guarded on `gen`, so a timer that fires after a reroll has
    // already reset the state cannot resurrect the previous line's progress.
    const timers = Array.from({ length: count }, (_, i) =>
      setTimeout(
        () => setProgress((p) => (p.gen === generation ? { ...p, revealed: i } : p)),
        FIRST_ARRIVAL_MS + i * LEG_STAGGER_MS,
      ),
    );
    // The announcement waits for the last plate. Announcing at t=0 would
    // describe a screen that does not exist yet — every plate is still
    // `opacity-0` at that point.
    const done = setTimeout(
      () => setProgress((p) => (p.gen === generation ? { ...p, settled: true } : p)),
      FIRST_ARRIVAL_MS + (count - 1) * LEG_STAGGER_MS + 300,
    );
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [animate, count, generation]);

  return { animate, revealed, settled };
}
