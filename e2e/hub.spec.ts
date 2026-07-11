import { test, expect, type Page } from '@playwright/test';

/**
 * /hub — the personal office shell (replaces /messages + /me).
 *
 * Anonymous coverage: the legacy-route redirect map (locale + query
 * preserving) and the auth gate. Signed-in coverage (module switching,
 * inbox embed) rides on e2e/messages.spec.ts, which now enters through
 * the /messages redirect.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8080';

const gotoAnon = async (page: Page, path: string) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
};

test.describe('/hub — redirect map (anonymous)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('/messages redirects to /hub/messages preserving the query string', async ({ page }) => {
    await gotoAnon(page, '/messages?conversation=abc123');
    await expect(page).toHaveURL(/\/hub\/messages\?conversation=abc123/);
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

  test('locale-prefixed redirect keeps the locale (/de/messages → /de/hub/messages)', async ({ page }) => {
    await gotoAnon(page, '/de/messages');
    await expect(page).toHaveURL(/\/de\/hub\/messages$/);
  });

  test('/me/travel (identity tab) sends anon to /auth', async ({ page }) => {
    await gotoAnon(page, '/me/travel');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('anonymous /hub shows the auth gate, not the shell', async ({ page }) => {
    await gotoAnon(page, '/hub');
    await expect(
      page.getByText(/sign in to see your messages, plans and saved places/i),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('tab', { name: /^all$/i })).toHaveCount(0);
  });
});
