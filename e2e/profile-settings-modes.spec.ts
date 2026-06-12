import { test, expect } from '@playwright/test';

// Settings IA (2026-06-06 profile rethink; dating gate removed 2026-06-11).
// Verifies the lean core tabs render for an authed user and that the Dating
// section shows its full depth for every user — the old user_mode gate and
// "Dating is off" opt-in panel are gone. Non-mutating: it never saves a field.
// Uses the admin storageState from auth.setup; skips when
// E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are unset.

const hasAuth = !!(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);

test.describe('profile settings — mode-driven IA', () => {
  test.skip(!hasAuth, 'requires E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD');

  test('renders the lean core tabs', async ({ page }) => {
    await page.goto('/profile/settings');
    for (const name of ['You', 'Preferences', 'Privacy', 'Account', 'Dating']) {
      await expect(page.getByRole('tab', { name })).toBeVisible();
    }
  });

  test('Preferences leads with the personalization signal', async ({ page }) => {
    await page.goto('/profile/settings');
    await page.getByRole('tab', { name: 'Preferences' }).click();
    await expect(page.getByText(/Personalize your search/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Set your vibes/i })).toBeVisible();
  });

  test('Dating section shows full depth for every user (no mode gate)', async ({ page }) => {
    await page.goto('/profile/settings');
    await page.getByRole('tab', { name: 'Dating' }).click();
    await expect(page.getByText(/LGBTQ\+ Identity/i)).toBeVisible();
    await expect(page.getByText(/Romance & Connection/i)).toBeVisible();
    await expect(page.getByText(/Intimate profile/i)).toBeVisible();
    await expect(page.getByText(/Dating is off/i)).toHaveCount(0);
  });
});
