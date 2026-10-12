import { test, expect } from '@playwright/test';

// Legacy settings links open the authenticated owner’s contextual editors.
// These checks use the configured admin session and never change a field.

const hasAuth = !!(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);

test.describe('profile settings — contextual editors', () => {
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

  test('legacy Settings opens the owner’s profile editor', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/user\/[^/?#]+\?[^#]*edit=profile/);
    await expect(page.getByRole('region', { name: 'Edit profile', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toHaveCount(0);
  });

  test('legacy Privacy opens its contextual editor without a dialog', async ({ page }) => {
    await page.goto('/settings/privacy');
    await expect(page).toHaveURL(/\/user\/[^/?#]+\?[^#]*edit=privacy/);
    const editor = page.getByRole('region', { name: 'Privacy & visibility', exact: true });
    await expect(editor).toBeVisible();
    await expect(editor.getByText('Pronouns', { exact: true })).toBeVisible();
    await expect(editor.getByText('Location', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await editor.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.has('edit')).toBe(false);
  });

  test('account settings opens the separate private Account tab', async ({ page }) => {
    await page.goto('/settings?section=account');
    await expect(page).toHaveURL(/\/user\/[^/?#]+\/account(?:[?#]|$)/);
    const account = page.getByRole('region', { name: 'Account', exact: true });
    await expect(account).toBeVisible();
    await expect(account.getByRole('heading', { name: 'Username', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Edit profile', exact: true })).toHaveCount(0);
  });

  test('old profile settings links retain their destination and unrelated query', async ({ page }) => {
    await page.goto('/profile/settings?section=privacy&from=legacy#visibility');
    await expect(page.getByRole('region', { name: 'Privacy & visibility', exact: true })).toBeVisible();
    const destination = new URL(page.url());
    expect(destination.searchParams.get('edit')).toBe('privacy');
    expect(destination.searchParams.get('from')).toBe('legacy');
    expect(destination.hash).toBe('#visibility');
  });
});
