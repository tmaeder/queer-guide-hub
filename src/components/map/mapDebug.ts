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
