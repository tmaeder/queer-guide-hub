import { test, expect } from '@playwright/test';

// P2-3 — mobile screenshot baselines. Run via `--project=mobile`.
// First-time setup or regen:
//   E2E_BASE_URL=https://queer.guide npx playwright test --project=mobile --update-snapshots
//
// Baselines are captured against production so they reflect real content
// + theme. The dev server (localhost) shows a near-empty SPA shell because
// Supabase blocks CORS from localhost — useless for visual baselines.

const ROUTES = ['/', '/venues', '/events', '/news', '/marketplace', '/cities'];

// Every route here is data-driven, so its TOTAL page height changes with live
// content between baseline capture and run. `fullPage` screenshots then fail on
// a dimension mismatch *before* maxDiffPixelRatio even applies (e.g. marketplace
// 8664px baseline vs 9210px actual). Capture a dimension-stable above-the-fold
// viewport crop (fullPage:false) instead; the pixel threshold absorbs the
// remaining within-viewport rotation. Genuinely static pages (none on mobile)
// would keep fullPage via STATIC_ROUTES.
const STATIC_ROUTES = new Set<string>();

test.describe('Mobile visual regression', () => {
  test.setTimeout(60_000);

  for (const route of ROUTES) {
    test(`${route} mobile screenshot`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForSelector('main', { timeout: 30_000 }).catch(() => {});
      // Allow image-lazy + animation transitions to settle.
      await page.waitForTimeout(1500);
      const isStatic = STATIC_ROUTES.has(route);
      // The homepage hero + / and /venues featured rails rotate hard between
      // requests (observed ~0.35 above-the-fold diff on / within 15 min of
      // baseline capture), so those two need a loose gate that still catches a
      // gross layout break.
      const HIGH_ROTATION = new Set(['/', '/venues']);
      const threshold = HIGH_ROTATION.has(route) ? 0.5 : isStatic ? 0.02 : 0.15;
      await expect(page).toHaveScreenshot(`${route.replace(/\//g, '_') || '_root'}.png`, {
        fullPage: isStatic,
        maxDiffPixelRatio: threshold,
        animations: 'disabled',
      });
    });
  }
});
