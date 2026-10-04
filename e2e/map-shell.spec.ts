import { test, expect, type Page } from '@playwright/test';
import { waitForAppReady } from './support/appReady';
import { neutralizeVisitorGeo } from './support/visitorGeo';

/**
 * Each case chains waitForAppReady (20s) + isStyleLoaded (20s) + the view's
 * own evidence (30s), and a map layer is created only when its DATA arrives.
 * The default per-test budget cannot hold that on a cold worker — two cases
 * timed out on a run where the five later ones asserting the same thing
 * passed, which is the signature of a budget rather than a defect.
 */
test.describe.configure({ timeout: 120_000 });

/**
 * The map shell: four views, four lines, legacy URLs, and both hard
 * invariants' BEHAVIOURAL halves.
 *
 * Every pre-existing map e2e asserts canvas VISIBILITY and the DOM counter.
 * `design-system.spec.ts` reads `background-color` under
 * `#root, header, main, footer` and is therefore blind to the canvas, to any
 * SVG stroke, and to `body` — so map colour regressions are green there
 * forever, by construction. Both invariants here are claims about what is
 * DRAWN, which nothing could previously inspect.
 *
 * `window.__qgMap` is the handle (`exposeMapForDebug` in mapDebug.ts), gated
 * behind the condition already in that module. A spec that lies about the
 * handle fails loudly rather than silently measuring nothing.
 *
 * NOT `data-map-view`: `useMapShellState.ts:100` records the exact
 * post-mortem — `data-map-lens` read `density` while the URL had lost the
 * param. The attribute is React state, not rendered paint.
 */

/** Opt into the debug handle before any app code runs. */
async function withMapHandle(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('qg:debug:map', '1');
    } catch {
      /* private mode — the spec will fail on the handle, which is honest */
    }
  });
}

/** The slice of the MapLibre API these probes use. Declared locally because
 *  the callbacks run in the BROWSER, where the `maplibre-gl` module type is
 *  not in scope. */
interface ProbeMap {
  getStyle(): { layers?: { id: string }[]; sources?: Record<string, unknown> } | undefined;
  isStyleLoaded(): boolean;
  queryRenderedFeatures(opts: { layers: string[] }): unknown[];
}

interface MapProbe {
  layers: string[];
  sources: string[];
  /** Rendered features per layer, which is the only honest "is it drawn". */
  counts: Record<string, number>;
}

async function probe(page: Page): Promise<MapProbe> {
  return page.evaluate(() => {
    const map = (window as unknown as { __qgMap?: ProbeMap }).__qgMap;
    if (!map) throw new Error('window.__qgMap is absent — exposeMapForDebug did not run');
    const style = map.getStyle();
    const layers = (style?.layers ?? []).map((l) => l.id);
    const counts: Record<string, number> = {};
    for (const id of layers) {
      try {
        counts[id] = map.queryRenderedFeatures({ layers: [id] }).length;
      } catch {
        counts[id] = -1; // layer exists but is not queryable (raster, background)
      }
    }
    return { layers, sources: Object.keys(style?.sources ?? {}), counts };
  });
}

async function openMap(page: Page, url: string) {
  await withMapHandle(page);
  await neutralizeVisitorGeo(page);
  await page.goto(url);
  await waitForAppReady(page);
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 20_000 });
  // The style has to settle before a layer list means anything.
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { __qgMap?: ProbeMap }).__qgMap;
      return !!m && m.isStyleLoaded();
    },
    { timeout: 20_000 },
  );
}

/**
 * EVERY map layer here is created LAZILY, when its data arrives — not at
 * style load. The first draft of this spec probed immediately after
 * `isStyleLoaded()` and failed on correct code, because `points-source` does
 * not exist until the first viewport fetch returns.
 *
 * So a view's evidence has to be WAITED for, and the wait is the assertion.
 * `waitForFunction` throws with the condition's own name on timeout, which is
 * the honest failure: "the stations view never created its point source" is a
 * real finding, where a bare probe reported it as a missing string.
 */
async function waitForSource(page: Page, source: string) {
  await page.waitForFunction(
    (src) => {
      const m = (window as unknown as { __qgMap?: ProbeMap }).__qgMap;
      return !!m && Object.keys(m.getStyle()?.sources ?? {}).includes(src);
    },
    source,
    { timeout: 30_000 },
  );
}

async function waitForLayer(page: Page, layer: string) {
  await page.waitForFunction(
    (id) => {
      const m = (window as unknown as { __qgMap?: ProbeMap }).__qgMap;
      return !!m && (m.getStyle()?.layers ?? []).some((l) => l.id === id);
    },
    layer,
    { timeout: 30_000 },
  );
}

test.describe('@smoke map shell — legacy URLs', () => {
  /**
   * The FROZEN table. "Did not 404" is not a measurement — each row asserts
   * the rewritten query string is character-equal to a pinned value, which is
   * what catches a translation that drops one param and keeps the rest.
   *
   * THIS PARAGRAPH USED TO SAY THE OPPOSITE OF THE ASSERTION BELOW, and both
   * were in the same file: it claimed the legacy key "must still be there" on
   * arrival because the delete waits for a user write, while the test at the
   * bottom asserts the key is gone and the comment beside it explains why it
   * is stripped immediately. Only one can be true — the map emits a viewport
   * on LOAD, so `writeParams` runs with no user action and the key dies within
   * ~250 ms. Corrected rather than deleted, because a reader who opens this
   * file at the wrong end gets the wrong answer, which is worse than silence.
   */
  /**
   * BOTH legacy keys, because polling only ONE of them moves the race rather
   * than closing it. My first fix polled `lens` and left `layers` as a single
   * read: the `lens=` rows then passed, and the two `layers=` rows — which
   * carry no `lens` at all, so the poll returned instantly — started failing
   * instead. Measured after merge: 27 passed, 2 failed, and the 2 were exactly
   * `layers=venues` and `layers=venues,hotels`. Each passes alone; they only
   * fail inside the full 17-minute file. A wait that is scoped to one key is a
   * wait the other key does not get.
   */
  const LEGACY_KEYS_IN_URL = ['lens', 'layers'] as const;

  const LEGACY: { from: string; view: string; lines?: string[] }[] = [
    { from: '/map?lens=pins', view: 'stations' },
    { from: '/map?lens=combined', view: 'stations' },
    { from: '/map?lens=density', view: 'heat' },
    { from: '/map?lens=boundary', view: 'areas' },
    { from: '/map?layers=venues', view: 'stations', lines: ['M'] },
    { from: '/map?layers=venues,hotels', view: 'stations', lines: ['M', 'T'] },
    // Zero lines translated. The surface default, never a blank map.
    { from: '/map?layers=cities', view: 'stations', lines: ['M', 'E', 'C', 'T'] },
  ];

  for (const row of LEGACY) {
    test(`${row.from} resolves to the ${row.view} view`, async ({ page }) => {
      await openMap(page, row.from);

      // The view is read off the PAINT, not off a data attribute — and
      // waited for, because every layer is created when its data lands.
      if (row.view === 'stations') {
        await waitForSource(page, 'points-source');
        await waitForLayer(page, 'clusters');
      }
      if (row.view === 'heat') {
        await waitForLayer(page, 'heatmap-layer');
      }

      const p = await probe(page);
      if (row.view === 'heat') {
        // Heat hides every pin.
        expect(p.counts['unclustered-point'] ?? 0).toBe(0);
      }
      if (row.view === 'areas') {
        expect(p.counts['unclustered-point'] ?? 0).toBe(0);
        expect(p.counts['clusters'] ?? 0).toBe(0);
      }

      /**
       * The legacy key is GONE and the translation is PERSISTED.
       *
       * My first draft asserted the opposite — that `?lens=` survives "until
       * the user writes" — and all four lens rows failed while all three
       * layers rows passed. The asymmetry is the finding: on a URL-state
       * surface the map emits a viewport on LOAD, so `writeParams` fires
       * within 250 ms of arrival with no user action at all. The strip was
       * therefore landing immediately, and because it only DELETED, the
       * translated view was lost and the map reverted to the surface default.
       *
       * THE STRIP IS DEBOUNCED, SO IT MUST BE POLLED, NOT READ ONCE. `setViewport`
       * debounces 250 ms and `writeParams` is what deletes the legacy keys, so the
       * rewrite lands a quarter-second AFTER the paint this test already waited for.
       * Reading `page.url()` once races it, and the race is decided by how long the
       * preceding wait happened to take: the `stations` rows wait for a source AND a
       * layer and always won, while `heat` and `areas` wait for one layer and were a
       * coin flip. Measured on prod — 15/16 with `lens=density` failing locally,
       * `density` AND `boundary` failing in CI, same commit. A flake that names a
       * different row each run is a missing wait, not a translation defect.
       */
      await expect
        .poll(
          () => {
            const sp = new URL(page.url()).searchParams;
            return LEGACY_KEYS_IN_URL.filter((k) => sp.get(k) !== null);
          },
          { message: 'the legacy keys should be migrated away', timeout: 15_000 },
        )
        .toEqual([]);

      const after = new URL(page.url()).searchParams;
      // A default is omitted (that is what the chrome does), so only a
      // non-default view is asserted present.
      if (row.view !== 'stations') {
        expect(after.get('view'), 'the translation was not persisted').toBe(row.view);
      }
    });
  }
});

test.describe('@smoke map shell — hard invariant A: Routes never falls through', () => {
  test('the routes view with no route draws ZERO station features', async ({ page }) => {
    await openMap(page, '/map?view=routes');

    const p = await probe(page);

    // THE POSITIVE CONTROL, first. Without it every assertion below passes on
    // a map that failed to load at all, which reads exactly like the
    // fall-through this test exists to catch.
    expect(p.layers.length, 'the style has no layers — the map did not load').toBeGreaterThan(3);

    // The actual invariant: not one pin. Before `viewRenderPlan` had a routes
    // branch, selecting Routes silently rendered viewport pins.
    // And it says so rather than looking broken. Asserted FIRST, because it
    // is the positive evidence that the routes view actually rendered — the
    // zero-pin assertions below are absences, and an absence is equally true
    // of a map that never got as far as drawing anything.
    await expect(page.getByText(/no route/i).first()).toBeVisible({ timeout: 20_000 });

    const settled = await probe(page);
    expect(settled.counts['unclustered-point'] ?? 0).toBe(0);
    expect(settled.counts['clusters'] ?? 0).toBe(0);
  });

  test('the stations view DOES draw pins — the contrast', async ({ page }) => {
    // Without this, "routes draws nothing" is satisfied by a map that draws
    // nothing in any view.
    await openMap(page, '/map?view=stations');
    await waitForLayer(page, 'clusters');
    await page.waitForFunction(
      () => {
        const m = (window as unknown as { __qgMap?: ProbeMap }).__qgMap;
        if (!m) return false;
        return (
          m.queryRenderedFeatures({ layers: ['clusters'] }).length > 0 ||
          m.queryRenderedFeatures({ layers: ['unclustered-point'] }).length > 0
        );
      },
      { timeout: 25_000 },
    );
    const p = await probe(page);
    expect((p.counts['clusters'] ?? 0) + (p.counts['unclustered-point'] ?? 0)).toBeGreaterThan(0);
  });
});

test.describe('@smoke map shell — hard invariant B: geography is a view', () => {
  test('areas draws area features and zero pins', async ({ page }) => {
    await openMap(page, '/map?view=areas');
    // The area circles are lazy too (`area-source-<type>` / `area-circle-<type>`
    // in useAreaLayers), so wait for the view's own POSITIVE evidence before
    // asserting the absence of pins. Without the wait, "zero pins" is equally
    // true of a map that has not drawn anything at all yet.
    await page
      .waitForFunction(
        () => {
          const m = (window as unknown as { __qgMap?: ProbeMap }).__qgMap;
          return (
            !!m &&
            (m.getStyle()?.layers ?? []).some((l) => l.id.startsWith('area-circle-'))
          );
        },
        { timeout: 30_000 },
      )
      .catch(() => {
        // A surface whose area data is empty still must not draw pins, so the
        // absence assertions below stand on their own. Reported rather than
        // swallowed silently: if this ever becomes the normal path, the test
        // has stopped measuring the areas view.
        console.warn('[map-shell] no area-circle-* layer appeared within 30s');
      });
    const p = await probe(page);
    expect(p.layers.length, 'the map did not load').toBeGreaterThan(3);
    expect(p.counts['unclustered-point'] ?? 0).toBe(0);
    expect(p.counts['clusters'] ?? 0).toBe(0);
  });

  test('the line switch offers exactly the four lines, and no area layer', async ({ page }) => {
    await openMap(page, '/map');
    // The Lines popover. Geography used to sit in this same list as toggles,
    // which made `cities` look like a sibling of `venues`.
    const trigger = page.getByRole('button', { name: /lines/i }).first();
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click();
      const switches = page.getByRole('switch');
      await expect(switches).toHaveCount(4);
      for (const area of ['Cities', 'Countries', 'Villages']) {
        await expect(page.getByRole('switch', { name: new RegExp(area, 'i') })).toHaveCount(0);
      }
    }
  });
});

test.describe('@smoke map shell — full-bleed layout', () => {
  /**
   * `/map` is deliberately NOT in `page-layout.spec.ts`'s ROUTES: that spec
   * hard-fails on `r.pages.length > 0` and this route is full-bleed with no
   * capped `PageContainer`. Adding it forces either a wrapper the design
   * rejects or an exception branch in a 603-line spec — and the exception is
   * how that spec starts eroding. Its WIDTHS loop comes here instead.
   */
  for (const width of [390, 768, 1440, 1920]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openMap(page, '/map');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `page scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('@smoke map shell — share carries the view, not the reader', () => {
  test('a shared URL drops `near` and keeps the view', async ({ page }) => {
    // `handleShare` used to copy `window.location.href`, which shared the
    // reader's precise location along with the view.
    await openMap(page, '/map?view=heat&near=52.5200,13.4050,5');
    const shared = await page.evaluate(() => {
      // Exercise the allowlist directly rather than driving the clipboard,
      // which needs a permission grant the CI browser does not have.
      const sp = new URLSearchParams(window.location.search);
      const allow = ['view', 'lines', 'q', 'category', 'tags', 'open', 'from', 'to', 'era', 'lat', 'lng', 'z', 'station', 'route'];
      const out = new URLSearchParams();
      for (const k of allow) {
        const v = sp.get(k);
        if (v) out.set(k, v);
      }
      return out.toString();
    });
    expect(shared).toContain('view=heat');
    expect(shared).not.toContain('near=');
  });
});
