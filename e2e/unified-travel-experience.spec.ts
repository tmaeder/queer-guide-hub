import { test, expect } from '@playwright/test';

/**
 * E2E smoke for the unified travel experience redesign.
 * Covers the public-facing surfaces from Phases 1-6.
 * Runs against E2E_BASE_URL (defaults to https://queer.guide).
 */

test.describe('unified travel experience', () => {
  test('/travel renders Browse/Plan mode switcher', async ({ page }) => {
    await page.goto('/travel');
    await expect(page.getByRole('tablist', { name: /travel mode/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /browse/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /plan/i })).toBeVisible();
  });

  test('mode switch updates ?mode= in URL', async ({ page }) => {
    await page.goto('/travel');
    await page.getByRole('tab', { name: /plan/i }).click();
    await expect(page).toHaveURL(/[?&]mode=plan/);
    await page.getByRole('tab', { name: /browse/i }).click();
    await expect(page).toHaveURL(/[?&]mode=browse/);
  });

  test('/hotels survives as transactional shortcut', async ({ page }) => {
    const res = await page.goto('/hotels');
    expect(res?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/hotels/);
  });

  test('/trips signed-out hero renders', async ({ page }) => {
    await page.goto('/trips');
    await expect(page.locator('h1, h2, h3').first()).toBeVisible();
  });

  test('/profile/footprint requires auth (no crash on unauthenticated load)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/profile/footprint');
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });

  test('legacy /trips/:id/today URL redirects to ?view=today', async ({ page }) => {
    // Use a known non-existent trip id — we only care about the redirect, not
    // whether the trip resolves. The router should rewrite the URL before the
    // page attempts a data fetch.
    await page.goto('/trips/00000000-0000-0000-0000-000000000000/today');
    await expect(page).toHaveURL(/\?view=today/);
  });

  test('legacy /trips/:id/booklet URL redirects to ?view=booklet', async ({ page }) => {
    await page.goto('/trips/00000000-0000-0000-0000-000000000000/booklet');
    await expect(page).toHaveURL(/\?view=booklet/);
  });
});
