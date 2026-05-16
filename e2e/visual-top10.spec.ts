import { test, expect } from '@playwright/test';

/**
 * Phase 5 — desktop visual regression for the top-10 pages.
 *
 * Run/regen baselines:
 *   E2E_BASE_URL=https://queer.guide npx playwright test e2e/visual-top10.spec.ts --update-snapshots
 *
 * Baselines stored next to spec in visual-top10.spec.ts-snapshots/.
 * Loose pixel threshold (3%) to absorb prod content rotation; tighter
 * thresholds are owned by per-feature visual specs.
 *
 * "Top 10" selected by traffic + business value, not strict analytics:
 *   /, /venues, /events, /news, /marketplace, /cities, /trips, /personalities,
 *   /resources, /help
 */

const ROUTES = [
  '/',
  '/venues',
  '/events',
  '/news',
  '/marketplace',
  '/cities',
  '/trips',
  '/personalities',
  '/resources',
  '/help',
];

// Live-content pages: looser threshold to avoid flake from rotation.
const LIVE = new Set(['/news', '/events', '/marketplace']);

test.describe('Top-10 desktop visual baselines', () => {
  test.setTimeout(60_000);

  for (const route of ROUTES) {
    test(`${route} desktop screenshot`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForSelector('main', { timeout: 30_000 }).catch(() => {});
      // Dismiss cookie banner if present
      await page
        .getByRole('button', { name: /accept all|necessary only/i })
        .first()
        .click({ timeout: 2000 })
        .catch(() => {});
      // Let lazy images settle.
      await page.waitForTimeout(1500);
      await expect(page).toHaveScreenshot(`${route.replace(/\//g, '_') || '_root'}-desktop.png`, {
        fullPage: true,
        maxDiffPixelRatio: LIVE.has(route) ? 0.15 : 0.03,
        animations: 'disabled',
      });
    });
  }
});
