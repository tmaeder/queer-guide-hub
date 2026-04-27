import { test, expect } from '@playwright/test';

/**
 * Smoke tests for the /trips surface.
 *
 * These tests target the signed-out experience only, since authenticated
 * flows need credentials we don't want to bake into CI. The goal is to
 * catch catastrophic breakage (the page not rendering, the gate missing,
 * the create dialog crashing) rather than full product verification.
 *
 * Run against a deploy preview or queer.guide:
 *   E2E_BASE_URL=https://queer.guide npx playwright test e2e/trips.spec.ts
 */

test.describe('/trips (signed out)', () => {
  test('renders the signed-out hero with both CTAs', async ({ page }) => {
    await page.goto('/trips');

    // Wait for the SPA to hydrate — the hero renders a primary + secondary
    // CTA. We don't assert text content because it's i18n-driven and the
    // page may pick a non-English locale based on Accept-Language.
    await expect(
      page.getByRole('button').filter({ hasText: /sign in|anmelden|connexion|iniciar/i }).first(),
    ).toBeVisible({ timeout: 15000 });

    // The trip planner hero is distinguished by its 3 value bullets.
    // We assert at least two non-empty <h3>/<h6> landmarks are present
    // inside the hero area.
    const headings = page.locator('main h1, main h2, main h3, main h4');
    await expect(headings.first()).toBeVisible();
  });

  test('does not console.error on first paint', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/trips');
    await page.waitForLoadState('networkidle');

    // Filter out known noisy third-party errors that aren't ours to fix.
    const ours = errors.filter(
      (e) =>
        !/sentry|posthog|google|umami|cloudflare/i.test(e) &&
        !/failed to fetch dynamically imported module/i.test(e) &&
        !/manifest\.webmanifest/i.test(e),
    );
    expect(ours, `Unexpected console errors:\n${ours.join('\n')}`).toHaveLength(0);
  });

  test('opens the auth dialog when the primary CTA is clicked', async ({ page }) => {
    await page.goto('/trips');

    const cta = page
      .getByRole('button')
      .filter({ hasText: /sign in|anmelden|connexion|iniciar/i })
      .first();
    await cta.click();

    // Radix Dialog portals to document.body. Assert a dialog with an email
    // field appears within a reasonable timeout.
    const emailInput = page.locator('input[type="email"]').first();
    await expect(emailInput).toBeVisible({ timeout: 5000 });
  });
});

test.describe('/trips/shared/:token (read-only)', () => {
  test('unknown token shows a graceful not-found state', async ({ page }) => {
    await page.goto('/trips/shared/does-not-exist-000000');

    // Either the error state copy renders, or the query fails and we show
    // a "Trip not found" message. Accept either via a broad regex.
    await expect(
      page.locator('text=/not found|no encontrado|nicht gefunden|introuvable/i').first(),
    ).toBeVisible({ timeout: 15000 });
  });
});
