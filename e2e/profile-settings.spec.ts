import { test, expect } from '@playwright/test';

// Settings IA: hub-and-sheets at /settings (redesign 2026-06-11/12). The page is
// a single scroll of glanceable SummaryCards; tapping one opens a bottom Sheet
// (role="dialog") with the focused editor. The old tabbed /profile/settings IA
// (You/Preferences/Privacy/Account/Dating) is gone — /profile/settings now redirects.
// Non-mutating: never saves a field. Uses the admin storageState from auth.setup;
// skips when E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are unset.

const hasAuth = !!(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);

test.describe('profile settings — hub and sheets', () => {
  test.skip(!hasAuth, 'requires E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD');

  test('renders the settings hub with summary cards', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    for (const title of ['Profile', 'Privacy & visibility', 'Travel preferences', 'Account']) {
      await expect(page.getByRole('button', { name: new RegExp(title, 'i') })).toBeVisible();
    }
  });

  test('opening the Privacy card reveals the field-visibility controls', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /Privacy & visibility/i }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Privacy Settings')).toBeVisible();
    // The reconciled per-field visibility rows (pronouns/location were previously
    // ungoverned by any UI control).
    await expect(sheet.getByText('Pronouns', { exact: true })).toBeVisible();
    await expect(sheet.getByText('Location', { exact: true })).toBeVisible();
  });

  test('?section= deep link opens the matching sheet directly', async ({ page }) => {
    await page.goto('/settings?section=privacy');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByText('Privacy Settings')).toBeVisible();
  });
});
