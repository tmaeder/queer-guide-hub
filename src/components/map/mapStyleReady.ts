import type * as maplibregl from 'maplibre-gl';

/**
 * "Is this MapLibre instance safe to mutate right now?" — and if not, do it
 * when it is.
 *
 * ── The defect this exists for ────────────────────────────────────────────
 * Every map surface in this app latches two facts in the `load` handler:
 * `mapRef.current = map` (a ref) and `setMapReady(true)` (React state). Every
 * later effect then treats those two latched facts as PROOF that the style is
 * loaded and the map is alive, and calls `addSource` / `addLayer` /
 * `setPaintProperty` straight off the back of them. They are not the same
 * fact, and two measured production crashes are what that costs:
 *
 *   • `[crash] Error @ /rights` — "Style is not done loading."
 *     (2026-09-08, Safari 26.3, /rights?section=help, component stack top
 *     frame `WorldChoropleth-BwRuXih7.js`)
 *   • `[crash] Error @ /` — "Style is not done loading." with a recorded
 *     `TypeError: null is not an object (evaluating 'this.style.getLayer')`
 *     from `ExploreMap` (3 occurrences, 2026-06-20 → 2026-07-24)
 *
 * Both messages come from ONE place — `Style._checkLoaded()`, which throws
 * the literal string `"Style is not done loading."` whenever `style._loaded`
 * is false (maplibre-gl 6.7.0, `dist/maplibre-gl-dev.mjs:14688`). It guards
 * `addSource`, `addLayer`, `removeLayer`, `setPaintProperty`, `setFilter` and
 * ~20 more.
 *
 * The two ways the latched flags stop being true:
 *
 *   1. **The map was removed.** `Map.remove()` runs `this.setStyle(null)`,
 *      and `_updateStyle(null)` executes `delete this.style` (dist ~25207).
 *      A removed map therefore has NO style at all, and anything still
 *      holding the instance — a queued effect, a pending callback, a ref the
 *      teardown has not nulled yet — dereferences nothing. That is exactly
 *      the shape of the recorded `this.style.getLayer` TypeError.
 *   2. **The style went un-loaded again.** `style._loaded` is set in
 *      `Style._load`, which `loadJSON` defers to a frame (dist ~14555), and
 *      it is false again for the whole of any style reload. `load` having
 *      fired once is not a standing guarantee.
 *
 * And the reason a mistimed call is a CRASH rather than a glitch: these calls
 * live in `useEffect` bodies, so React 18 propagates the throw to the nearest
 * error boundary and the entire route goes to the crash screen because one
 * `addSource` was a frame early.
 *
 * ── Why not just `map.isStyleLoaded()` ───────────────────────────────────
 * Because it asks a STRICTER question than the one that throws.
 * `Map.isStyleLoaded()` is `Style.loaded()`, which additionally requires
 * every tile manager and the image manager to be loaded (dist ~14640) — it
 * goes false again on any pan and can sit false while a basemap source
 * retries. Gating on it would defer our data source behind basemap tiles that
 * may never settle, i.e. it would trade a crash for a permanently blank map,
 * which is the same symptom by another route. So the gate reads the exact
 * flag `_checkLoaded()` reads, and falls back to the public method only if
 * that internal ever moves.
 *
 * ── The contract ─────────────────────────────────────────────────────────
 * `applyWhenStyleReady` NEVER drops the update. If the style is not ready it
 * re-arms on `styledata` and applies as soon as it is. Dropping silently
 * would leave the map blank forever — the very symptom being fixed.
 */

/** maplibre-gl does not type these internals; both are read defensively. */
type MapInternals = {
  _removed?: boolean;
  style?: { _loaded?: boolean } | null;
};

/** The literal `Style._checkLoaded()` throws. Matched, never constructed. */
export const STYLE_NOT_LOADED = /style is not done loading/i;

export function isStyleNotLoadedError(err: unknown): boolean {
  return err instanceof Error && STYLE_NOT_LOADED.test(err.message);
}

/**
 * False once `map.remove()` has run. A removed map keeps every one of its
 * public methods, so "the ref is non-null" says nothing about this.
 */
export function isMapAlive(map: maplibregl.Map | null | undefined): map is maplibregl.Map {
  if (!map) return false;
  return (map as unknown as MapInternals)._removed !== true;
}

/**
 * True iff a style-mutating call would get past `Style._checkLoaded()`.
 * Deliberately the permissive test — see the header on why the public
 * `isStyleLoaded()` is the wrong question.
 */
export function isStyleMutable(map: maplibregl.Map | null | undefined): map is maplibregl.Map {
  if (!isMapAlive(map)) return false;
  const style = (map as unknown as MapInternals).style;
  // `map.remove()` deletes it outright; that is case 1 above.
  if (!style) return false;
  if (typeof style._loaded === 'boolean') return style._loaded;
  return map.isStyleLoaded() === true;
}

/**
 * Return `false` from an `apply` to say "not yet, keep waiting" — used where
 * the work needs more than a loaded style (e.g. a layer another effect adds).
 */
export type StyleApply = (map: maplibregl.Map) => boolean | void;

/**
 * Run `apply` against `map` as soon as the style can take it, and return a
 * disposer.
 *
 * Synchronous in the common case (style already loaded), so nothing about the
 * happy path changes. Otherwise it waits on `styledata` — which MapLibre fires
 * for every style data event, including the one that follows `_load` — and
 * applies then. The disposer MUST be returned from the calling effect so an
 * unmount detaches the listener and cancels a pending apply.
 *
 * An error that is not "style not loaded" is re-thrown: a genuine bug (a
 * duplicate layer id, a malformed paint expression) must stay loud.
 */
export function applyWhenStyleReady(map: maplibregl.Map, apply: StyleApply): () => void {
  let settled = false;

  const attempt = (): boolean => {
    if (settled) return true;
    // The map is gone. There is nothing left to apply to and nothing to
    // report — this is the ordinary unmount path, not a failure.
    if (!isMapAlive(map)) {
      settled = true;
      return true;
    }
    if (!isStyleMutable(map)) return false;
    try {
      if (apply(map) === false) return false;
    } catch (err) {
      // Belt and braces: we lost the race between the check and the call, or
      // the internal flag moved and the fallback misread it. Wait rather than
      // crash — but only for THIS error.
      if (isStyleNotLoadedError(err)) return false;
      settled = true;
      throw err;
    }
    settled = true;
    return true;
  };

  if (attempt()) return () => {};

  const onStyleData = () => {
    if (attempt()) map.off('styledata', onStyleData);
  };
  map.on('styledata', onStyleData);

  return () => {
    settled = true;
    map.off('styledata', onStyleData);
  };
}
