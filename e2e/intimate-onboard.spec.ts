import { test, expect } from '@playwright/test';

// Intimate onboarding gates (email-verification wall removed 2026-06-11).
// An authed user landing on /intimate/onboard goes straight to the stepper's
// 18+ consent step — never the old "Verify your email first" wall. Non-mutating:
// it never checks the consent box or advances the stepper, so no intimate
// profile row is created. The authed test uses the admin storageState from
// auth.setup and skips when E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are unset.

const hasAuth = !!(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);

test.describe('intimate onboarding', () => {
  test('opens on the 18+ consent step, no email-verification wall', async ({ page }) => {
    test.skip(!hasAuth, 'requires E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD');
    await page.goto('/intimate/onboard');
    await expect(page.getByText(/I confirm I am at least 18 years old/i)).toBeVisible();
    await expect(page.getByText(/Verify your email first/i)).toHaveCount(0);
    // Next stays disabled until consent is given — the 18+ gate is load-bearing.
    await expect(page.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  test('anonymous user is asked to sign in, not shown the stepper', async ({ browser }) => {
    const anonContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const anonPage = await anonContext.newPage();
    await anonPage.goto('/intimate/onboard');
    await expect(anonPage.getByText(/sign in to continue/i)).toBeVisible();
    await expect(anonPage.getByText(/Verify your email first/i)).toHaveCount(0);
    await anonContext.close();
  });
});
