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

/**
 * The positive control, POLLED rather than sampled once.
 *
 * `waitForAppReady` guarantees React mounted and the theme resolved — it says
 * nothing about the lazily-imported MapShell chunk having arrived and
 * constructed a MapLibre instance. On production that happens ~2 s in, so a
 * single probe straight after `waitForAppReady` passed; against a local preview
 * build it is ~7 s and `waitForAppReady` returned at 17 s with the handle still
 * absent, failing every test in this file with "the debug gate did not engage"
 * — a message that names the wrong cause. Measured 2026-10-04.
 *
 * This is NOT a loosened control. It still fails, with the same message, if the
 * handle never appears; it only stops the file from being a race against
 * whichever host it runs on. It is the same defect `expectOutageHappened` above
 * records one layer down: a control that exists to stop a vacuous pass must not
 * itself be timing-dependent.
 */
async function waitForMapHandle(page: Page, what = 'this spec'): Promise<Probe> {
  await expect
    .poll(async () => (await probe(page)).present, {
      timeout: 30_000,
      intervals: [250],
      message:
        `window.__qgMap never appeared — ${what} measured NOTHING. Either the map never ` +
        'constructed, or the debug gate did not engage (mapDebug.exposeMapForDebug / the ' +
        'qg:debug:map opt-in).',
    })
    .toBe(true);
  return probe(page);
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
function killBasemapTiles(page: Page): {
  aborted: () => number;
  expectOutageHappened: () => Promise<void>;
} {
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

  return {
    aborted: () => aborted,
    /**
     * POLL, never a bare read.
     *
     * The first version of this asserted the count immediately after
     * `waitForAppReady`, and that is a RACE: app-ready means `#root` has
     * children, which happens before MapLibre has necessarily asked for a
     * single tile. It passed standalone and failed in a serial run purely on
     * ordering — i.e. the control that exists to stop a vacuous pass was
     * itself flaky, which is the same defect one layer up.
     */
    expectOutageHappened: async () => {
      await expect.poll(() => aborted, { timeout: 20_000, intervals: [250] }).toBeGreaterThan(0);
    },
  };
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
   * ── THIS SPEC RECORDED THE WRONG MECHANISM TWICE, AND `moveend` IS NOT IT ──
   *
   * It blamed `moveend`: that `useMapInstance` drives the viewport fetch from
   * it and the 3 s net declines while `map.isMoving()`. The decisive evidence
   * against that is a number the original reading had and did not use —
   * **`moveend` fires 0 times in BOTH arms.** On `/map?lat&lng&z`, `Map.tsx`
   * passes `skipAutoFly`, so `deferInitialFetch` is false and nothing flies at
   * all; a quantity identical on both sides of the one variable cannot be the
   * cause. `initialFetchNet.ts` then fixed that net to re-arm and this case did
   * not recover, which was the second clue.
   *
   * Corrected 2026-10-04 by an event CENSUS rather than a state sample —
   * hooking `window.__qgMap` at assignment with a `defineProperty` setter, so
   * the map's own `load` cannot be missed, and counting every event:
   *
   *   tiles alive → load 1 (t≈22.9s), idle 1, moveend 0
   *   tiles dead  → load 0, idle 0, moveend 0, error 9
   *
   * **`load` never fires when the visible tiles fail**, and `useMapInstance`
   * did every piece of post-construction wiring inside `map.on('load')` —
   * publishing `mapRef.current`, `setMapReady(true)`, glyphs, and the initial
   * viewport fetch. A tile outage withheld the one event the entire data layer
   * was gated on. MapLibre latches `load` on a render frame and an errored tile
   * schedules no repaint, so the condition goes true and nothing re-evaluates
   * it — while `map.loaded()` AND `isStyleLoaded()` both read `true` from
   * ~9.7 s with no event announcing the transition. **A `loaded()`-based check
   * reads healthy throughout**, which is exactly how the first diagnosis went
   * wrong: it sampled state and reasoned from `loaded: true`.
   *
   * The sharpest corroboration is this spec's own re-measurement: with tiles
   * dead, NOT EVEN `heatmap-source` or `focus-source` mounts, and those need no
   * data at all. They are added on `mapReady`, which only the `load` handler
   * ever set.
   *
   * Fixed by driving initialisation off `isStyleMutable` — the exact flag
   * `Style._checkLoaded()` throws on — via `applyWhenStyleReady`. NOT off
   * `isStyleLoaded()`: `mapStyleReady.ts` forbids the public method by name
   * because it also waits on every tile manager, and measured here with tiles
   * dead, `style._loaded` is true at 4.7 s while `isStyleLoaded()` is still
   * false. A first draft of the fix did gate on the public method plus a 250 ms
   * poll; it worked, and it was one hung-rather-than-aborted tile from being
   * inert. See the block comment on `initialiseMap` in `useMapInstance.ts`.
   *
   * ── What the station assertion does NOT need ──────────────────────────────
   *
   * `VITE_BASEMAP_FALLBACK_TILE_URL` is UNSET in production (`.env.example`
   * ships it empty and `installBasemapFallback` returns a no-op when it is), so
   * there is no failover to exercise on prod at all. This spec once said the
   * station assertion was waiting on one. It is not: stations come from the
   * data API, not the tile host, so they plot with no basemap whatsoever —
   * verified on a production build with the fallback still unset,
   * `points-source` at 6.4 / 6.8 / 8.2 s across three runs, against NEVER
   * before. Configuring a fallback is a separate, deploy-side improvement that
   * would only restore the basemap underneath them.
   */

  test('the page survives a total tile outage without crashing', async ({ page }) => {
    const tiles = killBasemapTiles(page);

    await openMap(page, '/map?lat=52.5200&lng=13.4050&z=12');

    // THE OUTAGE REALLY HAPPENED. Without this the whole test passes against a
    // healthy tile host — which is precisely what it did while the kill pattern
    // was `**/*.pbf`.
    await tiles.expectOutageHappened();

    // POSITIVE CONTROL FIRST. Without it, "no crash" is equally true of a page
    // that never mounted a map at all. Polled, for the reason on
    // `waitForMapHandle`; same message and same strength if it never arrives.
    const p = await waitForMapHandle(page);

    // The basemap source is still declared even though its tiles 404 — which is
    // what makes the empty-data-layer state below invisible without a probe.
    expect(p.sources).toContain('protomaps');
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
    // And the route did not go to the crash screen.
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  });

  test('stations still plot when the tile host is unreachable', async ({ page }) => {
    // The whole point of the describe block, and a `fixme` until the
    // `load`-gating above was fixed. It is the only assertion here that tells
    // "the basemap is missing" apart from "the map is empty".
    //
    // Un-fixmed on a measurement, per the instruction this spec shipped with:
    // 0 of 5 runs before, then 3 of 3 on a production build with the fix
    // (`points-source` at 6.4 / 6.8 / 8.2 s).
    const tiles = killBasemapTiles(page);
    await openMap(page, '/map?lat=52.5200&lng=13.4050&z=12');
    await tiles.expectOutageHappened();
    await waitForSource(page, 'points-source');
    // Not just the source: the pin layers must be on the map, which is what a
    // reader would actually see.
    expect((await probe(page)).layers ?? []).toContain('unclustered-point');
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

    await waitForMapHandle(page, 'the geolocation-denied case');
    await waitForSource(page, 'points-source');
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  });
});
