import { test, expect } from '@playwright/test';

// P2-3 — mobile screenshot baselines. Run via `--project=mobile`.
// First-time setup or regen:
//   E2E_BASE_URL=https://queer.guide npx playwright test --project=mobile --update-snapshots
//
// Baselines are captured against production so they reflect real content
// + theme. The dev server (localhost) shows a near-empty SPA shell because
// Supabase blocks CORS from localhost — useless for visual baselines.

const ROUTES = ['/', '/venues', '/events', '/news', '/marketplace', '/cities'];

// Routes with live tickers / changing content need looser pixel thresholds.
const LIVE_CONTENT_ROUTES = new Set(['/news']);

test.describe('Mobile visual regression', () => {
  test.setTimeout(60_000);

  for (const route of ROUTES) {
    test(`${route} mobile screenshot`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForSelector('main', { timeout: 30_000 }).catch(() => {});
      // Allow image-lazy + animation transitions to settle.
      await page.waitForTimeout(1500);
      await expect(page).toHaveScreenshot(`${route.replace(/\//g, '_') || '_root'}.png`, {
        fullPage: true,
        maxDiffPixelRatio: LIVE_CONTENT_ROUTES.has(route) ? 0.15 : 0.02,
        animations: 'disabled',
      });
    });
  }
});
