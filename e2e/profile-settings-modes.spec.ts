import { test, expect } from '@playwright/test';

// Mode-driven settings IA (2026-06-06 profile rethink). Verifies the lean core
// tabs render for an authed user and that the Dating section is gated — it shows
// EITHER the full dating depth (dating mode on) OR the "Dating is off" opt-in
// panel, never raw relationship fields to a non-dating user. Non-mutating: it
// never flips user_mode. Uses the admin storageState from auth.setup; skips when
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

  test('Dating section is gated (depth or opt-in, never raw)', async ({ page }) => {
    await page.goto('/profile/settings');
    await page.getByRole('tab', { name: 'Dating' }).click();
    // Either dating mode is on (LGBTQ+ Identity depth) or off (opt-in panel).
    const datingOn = page.getByText(/LGBTQ\+ Identity/i);
    const datingOff = page.getByText(/Dating is off/i);
    await expect(datingOn.or(datingOff)).toBeVisible();
  });
});
