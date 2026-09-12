import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { REDUCED_MOTION } from './support/reducedMotion';
import { ADMIN_ARCHETYPES } from '../src/config/adminArchetypes';

// Route transitions fade opacity 0->1 (LayoutShell motion.div). axe blends that
// opacity into computed text color, flagging transient mid-fade frames as contrast
// failures. Emulate reduced motion (LayoutShell skips the fade) so axe analyzes the
// settled DOM - the same render real reduced-motion users get.
test.use(REDUCED_MOTION);

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Every non-parameterised admin route, derived from the archetype registry.
 *
 * This used to be a hand-written list of 8 of the 41 routes, and two of those 8
 * were wrong: `/admin/content/news` and `/admin/content/marketplace` are not
 * registry keys (they are `news_articles` and `marketplace_listings`), and
 * `content/:type` does not 404 on an unknown key — `useContentListController`
 * falls through to `loadAllTypes()`. So both silently rendered the "All Content"
 * list and the scan passed having never visited either page. Effective coverage
 * was 6 of 41.
 *
 * Deriving from `ADMIN_ARCHETYPES` — the same source `admin-route-baseline.spec.ts`
 * walks — means a new admin route is scanned the day it is registered instead of
 * whenever someone remembers to extend an array. The content routes are added on
 * top because the registry describes `content/:type` as one parameterised entry.
 */
const ARCHETYPE_ROUTES = ADMIN_ARCHETYPES.filter(
  (e) => !e.path.includes(':') && e.path !== '*' && e.path !== 'review',
).map((e) => (e.path === '(index)' ? '/admin' : `/admin/${e.path}`));

/** Representative registry keys — the wildcard route needs concrete ones. */
const CONTENT_ROUTES = [
  '/admin/content/events',
  '/admin/content/venues',
  '/admin/content/news_articles',
  '/admin/content/marketplace_listings',
];

const ADMIN_ROUTES = [...new Set([...ARCHETYPE_ROUTES, ...CONTENT_ROUTES])];

test.describe('Admin shell — automated a11y', () => {
  test.setTimeout(180_000);

  test('covers the whole registry, not a hand-picked subset', () => {
    // A derivation that silently returned 2 routes would make every assertion
    // below pass while scanning almost nothing.
    expect(ADMIN_ROUTES.length).toBeGreaterThanOrEqual(30);
    expect(ADMIN_ROUTES).toContain('/admin');
    expect(ADMIN_ROUTES).toContain('/admin/content/news_articles');
  });

  for (const route of ADMIN_ROUTES) {
    test(`${route} has no serious/critical axe violations`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle').catch(() => {});
      if (!new URL(page.url()).pathname.startsWith('/admin')) {
        test.skip(
          true,
          'Admin requires auth; provide E2E_STORAGE_STATE pointing at a signed-in session.',
        );
        return;
      }
      await page
        .waitForSelector('main, [role="main"], #admin-main-content', { timeout: 30_000 })
        .catch(() => {});

      const results = await new AxeBuilder({ page })
        .exclude('footer')
        .disableRules(['link-in-text-block'])
        .withTags(WCAG_TAGS)
        .analyze();

      const blocking = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    });
  }

  test('admin shell exposes a skip link to main content', async ({ page }) => {
    await page.goto('/admin');
    // networkidle, not domcontentloaded — AdminRouteGuard redirects unauthenticated
    // sessions away via a useEffect that fires after DOMContentLoaded.
    await page.waitForLoadState('networkidle').catch(() => {});
    if (!new URL(page.url()).pathname.startsWith('/admin')) {
      test.skip(true, 'Admin requires auth; run with a signed-in session to assert skip link.');
      return;
    }
    const skip = page.getByRole('link', { name: /skip to admin content/i });
    await expect(skip).toHaveCount(1);
  });
});
