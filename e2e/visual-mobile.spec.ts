import { test, expect } from '@playwright/test';

// P2-3 — mobile screenshot baselines. Run via `--project=mobile`.
// On first run, set baselines with `npx playwright test --project=mobile --update-snapshots`.

const ROUTES = ['/', '/venues', '/events', '/news', '/marketplace', '/cities'];

test.describe('Mobile visual regression', () => {
  test.setTimeout(60_000);

  for (const route of ROUTES) {
    test(`${route} mobile screenshot`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForSelector('main', { timeout: 30_000 }).catch(() => {});
      // Allow image-lazy + animation transitions to settle.
      await page.waitForTimeout(800);
      await expect(page).toHaveScreenshot(`${route.replace(/\//g, '_') || '_root'}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.01,
      });
    });
  }
});
