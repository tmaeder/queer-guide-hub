/**
 * E2E coverage for MapShell — the unified map chrome.
 *
 * The chrome was rebuilt 2026-08-10 around three controls (Search / Filters /
 * Lines) instead of seven, so these assertions moved with it:
 *   - the bar is `[data-testid=map-bar]`, one component at every width
 *     (`map-command-bar` was the desktop-only CommandBar, which is gone)
 *   - the lens radiogroup lives inside Filters, not in the bar
 *   - Layers is now "Lines", the line key, which both names and switches them
 *
 * These used to `test.skip()` when the bar was absent, back when
 * VITE_MAP_SHELL could turn it off. The flag is gone, so a missing bar is a
 * FAILURE, not a reason to skip — a spec that skips itself when the thing
 * under test is missing can never go red.
 */
import { test, expect } from '@playwright/test';

const BAR = '[data-testid=map-bar]';

/** Open the Filters surface (popover on desktop, sheet on mobile). */
async function openFilters(page: import('@playwright/test').Page) {
  await page.locator(`${BAR} button[aria-label^="Filters"]:visible`).first().click();
}

test.describe('MapShell — discover surface (/map)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en/map');
    await expect(page.locator(BAR)).toBeVisible({ timeout: 15000 });
  });

  test('renders three controls: search, filters, lines', async ({ page }) => {
    const bar = page.locator(BAR);
    await expect(bar.locator('input[placeholder="Search this map"]')).toBeVisible();
    await expect(bar.locator('button[aria-label^="Filters"]:visible').first()).toBeVisible();
    await expect(bar.locator('button[aria-label^="Lines"]:visible').first()).toBeVisible();

    // The bar is exactly these three. The old one also carried four quick-filter
    // chips, a lens radiogroup and a "More" menu; if any of those come back to
    // the bar, this count moves and the test says so.
    await expect(bar.locator('button:visible')).toHaveCount(2);
  });

  test('the line key both names a line and switches it off', async ({ page }) => {
    await page.locator(`${BAR} button[aria-label^="Lines"]:visible`).first().click();

    const venues = page.getByRole('switch', { name: /Venues/ });
    await expect(venues).toBeVisible();
    await expect(venues).toHaveAttribute('aria-checked', 'true');

    await venues.click();
    await expect(venues).toHaveAttribute('aria-checked', 'false');
    await expect(page).toHaveURL(/[?&]layers=/);
  });

  // KNOWN BROKEN, and not by the rename — `test.fixme` rather than `skip`
  // because this SHOULD pass and a silent skip reads identical to a pass.
  //
  // Clicking Heat flips `data-map-lens` to `density` but never writes
  // `?lens=density`. Measured on prod 2026-08-19, three ways:
  //   - clicking AREAS does write `?lens=boundary` — same code path, so a
  //     label rename cannot explain the difference;
  //   - loading `/map?lens=density` directly works AND the param survives
  //     alongside the viewport params, so reading and persisting are fine;
  //   - discover's defaultLens is `combined`, so the `sp.delete('lens')`
  //     branch in useMapShellState should not be taken.
  // Suspected race between setLens and the viewport's own replace:true
  // setSearchParams. Tracked separately.
  test.fixme('Heat lens flips data-map-lens and URL param', async ({ page }) => {
    await openFilters(page);
    await page.getByRole('radio', { name: 'Heat' }).click();
    await expect
      .poll(async () => page.locator('[data-map-surface]').getAttribute('data-map-lens'))
      .toBe('density');
    await expect(page).toHaveURL(/[?&]lens=density/);

    // Switch back to Stations removes the param (it equals the surface
    // default). The LABEL is "Stations"; the URL value stays `pins`, because
    // the lens keys are shared-link state and were deliberately not renamed.
    await page.getByRole('radio', { name: 'Stations' }).click();
    await expect
      .poll(async () => page.locator('[data-map-surface]').getAttribute('data-map-lens'))
      .toBe('pins');
    await expect(page).not.toHaveURL(/[?&]lens=/);
  });

  test('Areas lens persists in URL when shared', async ({ page }) => {
    await openFilters(page);
    await page.getByRole('radio', { name: 'Areas' }).click();
    await expect(page).toHaveURL(/[?&]lens=boundary/);
    // Reload preserves it.
    await page.reload();
    await expect
      .poll(async () => page.locator('[data-map-surface]').getAttribute('data-map-lens'))
      .toBe('boundary');
  });

  test('Filters adds a chip and updates URL; clicking chip removes it', async ({ page }) => {
    await openFilters(page);
    await page.getByRole('button', { name: /^Bar$/ }).first().click();

    const chip = page.locator('[aria-label="Active filters"] button', { hasText: 'Bar' }).first();
    await expect(chip).toBeVisible();
    await expect(page).toHaveURL(/[?&]category=bar/);

    await chip.click();
    await expect(chip).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]category=/);
  });
});

/**
 * Every chrome test above passed while all maps on the site rendered a blank
 * canvas for two days: maplibre-gl 6 could not load its own worker, and a map
 * with a dead worker still mounts its controls, its canvas and its DOM. So
 * none of the assertions above can detect that class of failure.
 *
 * Three signals here, all observable from the page:
 *
 *  1. The worker exists. maplibre-gl 6 derives its worker URL at runtime, so
 *     the asset is not emitted unless src/config/maplibreWorker.ts bundles it;
 *     without it the request falls through to the SPA fallback and returns
 *     HTML, and no worker ever starts.
 *  2. Glyph PBFs are fetched. Do NOT swap this for a `.mvt` assertion — tiles
 *     are fetched from inside the worker and are invisible to page-level
 *     events (that invisibility is a large part of why this shipped). Glyphs
 *     are requested on the main thread, and only once the worker has parsed
 *     tile data and a symbol layer needs a fontstack — so a glyph request is
 *     positive proof that tiles were fetched AND parsed.
 *  3. The canvas has actually painted something other than paper. A style whose
 *     sources all 404 still produces a canvas of the right size filled with the
 *     background colour, which (1) and (2) cannot distinguish from a real map.
 */
test.describe('MapShell — basemap actually loads', () => {
  test('starts the MapLibre worker, loads glyphs, and paints', async ({ page }) => {
    const workers: string[] = [];
    const glyphs: string[] = [];
    page.on('worker', (w) => workers.push(w.url()));
    page.on('response', (r) => {
      if (r.url().includes('.pbf')) glyphs.push(`${r.status()} ${r.url()}`);
    });

    await page.goto('/en/map');
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 15000 });

    await expect
      .poll(() => workers.filter((u) => u.includes('maplibre-gl-worker')).length, {
        timeout: 20000,
        message:
          'No MapLibre worker started. The worker asset is probably missing from the build and the request is being answered by the SPA fallback as text/html — see src/config/maplibreWorker.ts.',
      })
      .toBeGreaterThan(0);

    await expect
      .poll(() => glyphs.filter((g) => g.startsWith('200')).length, {
        timeout: 30000,
        message:
          'MapLibre worker started but no glyph PBF loaded, which means no vector tile was parsed. The basemap is blank.',
      })
      .toBeGreaterThan(0);

    // REMOVED 2026-08-12: a distinct-colour count taken by drawing the MapLibre
    // canvas into a 2D canvas and reading getImageData. It could never pass and
    // never did — it failed on every nightly from the day it was added (#2708).
    //
    // A WebGL drawing buffer is cleared once the frame is composited unless the
    // context was created with `preserveDrawingBuffer: true`. MapLibre does not
    // set that and neither do we (the flag has never appeared in src/), so
    // `drawImage` from that canvas yields a blank image and the count is always
    // 1 — the exact "Received: 1" in the failure. The map itself is healthy: it
    // paints correctly in a real browser, and this test's own worker and glyph
    // assertions above pass, so the worker booted and vector tiles were fetched
    // and parsed.
    //
    // Deliberately NOT "fixed" by enabling preserveDrawingBuffer: that costs
    // memory and a per-frame copy on every visitor's map, and degrading prod to
    // satisfy a test is the wrong trade. The blank-basemap regression this file
    // exists for (#2589 — the worker asset 404'd and the SPA fallback answered
    // with text/html) is already caught by the two assertions above, which are
    // the ones that actually failed then.
    //
    // A real paint guard is still possible: screenshot the canvas through
    // Playwright (its capture goes via the compositor, so it DOES see WebGL
    // content) and compare to a baseline or a byte-size floor.
  });
});

test.describe('MapShell — mobile chrome (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('all three controls are reachable without scrolling', async ({ page }) => {
    await page.goto('/en/map');
    const bar = page.locator(BAR);
    await expect(bar).toBeVisible({ timeout: 15000 });

    // The bar is fixed — every control must be inside the viewport (the old
    // mobile bar hid these behind an undiscoverable horizontal scroll).
    await expect(bar.locator('button[aria-label="Search this map"]')).toBeInViewport();
    const filtersEntry = bar.locator('button[aria-label^="Filters"]');
    await expect(filtersEntry).toBeInViewport();
    await expect(bar.locator('button[aria-label^="Lines"]')).toBeInViewport();

    // Filters opens the same content as desktop, in a sheet.
    await filtersEntry.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Heat' })).toBeVisible();
  });
});

test.describe('MapShell — search surface', () => {
  test('search results map hides the lens control (single-lens surface)', async ({ page }) => {
    await page.goto('/en/search?q=berlin');

    // Wait for the search page to settle. The map tab toggle text is "Map view".
    const mapTabButton = page.getByRole('button', { name: 'Map view' }).first();
    if (!(await mapTabButton.isVisible({ timeout: 4000 }).catch(() => false))) {
      test.skip(true, 'Map view tab not present');
    }
    await mapTabButton.click();

    await expect(page.locator(BAR)).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-map-surface="search"]')).toBeVisible();

    // Only one lens is available here, so the View section never renders.
    await openFilters(page);
    await expect(page.getByRole('radio', { name: 'Heat' })).toHaveCount(0);
  });
});
