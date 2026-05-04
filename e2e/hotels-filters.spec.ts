import { test, expect } from '@playwright/test';

/**
 * Phase 1 smoke for /hotels: type filter, URL state, /venues/<section> redirect,
 * 404 prerender meta on unknown hotel slug.
 *
 * Phase 4 cases (Load More dedupe, search relevance) are intentionally skipped
 * here — they belong to a separate PR.
 */

test.describe('Hotels — Phase 1 quick wins', () => {
  test('apartment filter returns at least one card and reflects in the URL', async ({ page }) => {
    await page.goto('/hotels', { waitUntil: 'networkidle' });

    // Open the type select. shadcn/Radix select uses combobox role.
    const typeSelect = page.getByRole('combobox').first();
    await typeSelect.click();
    await page.getByRole('option', { name: 'Apartment' }).click();

    await expect(page).toHaveURL(/[?&]type=apartment/);

    // First request settles, results render.
    await page.waitForLoadState('networkidle');
    await expect(
      page.locator('[class*="grid"] > a, [class*="grid"] > div').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('B&B chip shows display label, not slug', async ({ page }) => {
    // Use a guaranteed-zero query so the empty state with chips renders.
    await page.goto('/hotels?type=bnb&q=__definitely_not_a_real_name__zzz', {
      waitUntil: 'networkidle',
    });
    await expect(page.getByText('B&B', { exact: false })).toBeVisible();
    await expect(page.getByText('bnb ×')).toHaveCount(0);
  });

  test('/venues/hotels redirects to /hotels', async ({ page }) => {
    await page.goto('/venues/hotels');
    await expect(page).toHaveURL(/\/hotels$/);
  });

  test('unknown hotel slug renders 404 prerender meta', async ({ page }) => {
    await page.goto('/hotels/__definitely-not-a-real-slug-9999999', {
      waitUntil: 'networkidle',
    });
    await expect(page.getByText('Hotel not found')).toBeVisible();
    const status = await page
      .locator('meta[name="prerender-status-code"]')
      .getAttribute('content');
    expect(status).toBe('404');
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });

  test.skip('Phase 4: Load More adds 24 unique cards per click', () => {
    // Implemented in fix/hotels-phase-4-pagination-search.
  });

  test.skip('Phase 4: searching Berlin returns only city=Berlin rows', () => {
    // Implemented in fix/hotels-phase-4-pagination-search.
  });
});
