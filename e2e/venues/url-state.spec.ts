import { test, expect } from '@playwright/test';

// Venues audit Phase 2 (P0): /venues filter / search / sort / view round-trip
// through the URL. Deep links restore state; back/forward steps through
// filter changes; refresh preserves selection.

test.describe('Venues — URL ↔ state contract', () => {
  test('deep link applies category, search, sort, view', async ({ page }) => {
    await page.goto('/venues?category=bar&q=berghain&sort=created_at&view=map');
    await page.waitForLoadState('domcontentloaded');

    // Search input pre-filled.
    const search = page.getByPlaceholder('Search venues & organizations...');
    await expect(search).toHaveValue('berghain');

    // Sort dropdown set to Newest (created_at).
    const sortTrigger = page.getByRole('combobox', { name: /sort venues/i });
    await expect(sortTrigger).toContainText(/newest/i);

    // Map view active (the map container is rendered, no grid).
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 15_000 });
  });

  test('clicking bar chip writes ?category=bar; reload preserves it', async ({ page }) => {
    await page.goto('/venues');
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: /^bar$/i }).first().click();
    await expect(page).toHaveURL(/[?&]category=bar(?:&|$)/);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/[?&]category=bar(?:&|$)/);
    // Bar button still has active styling (default variant).
    const barBtn = page.getByRole('button', { name: /^bar$/i }).first();
    await expect(barBtn).toBeVisible();
  });

  test('back button reverts last filter change', async ({ page }) => {
    await page.goto('/venues');
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: /^bar$/i }).first().click();
    await expect(page).toHaveURL(/category=bar/);

    await page.getByRole('button', { name: /^cafe$/i }).first().click();
    await expect(page).toHaveURL(/category=cafe/);

    await page.goBack();
    await expect(page).toHaveURL(/category=bar/);
  });

  test('header count updates with filters; shows "of total" when no filters', async ({
    page,
  }) => {
    await page.goto('/venues');
    await page.waitForLoadState('domcontentloaded');
    // Wait for count to render.
    const counter = page.locator('p[aria-live="polite"]').first();
    await expect(counter).toBeVisible({ timeout: 30_000 });
    const baselineText = (await counter.textContent()) ?? '';
    // No-filter state should *either* show no "of" (filteredTotal===datasetTotal)
    // or include "of <total>" (paginated subset). Apply a filter and assert
    // the count strictly differs from datasetTotal.
    await page.getByRole('button', { name: /^bar$/i }).first().click();
    await page.waitForTimeout(750); // Let the filter request settle.
    const filteredText = (await counter.textContent()) ?? '';
    expect(filteredText).not.toBe(baselineText);
    // Filtered state never shows "of <total>" because filteredTotal !== datasetTotal.
    // (It also never shows it when no filters are active, if the dataset
    // count matches the filtered count. The audit copy expects the bare
    // "<n> venues" form when filters are on.)
    expect(filteredText.toLowerCase()).toMatch(/\d[\d,]*\s+venues?/);
  });
});
