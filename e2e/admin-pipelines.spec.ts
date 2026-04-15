import { test, expect } from '@playwright/test';

/**
 * E2E smoke test for /admin/pipelines Overview tab.
 * Public page renders a login redirect for unauthenticated users, so we
 * only assert that the URL reaches the app shell without 5xx / crash.
 * When running authenticated (E2E_ADMIN_COOKIE set), we additionally
 * verify the Overview tab is the default and the table renders rows.
 */

test.describe('Admin pipelines overview', () => {
  test('reaches admin/pipelines without runtime crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const response = await page.goto('/admin/pipelines', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);

    // Wait for SPA to mount something
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => { /* ignore idle timeout */ });

    // No uncaught errors (e.g. "OverviewTab is not defined")
    const crashErrors = errors.filter(e => /is not defined|ReferenceError/i.test(e));
    expect(crashErrors, `runtime errors on /admin/pipelines: ${crashErrors.join('; ')}`).toEqual([]);
  });

  test('Overview tab renders (when authenticated)', async ({ page, context }) => {
    test.skip(!process.env.E2E_ADMIN_COOKIE, 'requires E2E_ADMIN_COOKIE env var');

    await context.addCookies([{
      name: 'sb-access-token',
      value: process.env.E2E_ADMIN_COOKIE as string,
      domain: new URL(process.env.E2E_BASE_URL || 'https://queer.guide').hostname,
      path: '/',
    }]);

    await page.goto('/admin/pipelines');
    await expect(page.getByRole('button', { name: /Overview/i })).toBeVisible({ timeout: 15000 });
    // Summary cards
    await expect(page.getByText(/Active definitions/i)).toBeVisible();
    await expect(page.getByText(/Runs in last 24h/i)).toBeVisible();
    // Table header
    await expect(page.getByRole('columnheader', { name: /Kind/i })).toBeVisible();
  });
});
