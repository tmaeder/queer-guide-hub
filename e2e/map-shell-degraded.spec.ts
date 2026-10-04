import { test, expect, type Page } from '@playwright/test';
import { waitForAppReady } from './support/appReady';
import { neutralizeVisitorGeo } from './support/visitorGeo';

/**
 * The map under FAILURE, and the proof that consolidation actually routed every
 * map through `useMapInstance`.
 *
 * `hooks/useMapInstance.ts` is the only place that installs
 * `installBasemapFallback` — plus the donut `setMissingStyleImageResolver` and
 * `loadGlyphImages`. A map built anywhere else white-screens on a tile-host
 * failure with no failover and no glyphs. So a spec that kills the tiles and
 * then asserts stations still plot IS the consolidation check; there is no
 * static way to prove the install reached a given surface.
 *
 * Every case reads `window.__qgMap`, the gate `src/components/map/mapDebug.ts`
 * already owns (`import.meta.env.DEV || localStorage['qg:debug:map'] === '1'`),
 * opted into with `addInitScript`. **Not `data-map-view`** — that attribute is
 * React state, and `useMapShellState.ts:100` records the post-mortem where it
 * read `density` while the URL had lost the param. The attribute says what the
 * component believes; the handle says what MapLibre drew.
 */

test.describe.configure({ timeout: 120_000 });

/** Opt into the debug handle before any app code runs. */
async function withMapHandle(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('qg:debug:map', '1');
    } catch {
      /* storage can be denied; the DEV branch may still apply */
    }
  });
}

type Probe = {
  present: boolean;
  styleLoaded?: boolean;
  sources?: string[];
  layers?: string[];
};

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const map = (window as unknown as { __qgMap?: unknown }).__qgMap as
      | {
          isStyleLoaded?: () => boolean;
          getStyle?: () => { layers?: { id: string }[]; sources?: Record<string, unknown> };
        }
      | undefined;
    if (!map) return { present: false };
    const style = map.getStyle?.() ?? {};
    return {
      present: true,
      styleLoaded: Boolean(map.isStyleLoaded?.()),
      sources: Object.keys(style.sources ?? {}),
      layers: (style.layers ?? []).map((l) => l.id),
    };
  });
}

/**
 * Wait for a SOURCE rather than for the style.
 *
 * Every map layer here is created when its DATA arrives, not at style load, so
 * probing immediately after `isStyleLoaded()` reads an empty layer list and
 * reports exactly what a broken renderer would. The wait IS the assertion.
 */
async function waitForSource(page: Page, id: string, timeout = 45_000) {
  await expect
    .poll(async () => (await probe(page)).sources ?? [], { timeout, intervals: [500] })
    .toContain(id);
}

async function openMap(page: Page, url: string) {
  await withMapHandle(page);
  await neutralizeVisitorGeo(page);
  await page.goto(url);
  await waitForAppReady(page);
}

/**
 * Abort every basemap tile, and REPORT HOW MANY were aborted.
 *
 * THE COUNT IS THE POINT, not bookkeeping. These tests used to kill tiles with
 * `page.route('**\/*.pbf')`, and measured against production on 2026-10-04 that
 * pattern aborts **ZERO** requests: the tile host serves `.mvt`
 * (`src/config/mapStyle.ts` — `…workers.dev/planet/{z}/{x}/{y}.mvt`), and
 * `.pbf` here is the GLYPH format, which this camera never requests. So a test
 * named "total tile outage" was running against a fully healthy tile host and
 * passing for that reason.
 *
 * A route pattern that matches nothing is indistinguishable from one that
 * matches everything when the only assertion is "the page did not crash" — so
 * every caller asserts a non-zero abort count before believing its own result.
 *
 * Matching on the HOST rather than an extension, because the extension is
 * exactly what drifted: the host is read from the same constant the app ships.
 */
function killBasemapTiles(page: Page): { aborted: () => number } {
  let aborted = 0;
  const kill = async (route: Parameters<Parameters<Page['route']>[1]>[0]) => {
    aborted += 1;
    await route.abort();
  };
  // The live basemap host. Both patterns are kept and both are counted: the
  // host covers tiles AND glyphs served from it, the extension covers a future
  // move to another origin.
  void page.route('**/protomaps-tiles.*/**', kill);
  void page.route('**/*.mvt', kill);
  return { aborted: () => aborted };
}

test.describe('tile host failure', () => {
  /**
   * MEASURED AGAINST PRODUCTION, 2026-10-04, and the result is worse than this
   * spec was written to assert.
   *
   * With every vector tile aborted, at an EXPLICIT camera (`?lat&lng&z`, so
   * neither visitor geolocation nor an auto-fly is a variable):
   *
   *   tiles alive → sources ["protomaps","heatmap-source","focus-source","points-source"]
   *                 layers  [heatmap-layer, clusters, cluster-count,
   *                          unclustered-point, pin-glyph]
   *   tiles dead  → sources ["protomaps"]        layers []
   *
   * Same camera, same geo stub, one variable. So the map does not DEGRADE when
   * the tile host fails — it comes up EMPTY, data layers and all.
   *
   * The mechanism, measured by attaching listeners to `window.__qgMap`:
   * `loaded: true`, `isMoving(): false`, `zoom: 12`, **`moveend` fired 0 times**
   * and `idle` 0 times, against 6 `error` events. `useMapInstance` drives the
   * viewport fetch from `moveend`, and its 3 s safety net declines while
   * `map.isMoving()` — so a fly that is still in the air at 3 s and then never
   * completes a `moveend` leaves the net disarmed and the fetch unfired,
   * permanently.
   *
   * TWO separate facts, kept separate because they have different fixes:
   *
   *  1. `VITE_BASEMAP_FALLBACK_TILE_URL` is UNSET in production (`.env.example`
   *     ships it empty and `installBasemapFallback` returns a no-op when it is),
   *     so there is no failover to exercise on prod at all. The install is
   *     present; the destination is not configured.
   *  2. Even with a fallback configured, the `moveend` dependency above is what
   *     decides whether stations plot.
   *
   * So the station assertion is a `fixme` with the measurement attached rather
   * than a passing test — per the plan's own rule for a test written before its
   * feature. What IS asserted is that the page survives: the route must not
   * crash to an error boundary, which is the regression that would make this
   * strictly worse.
   */

  test('the page survives a total tile outage without crashing', async ({ page }) => {
    const tiles = killBasemapTiles(page);

    await openMap(page, '/map?lat=52.5200&lng=13.4050&z=12');

    // THE OUTAGE REALLY HAPPENED. Without this the whole test passes against a
    // healthy tile host — which is precisely what it did while the kill pattern
    // was `**/*.pbf`.
    expect(
      tiles.aborted(),
      'no basemap tile request was aborted, so this test measured a HEALTHY map ' +
        'and its "survives an outage" claim is vacuous. The tile host moved — ' +
        'check src/config/mapStyle.ts against killBasemapTiles.',
    ).toBeGreaterThan(0);

    // POSITIVE CONTROL FIRST. Without it, "no crash" is equally true of a page
    // that never mounted a map at all.
    const p = await probe(page);
    expect(
      p.present,
      'window.__qgMap absent — the debug gate did not engage, so this spec measured NOTHING. ' +
        'Check mapDebug.exposeMapForDebug and the qg:debug:map opt-in.',
    ).toBe(true);

    // The basemap source is still declared even though its tiles 404 — which is
    // what makes the empty-data-layer state below invisible without a probe.
    expect(p.sources).toContain('protomaps');
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
    // And the route did not go to the crash screen.
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  });

  test.fixme('stations still plot when the tile host is unreachable', async ({ page }) => {
    // STILL FAILS, and the 2026-10-04 re-measurement is sharper than the
    // original: 0 of 5 runs against production, every one reporting sources
    // `["protomaps"]` — so not even `heatmap-source` or `focus-source`
    // mounts, and those need no data at all. The viewport fetch is never
    // issued (`venues`/`events`/`hotels` absent from the network log) while
    // the identical camera with tiles ALIVE issues all of them.
    //
    // The `moveend` reading in the block comment above still holds, but the
    // initial-fetch net it blamed has since been fixed to re-arm
    // (`initialFetchNet.ts`) and this case did NOT recover, so the net was
    // not the whole cause. Un-fixme only when a run measures it passing.
    const tiles = killBasemapTiles(page);
    await openMap(page, '/map?lat=52.5200&lng=13.4050&z=12');
    expect(tiles.aborted(), 'no tile was aborted — this would be a no-op outage').toBeGreaterThan(
      0,
    );
    await waitForSource(page, 'points-source');
  });

  test('the CONTROL: the same camera plots stations with tiles alive', async ({ page }) => {
    /**
     * This is what makes the fixme above a finding rather than a guess. Without
     * it, "no points-source" is equally consistent with the camera being wrong,
     * the viewport being empty, or the probe being broken.
     */
    await openMap(page, '/map?lat=52.5200&lng=13.4050&z=12');
    await waitForSource(page, 'points-source');
    const after = await probe(page);
    expect(after.layers ?? []).toContain('unclustered-point');
  });
});

test.describe('offline', () => {
  test('an already-loaded map survives losing the network', async ({ page, context }) => {
    // Explicit camera for the same reason as above: at world zoom there is
    // legitimately nothing to fetch, so `points-source` never appears and the
    // test reports a renderer failure that is really a viewport.
    await openMap(page, '/map?lat=52.5200&lng=13.4050&z=12');
    await waitForSource(page, 'points-source');

    await context.setOffline(true);
    // Pan: this fires a viewport fetch that cannot succeed.
    await page.mouse.move(600, 400);
    await page.mouse.down();
    await page.mouse.move(400, 300, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(1500);

    const after = await probe(page);
    expect(
      after.present,
      'the map handle vanished — the component unmounted on a failed fetch',
    ).toBe(true);
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe('geolocation denied', () => {
  test('the map still renders when the visitor refuses location', async ({ page }) => {
    await withMapHandle(page);
    // Deny rather than stub: the auto-fly path reads visitor geolocation, and a
    // denial is the common real case (and the one that used to leave the shell
    // waiting).
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (_ok: PositionCallback, err?: PositionErrorCallback | null) =>
            err?.({ code: 1, message: 'denied' } as GeolocationPositionError),
          watchPosition: () => 0,
          clearWatch: () => {},
        },
      });
    });
    await page.goto('/map?lat=52.5200&lng=13.4050&z=12');
    await waitForAppReady(page);

    expect((await probe(page)).present, 'no map handle with geolocation denied').toBe(true);
    await waitForSource(page, 'points-source');
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  });
});
