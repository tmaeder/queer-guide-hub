// Shared map helpers extracted from ExploreMap so the layer hooks can reuse them.

/** Stable empty favorites set so effects don't churn when none are passed. */
export const EMPTY_FAV: ReadonlySet<string> = new Set<string>();

/**
 * Gated debug logger — env-flag or localStorage opt-in. Cheap insurance
 * against future regressions in the points-data → markers flow.
 */
export const mapDebug = (...args: unknown[]): void => {
  try {
    if (
      import.meta.env.DEV ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('qg:debug:map') === '1')
    ) {
      console.debug('[venues-map]', ...args);
    }
  } catch {
    /* localStorage may throw in some sandboxed contexts */
  }
};

/**
 * Attach the live map to `window.__qgMap` under the SAME gate as `mapDebug`.
 *
 * Nothing could previously inspect what the map actually draws: every map e2e
 * asserts canvas visibility and the DOM counter, and `design-system.spec.ts`
 * reads `background-color` under `#root, header, main, footer`, so it is blind
 * to the canvas, to any SVG stroke, and to `body`. Both of the map's hard
 * invariants — Routes never falls through to Stations, geography is never a
 * line — are claims about what is DRAWN.
 *
 * Playwright opts in with `addInitScript`, so this is no new production
 * surface: a visitor without the flag gets nothing attached.
 *
 * Deliberately NOT a `data-map-view` attribute instead. `useMapShellState.ts`
 * records the post-mortem: `data-map-lens` read `density` while the URL had
 * lost the param, because the attribute is React state rather than rendered
 * paint. A spec that reads it can agree with the component and disagree with
 * the canvas.
 */
export function exposeMapForDebug(map: unknown): void {
  try {
    if (
      import.meta.env.DEV ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('qg:debug:map') === '1')
    ) {
      (window as unknown as Record<string, unknown>).__qgMap = map;
    }
  } catch {
    /* private mode / sandboxed context — the spec fails on the absent handle,
       which is the honest outcome rather than a silently passing one. */
  }
}
