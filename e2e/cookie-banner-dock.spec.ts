import { test, expect } from '@playwright/test';

/**
 * On phones the cookie banner sits above the dock, not over it: the dock
 * publishes --dock-clearance and the banner lifts by it. Checked against the
 * dock's highest point, which is the raised contribute button.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });

test('the cookie banner does not cover the mobile dock', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const banner = page.getByRole('region', { name: 'Cookie settings' });
  const dock = page.getByRole('navigation', { name: 'Navigation' });
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await expect(dock).toBeVisible();

  const { bannerBottom, dockTop } = await page.evaluate(() => {
    const b = document.querySelector('[role="region"][aria-label="Cookie settings"]')!;
    const nav = document.querySelector('nav[aria-label="Navigation"]')!;
    const tops = [nav, ...Array.from(nav.querySelectorAll('button'))].map(
      (el) => el.getBoundingClientRect().top,
    );
    return { bannerBottom: b.getBoundingClientRect().bottom, dockTop: Math.min(...tops) };
  });
  expect(bannerBottom).toBeLessThanOrEqual(dockTop);

  // And the dock stays usable while the banner is up.
  await dock.getByRole('link', { name: /^home\b/i }).click({ trial: true });
});
