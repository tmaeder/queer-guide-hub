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

  test('Density lens flips data-map-lens and URL param', async ({ page }) => {
    await openFilters(page);
    await page.getByRole('radio', { name: 'Density' }).click();
    await expect
      .poll(async () => page.locator('[data-map-surface]').getAttribute('data-map-lens'))
      .toBe('density');
    await expect(page).toHaveURL(/[?&]lens=density/);

    // Switch back to Pins removes the param (it equals the surface default).
    await page.getByRole('radio', { name: 'Pins' }).click();
    await expect
      .poll(async () => page.locator('[data-map-surface]').getAttribute('data-map-lens'))
      .toBe('pins');
    await expect(page).not.toHaveURL(/[?&]lens=/);
  });

  test('Boundary lens persists in URL when shared', async ({ page }) => {
    await openFilters(page);
    await page.getByRole('radio', { name: 'Boundary' }).click();
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

    // Distinct colours on the canvas. A blank paper rectangle is 1–2; a drawn
    // basemap has roads, water washes, landcover and labels.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const c = document.querySelector('canvas.maplibregl-canvas') as HTMLCanvasElement;
            if (!c) return 0;
            const g = document.createElement('canvas');
            g.width = 120;
            g.height = 120;
            const ctx = g.getContext('2d');
            if (!ctx) return 0;
            ctx.drawImage(c, 0, 0, 120, 120);
            const { data } = ctx.getImageData(0, 0, 120, 120);
            const seen = new Set<string>();
            for (let i = 0; i < data.length; i += 4) {
              seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
            }
            return seen.size;
          }),
        {
          timeout: 30000,
          message: 'The canvas is a flat fill — tiles loaded but nothing was drawn.',
        },
      )
      .toBeGreaterThan(8);
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
    await expect(page.getByRole('radio', { name: 'Density' })).toBeVisible();
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
    await expect(page.getByRole('radio', { name: 'Density' })).toHaveCount(0);
  });
});
