import { test, expect } from '@playwright/test';

// The /user + /settings information architecture against a real deployment.
// Read-only: the one write (About me) is restored before the test ends.

const hasAuth = !!(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);
/** A public member who is not the signed-in test account. */
const OTHER_USER = process.env.E2E_OTHER_USER_ID || '8ffdf1d4-78a8-4050-bc72-b600ec36c325';

const seedConsent = () => {
  try {
    localStorage.setItem(
      'queer-guide-cookie-consent',
      JSON.stringify({
        preferences: { necessary: true, functional: true, analytics: false, marketing: false },
        version: '1.0',
        timestamp: new Date(0).toISOString(),
      }),
    );
    localStorage.setItem('i18nextLng', 'en');
  } catch {
    /* storage unavailable */
  }
};

test.describe('user section — edge', () => {
  // Every direct load of /user/<id> was an edge hard-404 until the optional
  // :tab? segment compiled correctly. A profile with no tab is the case to pin.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a profile URL with no tab is served, not hard-404d', async ({ request }) => {
    for (const path of [`/user/${OTHER_USER}`, `/user/${OTHER_USER}/`, `/user/${OTHER_USER}/travel`]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(200);
    }
    // Positive control: the edge still 404s a path no route renders.
    const miss = await request.get(`/user/${OTHER_USER}/travel/extra`, { maxRedirects: 0 });
    expect(miss.status()).toBe(404);
  });

  test('settings sections are known app routes', async ({ request }) => {
    for (const path of ['/settings', '/settings/privacy', '/settings/notifications', '/settings/body']) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(200);
    }
  });

  // Profiles are members-only: get_public_profile_safe is not granted to anon
  // (20261021174528), so a signed-out visitor is asked to sign in, not told the
  // profile is missing.
  test('a signed-out visitor is asked to sign in and sees no owner controls', async ({ page }) => {
    await page.addInitScript(seedConsent);
    await page.goto(`/user/${OTHER_USER}`);
    await expect(page.getByRole('heading', { name: 'Sign in to view this profile' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('Profile not found')).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      /\/auth\?redirect=%2Fuser%2F/,
    );
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Edit profile' })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'View profile as' })).toHaveCount(0);
  });
});

test.describe('user section — signed in', () => {
  test.skip(!hasAuth, 'requires E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(seedConsent);
  });

  test('own profile: identity tabs, one edit, settings shortcut', async ({ page }) => {
    await page.goto('/me/contributions');
    await expect(page).toHaveURL(/\/user\/[0-9a-f-]+\/activity$/, { timeout: 20_000 });
    await expect(page.getByRole('tab')).toHaveText(['Overview', 'Posts', 'Travel', 'Activity']);
    await expect(page.getByRole('link', { name: 'Edit profile' })).toHaveAttribute(
      'href',
      /\/settings\/profile$/,
    );
    await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: 'View profile as' })).toBeVisible();
  });

  test('retired profile tabs land in their new homes', async ({ page }) => {
    await page.goto('/me/contributions');
    await expect(page).toHaveURL(/\/user\/[0-9a-f-]+\/activity$/, { timeout: 20_000 });
    const base = new URL(page.url()).pathname.replace(/\/activity$/, '');
    await page.goto(`${base}/account`);
    await expect(page).toHaveURL(/\/settings\/security$/);
    await page.goto(`${base}/progress`);
    await expect(page).toHaveURL(/\/hub\/progress$/);
    await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
    await page.goto(`${base}/groups`);
    await expect(page).toHaveURL(/\/activity$/);
  });

  test('a signed-in visitor can open the report dialog', async ({ page }) => {
    await page.goto(`/user/${OTHER_USER}`);
    await page.getByRole('button', { name: 'Report profile' }).click({ timeout: 20_000 });
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('switching settings sections saves a pending edit first', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/settings/profile');
    const bio = page.getByRole('textbox', { name: 'About me' });
    await expect(bio).toBeVisible({ timeout: 20_000 });
    const original = await bio.inputValue();
    const marker = `${original} e2e-${Date.now()}`.trim();
    try {
      await bio.fill(marker);
      // Leave before the 3s autosave debounce fires.
      await page
        .getByRole('navigation', { name: 'Settings sections' })
        .getByRole('link', { name: /Privacy/ })
        .click();
      await expect(page).toHaveURL(/\/settings\/privacy$/);
      await page.goto('/settings/profile');
      await expect(page.getByRole('textbox', { name: 'About me' })).toHaveValue(marker, {
        timeout: 20_000,
      });
    } finally {
      const field = page.getByRole('textbox', { name: 'About me' });
      await field.fill(original);
      await page
        .getByRole('navigation', { name: 'Settings sections' })
        .getByRole('link', { name: /Privacy/ })
        .click();
      await expect(page).toHaveURL(/\/settings\/privacy$/);
    }
  });
});
