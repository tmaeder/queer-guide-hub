/**
 * E2E coverage for MapShell — the unified map chrome behind VITE_MAP_SHELL.
 *
 * Covers the chassis behaviours that don't need real Supabase data:
 *   - Command bar renders on /map
 *   - LensPicker is visible and switches lens via URL state
 *   - Filter popover toggles a filter and pins a chip below the bar
 *   - Removing a chip clears the URL param
 *   - The single-lens search surface hides the LensPicker
 *
 * Skipped unless the build under test is running with VITE_MAP_SHELL=true
 * (the legacy chrome path doesn't expose the [data-testid=map-command-bar]
 * hook, so the spec auto-detects feature availability and skips otherwise).
 */
import { test, expect } from '@playwright/test';

test.describe('MapShell — discover surface (/map)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en/map');
    // /map can briefly mount the legacy chrome before MapShell hydrates; wait
    // for either the new command bar (flag on) or a legacy marker (flag off).
    const bar = page.locator('[data-testid=map-command-bar]');
    const legacy = page.locator('[aria-label="Show map layers"], [aria-label="Hide map layers"]');
    await Promise.race([
      bar.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null),
      legacy.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => null),
    ]);
    if (!(await bar.isVisible().catch(() => false))) {
      test.skip(true, 'VITE_MAP_SHELL not enabled in this build');
    }
  });

  test('renders command bar with search, lens picker, filter, layer, more', async ({ page }) => {
    const bar = page.locator('[data-testid=map-command-bar]');
    await expect(bar).toBeVisible();
    // Search is collapsed to an icon button by default; the input only
    // renders after clicking it (CommandBar.tsx).
    const searchToggle = bar.locator('button[aria-label="Search this map"]');
    await expect(searchToggle).toBeVisible();
    await searchToggle.click();
    await expect(bar.locator('input[placeholder="Search this map"]')).toBeVisible();
    await expect(bar.locator('[role=radiogroup][aria-label="Map view"]')).toBeVisible();
    // Filters renders twice (mobile Sheet + desktop Popover trigger) — only
    // one is visible per breakpoint, and the label gains ", N active".
    await expect(bar.locator('button[aria-label^="Filters"]:visible').first()).toBeVisible();
    await expect(bar.locator('button[aria-label="Layers"]')).toBeVisible();
    await expect(bar.locator('button[aria-label="More map options"]')).toBeVisible();
  });

  test('Density lens flips data-map-lens and URL param', async ({ page }) => {
    await page.click('[role=radio][aria-label="Density"]');
    await expect.poll(async () => page.locator('[data-map-surface]').getAttribute('data-map-lens'))
      .toBe('density');
    await expect(page).toHaveURL(/[?&]lens=density/);

    // Switch back to Pins removes the param (it equals the surface default).
    await page.click('[role=radio][aria-label="Pins"]');
    await expect.poll(async () => page.locator('[data-map-surface]').getAttribute('data-map-lens'))
      .toBe('pins');
    await expect(page).not.toHaveURL(/[?&]lens=/);
  });

  test('Boundary lens persists in URL when shared', async ({ page }) => {
    await page.click('[role=radio][aria-label="Boundary"]');
    await expect(page).toHaveURL(/[?&]lens=boundary/);
    // Reload preserves it.
    await page.reload();
    await expect.poll(async () => page.locator('[data-map-surface]').getAttribute('data-map-lens'))
      .toBe('boundary');
  });

  // The Queer-owned toggle left the panel — MapFiltersPanel now offers
  // category chips / tags / near-me. Toggle the Bar category instead.
  test('Filter popover adds a chip and updates URL; clicking chip removes it', async ({ page }) => {
    await page.locator('button[aria-label^="Filters"]:visible').first().click();
    const barOpt = page.getByRole('button', { name: /^Bar$/ }).first();
    await barOpt.click();

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
 * Two signals here, both chosen because they are observable from the page:
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
 */
test.describe('MapShell — basemap actually loads', () => {
  test('starts the MapLibre worker and loads glyphs', async ({ page }) => {
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
  });
});

test.describe('MapShell — mobile chrome (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('lens picker + filters entry are visible without scrolling', async ({ page }) => {
    await page.goto('/en/map');
    const bar = page.locator('[data-testid=map-command-bar]');
    if (!(await bar.isVisible({ timeout: 10000 }).catch(() => false))) {
      test.skip(true, 'VITE_MAP_SHELL not enabled in this build');
    }
    // Row 1 is fixed — every critical control must be inside the viewport
    // (the old bar hid these behind an undiscoverable horizontal scroll).
    await expect(bar.locator('button[aria-label="Search this map"]')).toBeInViewport();
    await expect(bar.locator('[role=radiogroup][aria-label="Map view"]')).toBeInViewport();
    const filtersEntry = bar.locator('button[aria-label^="Filters"]');
    await expect(filtersEntry).toBeInViewport();

    // The single filters entry opens the consolidated controls sheet.
    await filtersEntry.click();
    await expect(page.getByRole('dialog').getByText('Map options')).toBeVisible();
  });
});

test.describe('MapShell — search surface', () => {
  test('search results map hides lens picker (single-lens surface)', async ({ page }) => {
    await page.goto('/en/search?q=berlin');

    // Wait for the search page to settle. The map tab toggle text is "Map view".
    const mapTabButton = page.getByRole('button', { name: 'Map view' }).first();
    if (!(await mapTabButton.isVisible({ timeout: 4000 }).catch(() => false))) {
      test.skip(true, 'Map view tab not present');
    }
    await mapTabButton.click();

    const bar = page.locator('[data-testid=map-command-bar]');
    if (!(await bar.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'VITE_MAP_SHELL not enabled in this build');
    }

    await expect(page.locator('[data-map-surface="search"]')).toBeVisible();
    // LensPicker is hidden because the search surface only allows 'pins'.
    await expect(bar.locator('[role=radiogroup][aria-label="Map view"]')).toHaveCount(0);
  });
});
