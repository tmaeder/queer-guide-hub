import { test, expect } from '@playwright/test';

/**
 * Smoke tests for /trips/inbox and the /bookings → /trips redirect.
 *
 * The /bookings route was consolidated into /trips (App.tsx:491 — Navigate
 * to="/trips"), not /trips/inbox; the test asserts the consolidation, which
 * is what users actually experience.
 *
 * Signed-out only — same rationale as trips.spec.ts. Authenticated flows
 * (orphans rendering, attach-to-trip, suggestion → create trip) need
 * test fixtures we don't keep in CI yet; those are covered by manual UAT
 * in the Wave 1 verification plan.
 *
 * Run against a deploy preview or queer.guide:
 *   E2E_BASE_URL=https://queer.guide npx playwright test e2e/trips-inbox.spec.ts
 */

test.describe('/bookings → /trips redirect', () => {
  test('redirects to the trips page', async ({ page }) => {
    await page.goto('/bookings');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/trips(\/|$|\?)/);
  });

  test('preserves the redirect for locale-prefixed URLs', async ({ page }) => {
    await page.goto('/de/bookings');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/trips(\/|$|\?)/);
  });
});

test.describe('/trips/inbox (signed out)', () => {
  test('renders the trips signed-out hero, not a crash', async ({ page }) => {
    await page.goto('/trips/inbox');
    await page.waitForLoadState('domcontentloaded');

    // Signed-out users get the same TripsSignedOutHero as /trips. We assert
    // the page rendered something interactive — not a blank or error screen.
    await expect(
      page.getByRole('button').filter({ hasText: /sign in|anmelden|connexion|iniciar/i }).first(),
    ).toBeVisible({ timeout: 15000 });
  });

  test('does not console.error on first paint', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/trips/inbox');
    await page.waitForLoadState('networkidle');

    const ours = errors.filter(
      (e) =>
        !/sentry|posthog|google|umami|cloudflare/i.test(e) &&
        !/failed to fetch dynamically imported module/i.test(e) &&
        !/manifest\.webmanifest/i.test(e),
    );
    expect(ours, `Unexpected console errors:\n${ours.join('\n')}`).toHaveLength(0);
  });
});

test.describe('header user menu', () => {
  test('no longer exposes a standalone /bookings link', async ({ page }) => {
    // Even when not authenticated, the menu items array is bundled into
    // the JS. We can't open the user menu without an account, so instead
    // we assert no anchor in the entire page points at /bookings — that
    // would only happen if we forgot to remove the nav entry.
    await page.goto('/trips');
    await page.waitForLoadState('networkidle');
    const directLinks = page.locator('a[href$="/bookings"], a[href*="/bookings?"]');
    expect(await directLinks.count()).toBe(0);
  });
});
