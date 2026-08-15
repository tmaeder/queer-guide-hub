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
 *   /tags, /help
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
  '/tags',
  '/help',
];

// Data-driven pages change TOTAL height with live content between baseline and
// run, so `fullPage` fails on a dimension mismatch before maxDiffPixelRatio
// applies (e.g. personalities 3931px baseline vs 3788px actual). Capture a
// dimension-stable above-the-fold viewport crop for those; keep fullPage only
// for genuinely static pages.
//
// /help left this set 2026-07-31: its full height rounds between 2874px and
// 2875px run to run (fractional line-box height, not a content change), and a
// 1px dimension mismatch fails BEFORE maxDiffPixelRatio applies — it broke the
// nightly every run from 07-27 on. A viewport crop is dimension-stable, so the
// page is still guarded above the fold instead of being flaky-red below it.
const STATIC_ROUTES = new Set(['/trips']);

// "The page has actually rendered", per route.
//
// Waiting for `main` + a fixed 1.5s is not a content signal on a page that
// fetches before it renders anything. /tags loads the whole ~3,700-term corpus
// behind a loader, so BOTH the pre-rebuild baseline (skeleton cards) and the
// first post-rebuild regeneration (a TrackLoader spinner over the footer) were
// pictures of a loading state — the route has never once been visually guarded,
// and the test would flip between loader and content with network speed.
//
// A route listed here waits for its own content instead. Same idea as
// design-system.spec.ts waiting on [data-testid=map-bar] for /map.
const READY_SELECTOR: Record<string, string> = {
  // The filter spine only mounts once the corpus has resolved.
  '/tags': 'input[type="search"]',
};

test.describe('Top-10 desktop visual baselines', () => {
  test.setTimeout(60_000);

  for (const route of ROUTES) {
    test(`${route} desktop screenshot`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForSelector('main', { timeout: 30_000 }).catch(() => {});
      const ready = READY_SELECTOR[route];
      if (ready) await page.waitForSelector(ready, { timeout: 30_000 });
      // Dismiss cookie banner if present
      await page
        .getByRole('button', { name: /accept all|necessary only/i })
        .first()
        .click({ timeout: 2000 })
        .catch(() => {});
      // Let lazy images settle.
      await page.waitForTimeout(1500);
      const isStatic = STATIC_ROUTES.has(route);
      // The homepage hero + / and /venues featured rails rotate hard between
      // requests (observed ~0.31–0.34 above-the-fold diff on / within 15 min of
      // baseline capture), so those need a loose gate that still catches a gross
      // layout break. /news is the live news feed — the hourly pipeline rotates
      // its cards past the 0.15 gate within hours of a baseline regen — so it
      // belongs in the same bucket.
      // /personalities joined the bucket 2026-07: daily person-db imports
      // rotate the born-this-week / featured rails past the 0.15 gate.
      const HIGH_ROTATION = new Set(['/', '/venues', '/news', '/personalities']);
      const threshold = HIGH_ROTATION.has(route) ? 0.5 : isStatic ? 0.03 : 0.15;
      await expect(page).toHaveScreenshot(`${route.replace(/\//g, '_') || '_root'}-desktop.png`, {
        fullPage: isStatic,
        maxDiffPixelRatio: threshold,
        animations: 'disabled',
      });
    });
  }
});
