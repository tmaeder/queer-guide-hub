import { test, expect } from '@playwright/test';
const authenticated = Boolean(
  process.env.E2E_STORAGE_STATE || (process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD),
);
test.describe('unified admin review queue', () => {
  test.skip(!authenticated, 'Requires the configured admin session');
  test('the unfiltered queue renders the full registered source contract', async ({ page }) => {
    const responsePromise = page.waitForResponse(
      (r) =>
        r.url().includes('/rpc/get_admin_review_queue') &&
        r.request().postDataJSON()?.p_scope === 'all',
    );
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Review queue', exact: true })).toBeVisible();
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data.sources.length).toBeGreaterThan(17);
    expect(data.sources.reduce((sum: number, s: { count: number }) => sum + s.count, 0)).toBe(
      data.all_total,
    );
    expect(data.total).toBe(data.all_total);
    await expect(page.getByText('The review queue could not be loaded')).toHaveCount(0);
    if (data.total > 0) {
      await expect(
        page
          .getByRole('region', { name: 'Pending decisions' })
          .locator('button[aria-label^="Open "]')
          .first(),
      ).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Review queue pages' })).toBeInViewport();
      await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeInViewport();
      expect(
        await page.evaluate(() => document.documentElement.scrollHeight - innerHeight),
        'The queue scrolls its panes instead of stretching the page below the decision controls',
      ).toBeLessThanOrEqual(1);
    } else await expect(page.getByText('All caught up')).toBeVisible();
  });
  test('overdue is a row predicate with matching counts', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Review queue', exact: true })).toBeVisible();
    const responsePromise = page.waitForResponse(
      (r) =>
        r.url().includes('/rpc/get_admin_review_queue') &&
        r.request().postDataJSON()?.p_scope === 'overdue',
    );
    await page.getByRole('button', { name: /^Overdue/ }).click();
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data.total).toBe(data.overdue_total);
    expect(data.items.every((x: { overdue: boolean }) => x.overdue)).toBe(true);
  });
  test('legacy governance URLs resolve to the same queue', async ({ page }) => {
    for (const url of [
      '/admin/inbox',
      '/admin/governance?mode=engines',
      '/admin/governance?mode=tags',
    ]) {
      await page.goto(url);
      await expect(page.getByRole('heading', { name: 'Review queue', exact: true })).toBeVisible();
      await expect(page).toHaveURL(/\/admin(?:\?|$)/);
      await expect(page.getByRole('navigation', { name: 'Governance mode' })).toHaveCount(0);
    }
  });
});
