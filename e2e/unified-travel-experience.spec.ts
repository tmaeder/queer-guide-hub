import { test, expect } from '@playwright/test';

/**
 * E2E smoke for the unified travel experience redesign.
 * Covers the public-facing surfaces from Phases 1-6.
 * Runs against E2E_BASE_URL (defaults to https://queer.guide).
 */

test.describe('unified travel experience', () => {
  // The Browse/Plan tablist was removed — /travel is now a single hub page
  // (src/pages/Travel.tsx). Legacy ?mode= URLs are still accepted and
  // normalised away (or redirected to the primary trip for mode=plan).
  test('/travel renders the travel hub', async ({ page }) => {
    await page.goto('/travel');
    await expect(
      page.getByRole('heading', { level: 1, name: /travel/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('legacy ?mode=browse is dropped from the URL', async ({ page }) => {
    await page.goto('/travel?mode=browse');
    await expect(page).not.toHaveURL(/[?&]mode=/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/travel/);
  });

  test('/hotels survives as transactional shortcut', async ({ page }) => {
    const res = await page.goto('/hotels');
    expect(res?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/hotels/);
  });

  test('/trips redirects to /hub/plans and renders the anon gate', async ({ page }) => {
    await page.goto('/trips');
    await expect(page).toHaveURL(/\/hub\/plans/);
    // Anonymous users hit the AuthGate (its title is an <h4>).
    await expect(page.locator('h1, h2, h3, h4').first()).toBeVisible();
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
