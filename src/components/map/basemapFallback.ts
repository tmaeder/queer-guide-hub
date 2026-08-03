import type * as maplibregl from 'maplibre-gl';
import { BASEMAP_SOURCE_ID, FALLBACK_TILE_URL, TILE_URL } from '@/config/mapStyle';

/**
 * Runtime basemap failover.
 *
 * When the primary tile worker is down, MapLibre keeps rendering: the style,
 * glyphs and sprite come from other hosts, so the map draws its background and
 * nothing else. To a user that is indistinguishable from a broken app. This
 * probes the primary once and, if it is not serving, repoints that ONE source
 * at `VITE_BASEMAP_FALLBACK_TILE_URL`.
 *
 * ── Why an explicit probe and not MapLibre's `error` event ──────────────────
 * The obvious implementation listens for `map.on('error')` and counts tile
 * failures. It does not work. Measured against maplibre-gl v6 with every tile
 * returning `429`: the map fired `load`, accepted the layer and emitted four
 * `sourcedata` events, and **zero** `error` events. Tile HTTP failures are not
 * surfaced there, so an error-driven fallback is silently inert — and unit
 * tests built around a hand-written error object pass anyway, because they
 * assert against a shape the library never emits.
 *
 * ── Why the probe can read a failure it cannot read a status from ───────────
 * Also measured, from the page:
 *
 *   fetch(healthy cross-origin)  -> resolves, status 200, type "cors"
 *   fetch(dead tile worker)      -> THROWS TypeError
 *   mode:'no-cors' (either)      -> opaque, status 0        (useless)
 *
 * The primary must send CORS headers on success or MapLibre could not use it
 * at all, whereas Cloudflare's `429`/`5xx` error pages do not — so the throw
 * *is* the signal. A thrown fetch is ambiguous (offline, DNS, CORS, or a
 * status-bearing error page), but every one of those means the basemap is
 * unusable, which is exactly when failing over is correct.
 *
 * ── Why `setTiles` and not `map.setStyle` ──────────────────────────────────
 * `setStyle` tears down every source and layer, and this app attaches its data
 * layers from four separate hooks (usePointLayers / useAreaLayers /
 * useHeatmapLayer / useFocusRing), each guarded by its own "already added"
 * ref. Swapping the style would drop all of them while those guards still
 * believed the layers were present. `setTiles` touches only the basemap
 * source, so pins, clusters, heatmap and focus ring are untouched.
 *
 * That constraint is also why the fallback must serve the same Protomaps v4
 * schema — see the note on FALLBACK_TILE_URL.
 */

/** Statuses worth failing over for, when a status is actually readable.
 *  404 is excluded deliberately: a sparse planet build legitimately 404s on
 *  empty tiles, and treating that as failure would trip the fallback on a
 *  perfectly healthy map. */
export function isFailoverWorthy(status: number): boolean {
  return status === 429 || status === 401 || status === 403 || status >= 500;
}

/** A cheap, always-present tile to probe with. z0/0/0 is one tile for the
 *  whole planet, so it is warm in cache and tiny. */
function probeUrl(): string {
  return TILE_URL.replace('{z}', '0').replace('{x}', '0').replace('{y}', '0');
}

/** Module-level so N map instances share ONE probe rather than each firing
 *  their own. Null until the first install asks. Tests reset it with
 *  `vi.resetModules()` rather than a test-only export. */
let primaryHealthy: Promise<boolean> | null = null;

function probePrimary(): Promise<boolean> {
  primaryHealthy ??= (async () => {
    try {
      const res = await fetch(probeUrl(), { method: 'GET', cache: 'no-store' });
      // A readable status: only fail over on the ones that mean "not serving".
      if (isFailoverWorthy(res.status)) return false;
      return true;
    } catch {
      // Threw => opaque failure (see header). Basemap is unusable either way.
      return false;
    }
  })();
  return primaryHealthy;
}

/** Returns true when the swap actually happened, so the caller can tell
 *  "not ready yet" apart from "done" instead of guessing. */
function swapSource(map: maplibregl.Map): boolean {
  // getSource returns undefined before the style is in and mid-teardown, and
  // only a vector source has setTiles — guard both rather than assume the
  // style still looks the way we built it.
  const source = map.getSource(BASEMAP_SOURCE_ID) as
    (maplibregl.Source & { setTiles?: (t: string[]) => void }) | undefined;
  if (typeof source?.setTiles !== 'function') return false;
  try {
    source.setTiles([FALLBACK_TILE_URL as string]);
    markDegraded();
    console.warn('[basemap] primary tiles unreachable — switched to fallback tile source');
    return true;
  } catch (err) {
    // A failed swap must not take the map down with it; the basemap is already
    // broken and the data layers on top still work. Reported as handled (true)
    // so the caller does not then queue a retry on `load` that would rerun the
    // same throwing call.
    console.warn('[basemap] fallback swap failed', err);
    return true;
  }
}

/**
 * Production-visible marker that this page is on the emergency basemap.
 *
 * The console.warn above is NOT a production signal: vite.config.ts sets
 * `esbuild.drop: ['console', 'debugger']` for production builds, so every
 * console call is stripped and a prod bundle would fail over in total silence.
 * A data attribute survives minification, costs nothing, needs no Sentry
 * coupling in a map util, and is greppable from DevTools or an e2e assertion.
 */
function markDegraded(): void {
  try {
    document.documentElement.dataset.basemapFallback = 'active';
  } catch {
    /* non-DOM environment — nothing to mark */
  }
}

/**
 * Attach the failover to a map. No-op when no fallback is configured, so the
 * default build behaves exactly as it did before this existed.
 *
 * Returns a cleanup function; after it runs, a late-resolving probe will not
 * touch the (possibly removed) map.
 */
export function installBasemapFallback(map: maplibregl.Map): () => void {
  if (!FALLBACK_TILE_URL) return () => {};

  let disposed = false;

  void probePrimary().then((healthy) => {
    if (disposed || healthy) return;

    // Gate on the SOURCE existing, not on `isStyleLoaded()`. Two ways that
    // gate fails, both hit in practice:
    //   1. the probe is async, so `load` has usually already fired by the time
    //      it resolves — a `once('load')` registered now would never run;
    //   2. `isStyleLoaded()` reports false while any source is still loading,
    //      and with the primary tiles failing that can stay false forever.
    // `getSource()` returning the source is the actual precondition for
    // setTiles, so test that directly and only wait for `load` if it is
    // genuinely not there yet.
    if (!swapSource(map)) {
      map.once('load', () => {
        if (!disposed) swapSource(map);
      });
    }
  });

  return () => {
    disposed = true;
  };
}
