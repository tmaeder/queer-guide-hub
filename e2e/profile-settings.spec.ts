import { test, expect } from '@playwright/test';

// /settings is the single home for preferences; legacy links land on a section.
// These checks use the configured admin session and never change a field.

const hasAuth = !!(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);

test.describe('settings page', () => {
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

  test('/settings lists every section and opens Profile', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Settings sections' });
    await expect(nav.getByRole('link')).toHaveCount(9);
    await expect(page.getByRole('region', { name: 'Profile', exact: true })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('/settings/privacy is the settings section, not the privacy policy', async ({ page }) => {
    await page.goto('/settings/privacy');
    const editor = page.getByRole('region', { name: 'Privacy & visibility', exact: true });
    await expect(editor).toBeVisible({ timeout: 20_000 });
    await expect(editor.getByText('Pronouns', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('legacy account links open Sign-in & security', async ({ page }) => {
    await page.goto('/settings?section=account');
    await expect(page).toHaveURL(/\/settings\/security(?:[?#]|$)/);
    const region = page.getByRole('region', { name: 'Sign-in & security', exact: true });
    await expect(region).toBeVisible({ timeout: 20_000 });
    await expect(region.getByRole('heading', { name: 'Username', exact: true })).toBeVisible();
  });

  test('old profile settings links keep their section, query and fragment', async ({ page }) => {
    await page.goto('/profile/settings?section=privacy&from=legacy#visibility');
    await expect(
      page.getByRole('region', { name: 'Privacy & visibility', exact: true }),
    ).toBeVisible({
      timeout: 20_000,
    });
    const destination = new URL(page.url());
    expect(destination.pathname).toBe('/settings/privacy');
    expect(destination.searchParams.get('from')).toBe('legacy');
    expect(destination.hash).toBe('#visibility');
  });

  test('mobile /settings is a section list; a section has a way back', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/settings');
    await page
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('link', { name: /Notifications/ })
      .click();
    await expect(page).toHaveURL(/\/settings\/notifications$/);
    await expect(page.getByRole('region', { name: 'Notifications', exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('link', { name: 'All settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
  });
  test('privacy has one adult-content switch and a cookies-only card', async ({ page }) => {
    await page.goto('/settings/privacy');
    const editor = page.getByRole('region', { name: 'Privacy & visibility', exact: true });
    await expect(editor).toBeVisible({ timeout: 20_000 });
    // Positive control: the merged switch and the trimmed card are both there.
    await expect(editor.getByRole('switch', { name: 'Show adult content' })).toHaveCount(1);
    await expect(editor.getByText('Cookies & analytics', { exact: true })).toBeVisible();
    await expect(editor.getByText('Content & cookies', { exact: true })).toHaveCount(0);
    await expect(editor.getByText('Privacy Settings', { exact: true })).toHaveCount(0);
  });

  test('profile sets pronouns only; their visibility lives under Privacy', async ({ page }) => {
    await page.goto('/settings/profile');
    const editor = page.getByRole('region', { name: 'Profile', exact: true });
    await expect(editor).toBeVisible({ timeout: 20_000 });
    await expect(editor.getByText('Who sees them is set under Privacy.').first()).toBeVisible();
    await expect(editor.locator('#pronouns-visibility')).toHaveCount(0);
  });

  test('pride flags are one sliding row on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/settings/identity');
    const flags = page.getByRole('group', { name: 'Pride flags' });
    await expect(flags).toBeVisible({ timeout: 20_000 });
    const box = await flags.evaluate((el) => ({
      overflows: el.scrollWidth > el.clientWidth,
      rows: new Set([...el.children].map((c) => (c as HTMLElement).offsetTop)).size,
    }));
    expect(box.rows).toBe(1);
    expect(box.overflows).toBe(true);
  });
});
