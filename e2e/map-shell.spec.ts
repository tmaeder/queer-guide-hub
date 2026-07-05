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
