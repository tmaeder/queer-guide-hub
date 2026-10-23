import { test, expect } from '@playwright/test';
import { dismissCookieBanner } from './support/consentBanner';
const authenticated = Boolean(
  process.env.E2E_STORAGE_STATE || (process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD),
);
test.describe('Review queue on mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.skip(!authenticated, 'Requires the configured admin session');
  test('fits the screen and focuses the selected decision', async ({ page }) => {
    await page.goto('/admin');
    // First visit on a fresh context: the fixed consent banner sits over the
    // first worklist row at 390px and intercepts the tap.
    await dismissCookieBanner(page);
    await expect(page.getByRole('heading', { name: 'Review queue', exact: true })).toBeVisible();
    const rows = page
      .getByRole('region', { name: 'Review worklist' })
      .locator('button[aria-label^="Open "]');
    await expect(rows.first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await rows.first().click();
    await expect(page.getByRole('region', { name: 'Review worklist' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Review type' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /Back to queue/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Skip/ })).toBeVisible();
  });
});
