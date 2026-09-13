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

/**
 * Pre-existing violations on routes this sweep had never visited.
 *
 * Widening from 8 routes to 39 found 9 routes with serious/critical failures —
 * measured, not assumed: 41 passed, 9 failed on the first CI run. None of them
 * is new. They were simply never scanned, which is the whole reason for
 * widening.
 *
 * The debt is recorded PER ROUTE AND PER RULE rather than by skipping the route,
 * so a route keeps failing on any rule not listed here. This list may only
 * SHRINK — delete an entry when the fix lands; never add one to make CI green.
 *
 * What is actually wrong, so the next person does not have to re-derive it:
 *   - `color-contrast` is overwhelmingly the ad-hoc `hsl(var(--foreground) /
 *     0.55)` inline alpha ramp (74 sites, 13 distinct alphas). At 0.55 on a muted
 *     ground it computes to 3.81:1 against a 4.5:1 requirement. It is lint-legal
 *     by construction — the hex selector needs a digit after `hsl(`, and this
 *     starts with `var`. A real token is the fix.
 *   - `button-name` survives here because `scripts/audit-admin-button-names.mjs`
 *     scans `src/components/admin/**` and `src/pages/admin/**`, and these routes
 *     render components outside both — `/admin/media` is `src/components/cms/
 *     MediaLibrary`. Widening that script's roots is the fix.
 *   - `aria-valid-attr-value` is a dangling aria reference, not a missing label.
 */
const KNOWN_VIOLATIONS: Record<string, readonly string[]> = {
  '/admin/design': ['color-contrast', 'button-name', 'aria-valid-attr-value'],
  '/admin/business': ['color-contrast', 'button-name', 'aria-valid-attr-value'],
  '/admin/audit': ['color-contrast', 'button-name', 'aria-valid-attr-value'],
  '/admin/imports/email-ingestions': ['color-contrast', 'button-name', 'aria-valid-attr-value'],
  '/admin/media': ['color-contrast', 'button-name', 'aria-valid-attr-value'],
  '/admin/affiliate': ['color-contrast', 'button-name', 'aria-valid-attr-value'],
  '/admin/search-intelligence': ['color-contrast', 'button-name', 'aria-valid-attr-value'],
  '/admin/inbox': ['color-contrast', 'button-name', 'aria-valid-attr-value'],
  '/admin/feedback': ['color-contrast', 'button-name', 'aria-valid-attr-value'],
};

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

      const allowed = KNOWN_VIOLATIONS[route] ?? [];
      const blocking = results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .filter((v) => !allowed.includes(v.id));

      expect(
        blocking.map((v) => v.id),
        `${route}: ${JSON.stringify(blocking, null, 2)}`,
      ).toEqual([]);

      // A stale allowlist entry is a silent weakening of this gate, so say so
      // rather than letting it sit. Advisory, not a failure: axe findings depend
      // on the seeded data a route happens to render, so an entry that does not
      // fire on this run may still be real on another.
      const fired = new Set(results.violations.map((v) => v.id));
      const stale = allowed.filter((id) => !fired.has(id));
      if (stale.length) {
        console.warn(
          `::warning::${route} no longer violates ${stale.join(', ')} — drop from KNOWN_VIOLATIONS`,
        );
      }
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
