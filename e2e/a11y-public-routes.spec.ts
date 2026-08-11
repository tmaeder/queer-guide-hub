import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitForAppReady } from './support/appReady';

// Route transitions fade opacity 0->1 (LayoutShell motion.div). axe blends that
// opacity into computed text color, flagging transient mid-fade frames as contrast
// failures. Emulate reduced motion (LayoutShell skips the fade) so axe analyzes the
// settled DOM - the same render real reduced-motion users get.
test.use({ reducedMotion: 'reduce' });

// P2-2 — axe-playwright sweep across major public routes.
// /events and /admin already have their own a11y specs.

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// `/personalities` earns its place the hard way: it shipped with NO `<h1>` at
// all for the length of the subway rebrand — its masthead was nested inside a
// `<BackgroundDots>` that had been gutted to `return null` and declares no
// `children` prop, so React dropped the heading, the result count and the
// Add-Personality button. Nothing caught it because this sweep did not cover
// the route. `/people` is its sibling surface.
const ROUTES = [
  '/',
  '/venues',
  '/news',
  '/marketplace',
  '/cities',
  '/personalities',
  '/people',
];

test.describe('Public routes — automated a11y', () => {
  test.setTimeout(120_000);

  for (const route of ROUTES) {
    test(`${route} has no serious/critical axe violations`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForSelector('main', { timeout: 30_000 }).catch(() => {});
      // axe reads *computed* colors, so the theme's custom properties must have
      // resolved before it samples — see waitForAppReady for why this is not
      // 'networkidle'.
      await waitForAppReady(page);

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
});
