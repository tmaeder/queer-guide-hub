import { test, expect } from '@playwright/test';
import { openSignedOutTripGate } from './support/tripAuthGate';

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
  // The chromium project applies the admin storageState whenever E2E_ADMIN_*
  // resolves, so "signed out" has to be ASKED for — a spec that merely never
  // signs in is signed IN. Those secrets began resolving between the 08-18 and
  // 08-19 nightlies, which is when these cases started failing there while
  // passing locally, where no credentials exist.
  test.use({ storageState: { cookies: [], origins: [] }, locale: 'en-US' });

  test('redirects signed-out visitors to the Hub authentication gate', async ({ page }) => {
    await openSignedOutTripGate(page);
  });

  test('does not console.error on first paint', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await openSignedOutTripGate(page);

    // Filter out known noisy third-party errors that aren't ours to fix.
    const ours = errors.filter(
      (e) =>
        !/sentry|posthog|google|umami|cloudflare/i.test(e) &&
        !/failed to fetch dynamically imported module/i.test(e) &&
        !/manifest\.webmanifest/i.test(e) &&
        // Network/cert errors are infrastructure, not application code.
        // Sandboxed CI runners may not trust the public CA chain.
        !/net::ERR_(CERT|DNS|NAME|CONNECTION|NETWORK|INTERNET)_/i.test(e),
    );
    expect(ours, `Unexpected console errors:\n${ours.join('\n')}`).toHaveLength(0);
  });

  test('opens the authentication page when the gate link is clicked', async ({ page }) => {
    const cta = await openSignedOutTripGate(page);
    await cta.click();

    await expect(page).toHaveURL(/\/auth(?:[?#].*)?$/);
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
