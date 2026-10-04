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

test.describe('tile host failure', () => {
  test('the basemap fails over and stations still plot', async ({ page }) => {
    // Kill every vector tile. The basemap cannot render; the DATA layers are
    // served from Postgres and must be unaffected.
    await page.route('**/*.pbf', (route) => route.abort());
    await page.route('**/*.mvt', (route) => route.abort());

    await openMap(page, '/map');

    // POSITIVE CONTROL FIRST. Without it, "no crash" is equally true of a page
    // that never mounted a map at all — which is precisely what a missing
    // failover looks like from the outside.
    const before = await probe(page);
    expect(
      before.present,
      'window.__qgMap absent — the debug gate did not engage, so this spec measured NOTHING. ' +
        'Check mapDebug.exposeMapForDebug and the qg:debug:map opt-in.',
    ).toBe(true);

    // The station source is what proves the map is alive on broken tiles.
    await waitForSource(page, 'points-source');

    const after = await probe(page);
    expect(after.layers?.length ?? 0).toBeGreaterThan(0);

    // And the canvas is really there, not a blank div.
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  });

  /**
   * DELIBERATELY NOT ASSERTED: "a notice appears on tile failure".
   *
   * A draft of this spec checked `getByRole('status')` and then asserted
   * `count >= 0`, which cannot fail — a vacuous check that reads as coverage.
   * `installBasemapFallback` swaps the tile source silently and `MapNotice`'s
   * states are about LINES and ROUTES (`stationsBlocked`), not about the
   * basemap, so there is nothing true to assert here yet.
   *
   * If a degraded-basemap notice is added, assert its TEXT and pair it with a
   * positive control that the same locator is absent on a healthy load —
   * otherwise it passes on a page that renders a notice for another reason.
   */

});

test.describe('offline', () => {
  test('an already-loaded map survives losing the network', async ({ page, context }) => {
    await openMap(page, '/map');
    await waitForSource(page, 'points-source');

    await context.setOffline(true);
    // Pan: this fires a viewport fetch that cannot succeed.
    await page.mouse.move(600, 400);
    await page.mouse.down();
    await page.mouse.move(400, 300, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(1500);

    const after = await probe(page);
    expect(after.present, 'the map handle vanished — the component unmounted on a failed fetch').toBe(
      true,
    );
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
          getCurrentPosition: (
            _ok: PositionCallback,
            err?: PositionErrorCallback | null,
          ) => err?.({ code: 1, message: 'denied' } as GeolocationPositionError),
          watchPosition: () => 0,
          clearWatch: () => {},
        },
      });
    });
    await page.goto('/map');
    await waitForAppReady(page);

    expect((await probe(page)).present, 'no map handle with geolocation denied').toBe(true);
    await waitForSource(page, 'points-source');
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  });
});
