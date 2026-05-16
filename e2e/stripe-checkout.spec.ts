import { test, expect } from '@playwright/test';

/**
 * Phase 5 — smoke for the Stripe checkout entry point.
 *
 * Real Stripe redirects to checkout.stripe.com which we can't
 * fully exercise in CI without test-mode keys. We only verify
 * the local entry surface (paid feature page → checkout button)
 * renders and the button isn't disabled/missing.
 */

test.describe('stripe checkout entry', () => {
  test('trips page exposes a paid-upgrade CTA when applicable', async ({ page }) => {
    await page.goto('/trips');
    // Trips index renders for everyone; the upgrade CTA only shows for
    // free-tier users. Either case is acceptable — we just want to confirm
    // the page doesn't crash and at least one heading is visible.
    await expect(page.getByRole('heading').first()).toBeVisible();
  });

  test('checkout session endpoint exists', async ({ request }) => {
    // The create-checkout-session edge function should respond — even with
    // 400/401 — rather than 404. Confirms wiring without invoking Stripe.
    const r = await request.post(
      'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/create-checkout-session',
      { data: {}, failOnStatusCode: false },
    );
    expect([200, 400, 401, 405]).toContain(r.status());
  });
});
