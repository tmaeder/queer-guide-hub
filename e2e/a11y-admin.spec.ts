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
 * **PRUNED 27 -> 13 entries on 2026-09-19, from CI's own stale-entry warnings
 * rather than from inference.** The warning this file emits was read across FOUR
 * consecutive successful runs on `main` and the stale set was byte-identical every
 * time (same checksum), which is what distinguishes a real fix from the
 * data-dependent flapping this docblock warns about. Every deleted entry is now a
 * hard failure if it returns, which is the correct outcome — the list is
 * shrink-only and a returning violation is a real violation.
 *
 * What is actually wrong in what REMAINS, so the next person does not re-derive it:
 *   - `button-name` is the bulk of it, and **widening
 *     `scripts/audit-admin-button-names.mjs` into `src/components/cms` did NOT
 *     clear it.** That fix named 16 real buttons and took the script to 0/0, yet
 *     8 of these 9 routes still fail the rule — only `/admin/feedback` went quiet.
 *     So the remaining unnamed buttons are NOT in the three trees the script walks.
 *     The likeliest source is a `src/components/ui` primitive rendered without a
 *     name at its call site, which that script deliberately does not report
 *     (it would name the primitive instead of the caller). Finding them needs
 *     axe's own DOM output per route, not another source scan.
 *   - `color-contrast` survives on `/admin/feedback` alone. The `hsl(var(
 *     --foreground) / 0.55)` alpha ramp that caused it on the other eight was
 *     fixed by a token; this route has its own source.
 *   - `aria-valid-attr-value` survives on three routes — a dangling aria
 *     reference, not a missing label.
 */
const KNOWN_VIOLATIONS: Record<string, readonly string[]> = {
  '/admin/design': ['button-name'],
  '/admin/business': ['button-name', 'aria-valid-attr-value'],
  '/admin/audit': ['color-contrast', 'button-name'],
  '/admin/imports/email-ingestions': ['button-name'],
  '/admin/media': ['button-name'],
  '/admin/affiliate': ['button-name', 'aria-valid-attr-value'],
  '/admin/search-intelligence': ['button-name'],
  '/admin/inbox': ['button-name'],
  // `/admin/inbox` now redirects here, so this route renders the same triage
  // DOM and inherits the same debt. Carried across EXPLICITLY rather than left
  // to be rediscovered: this allowlist is keyed by PATH, so a renamed or
  // re-pointed route silently loses its entry and starts hard-failing on
  // pre-existing debt nobody introduced. Shrink-only, as before — when the
  // button-name violations are fixed, delete this line rather than widen it.
  '/admin/governance': ['button-name'],
  '/admin/feedback': ['color-contrast', 'aria-valid-attr-value'],
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
