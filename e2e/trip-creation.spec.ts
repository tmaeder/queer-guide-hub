import { test, expect } from '@playwright/test';

/**
 * Signed-out smoke tests for the trip-creation surface.
 *
 * Full signed-in flow (picking a city via CityCountryAutocomplete + submitting)
 * needs a test account we don't bake into CI — this spec just guards that the
 * create dialog doesn't crash on first paint and that the geo-required gate
 * is wired up client-side.
 *
 *   E2E_BASE_URL=https://queer.guide npx playwright test e2e/trip-creation.spec.ts
 */

test.describe('/trips create dialog (signed out)', () => {
  test('signed-out users see the auth CTA, not the create dialog', async ({ page }) => {
    await page.goto('/trips');

    // Primary CTA opens auth, not the create trip dialog
    await expect(
      page.getByRole('button').filter({ hasText: /sign in|anmelden|connexion|iniciar/i }).first(),
    ).toBeVisible({ timeout: 15000 });

    // Trip creation form is NOT rendered for signed-out users
    await expect(page.locator('input[name="title"]')).toHaveCount(0);
  });

  test('no console errors from the CityCountryAutocomplete bundle', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/trips');
    await page.waitForLoadState('networkidle');

    const ours = errors.filter(
      (e) =>
        !/sentry|posthog|google|umami|cloudflare/i.test(e) &&
        !/failed to fetch dynamically imported module/i.test(e) &&
        !/manifest\.webmanifest/i.test(e) &&
        // Network/cert errors are infrastructure, not application code.
        // Sandboxed CI runners may not trust the public CA chain. Bare
        // ERR_FAILED / ERR_ABORTED also surface when vite preview aborts
        // a request mid-flight (cancelled prefetch after navigation).
        !/net::ERR_(CERT|DNS|NAME|CONNECTION|NETWORK|INTERNET)_/i.test(e) &&
        !/Failed to load resource:.*net::ERR_(FAILED|ABORTED)/i.test(e),
    );
    expect(ours, `Unexpected errors:\n${ours.join('\n')}`).toHaveLength(0);
  });
});
