import { test, expect, type Page } from '@playwright/test';

/**
 * /hub — the personal office shell (replaces /me). The inbox lives on its
 * own page at /messages (2026-11-22); /hub/messages redirects there.
 *
 * Anonymous coverage: the legacy-route redirect map (locale + query
 * preserving) and the auth gate. Signed-in inbox coverage is
 * e2e/messages.spec.ts.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8080';

const gotoAnon = async (page: Page, path: string) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
};

test.describe('/hub — redirect map (anonymous)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('/hub/messages redirects to /messages preserving the query string', async ({ page }) => {
    await gotoAnon(page, '/hub/messages?conversation=abc123');
    await expect(page).toHaveURL(/\/messages\?conversation=abc123/);
    await expect(page).not.toHaveURL(/\/hub\//);
  });

  test('/me redirects to /hub', async ({ page }) => {
    await gotoAnon(page, '/me');
    await expect(page).toHaveURL(/\/hub$/);
  });

  test('/me/saved and /favorites land on /hub/saved', async ({ page }) => {
    await gotoAnon(page, '/me/saved');
    await expect(page).toHaveURL(/\/hub\/saved$/);
    await gotoAnon(page, '/favorites');
    await expect(page).toHaveURL(/\/hub\/saved$/);
  });

  test('/trips and /me/trips land on /hub/plans (query preserved)', async ({ page }) => {
    await gotoAnon(page, '/me/trips?cityId=xyz');
    await expect(page).toHaveURL(/\/hub\/plans\?cityId=xyz/);
    await gotoAnon(page, '/trips');
    await expect(page).toHaveURL(/\/hub\/plans$/);
  });

  test('locale-prefixed redirect keeps the locale (/de/hub/messages → /de/messages)', async ({
    page,
  }) => {
    await gotoAnon(page, '/de/hub/messages');
    await expect(page).toHaveURL(/\/de\/messages$/);
  });

  test('/me/travel (identity tab) sends anon to /auth', async ({ page }) => {
    await gotoAnon(page, '/me/travel');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('anonymous /hub shows the auth gate, not the shell', async ({ page }) => {
    await gotoAnon(page, '/hub');
    await expect(
      page.getByText(/sign in to see your plans and saved places/i),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('tab', { name: /^all$/i })).toHaveCount(0);
  });
});
