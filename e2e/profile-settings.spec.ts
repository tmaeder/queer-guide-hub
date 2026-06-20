import { test, expect } from '@playwright/test';

// Settings IA: inline accordion at /settings (2026-06-20). The page is a single
// scroll of glanceable summary cards; tapping one EXPANDS its editor inline on the
// page (a Collapsible), not in a bottom Sheet/dialog. Single-open: opening another
// section collapses the previous one. The old tabbed /profile/settings IA is gone
// (/profile/settings redirects). Non-mutating: never saves a field. Uses the admin
// storageState from auth.setup; skips when E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are unset.

const hasAuth = !!(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);

test.describe('profile settings — inline accordion', () => {
  test.skip(!hasAuth, 'requires E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD');

  // Pre-seed cookie consent so the fixed banner never intercepts card clicks.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          'queer-guide-cookie-consent',
          JSON.stringify({
            preferences: { necessary: true, functional: true, analytics: true, marketing: true },
            version: '1.0',
            timestamp: new Date(0).toISOString(),
          }),
        );
      } catch {
        /* storage unavailable */
      }
    });
  });

  test('renders the settings hub with accordion section headers', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    for (const title of ['Profile', 'Privacy & visibility', 'Travel preferences', 'Account']) {
      await expect(page.getByRole('button', { name: new RegExp(title, 'i') })).toBeVisible();
    }
    // Nothing is expanded on load — collapsed Collapsible content is unmounted.
    await expect(page.locator('#settings-section-privacy')).not.toContainText('Privacy Settings');
  });

  test('tapping Privacy expands its editor inline — no pop-over dialog', async ({ page }) => {
    await page.goto('/settings');
    const trigger = page.getByRole('button', { name: /Privacy & visibility/i });
    await trigger.click();

    // The editor appears inline inside the section container, not in a dialog.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const section = page.locator('#settings-section-privacy');
    await expect(section).toContainText('Privacy Settings');
    await expect(section.getByText('Pronouns', { exact: true })).toBeVisible();
    await expect(section.getByText('Location', { exact: true })).toBeVisible();
  });

  test('single-open: expanding Profile collapses Privacy', async ({ page }) => {
    await page.goto('/settings?section=privacy');
    await expect(page.locator('#settings-section-privacy')).toContainText('Privacy Settings');

    await page.getByRole('button', { name: /^Profile/i }).click();
    // Profile content is now in view… (Occupation/Date of Birth are unique to it)
    await expect(page.locator('#settings-section-profile')).toContainText(/Occupation|Date of Birth/i);
    // …and Privacy has collapsed (its content unmounted).
    await expect(page.locator('#settings-section-privacy')).not.toContainText('Privacy Settings');
  });

  test('?section= deep link expands the matching section inline', async ({ page }) => {
    await page.goto('/settings?section=privacy');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#settings-section-privacy')).toContainText('Privacy Settings');
  });
});
