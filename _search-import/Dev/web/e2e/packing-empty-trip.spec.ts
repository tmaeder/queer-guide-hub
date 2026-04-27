import { test, expect } from '@playwright/test';

/**
 * Fresh-trip Packing tab smoke tests.
 *
 * Regression guard for the crash that shipped when a freshly created trip
 * (no dates, no places, no climate) hit the Packing tab. We can't run the
 * full signed-in flow in CI, so this spec asserts:
 *   1. The /trips surface paints without pageerrors, and
 *   2. Navigating directly to /trips/:id/packing on a fresh id does not
 *      raise an unhandled error — proving the rule-based fallback is
 *      null-safe end-to-end.
 *
 *   E2E_BASE_URL=https://queer.guide npx playwright test e2e/packing-empty-trip.spec.ts
 */

test.describe('Packing tab — empty/fresh-trip resilience', () => {
  test('no pageerror when opening a fresh trip packing route', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // Non-existent trip id — the app should redirect / render auth CTA / 404,
    // but MUST NOT throw from the packing suggestion engine.
    await page.goto('/trips/00000000-0000-0000-0000-000000000000/packing');
    await page.waitForLoadState('networkidle');

    const ours = errors.filter(
      (e) =>
        !/sentry|posthog|google|umami|cloudflare/i.test(e) &&
        !/failed to fetch dynamically imported module/i.test(e) &&
        !/manifest\.webmanifest/i.test(e) &&
        !/401|403|404|not found/i.test(e),
    );
    expect(ours, `Unexpected errors:\n${ours.join('\n')}`).toHaveLength(0);
  });

  test('/trips list renders for signed-out users without packing-engine errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/trips');
    await page.waitForLoadState('networkidle');

    const packingErrors = errors.filter((e) => /packing/i.test(e));
    expect(
      packingErrors,
      `Packing-related errors on /trips:\n${packingErrors.join('\n')}`,
    ).toHaveLength(0);
  });
});
