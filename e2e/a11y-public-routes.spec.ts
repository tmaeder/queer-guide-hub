import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Route transitions fade opacity 0->1 (LayoutShell motion.div). axe blends that
// opacity into computed text color, flagging transient mid-fade frames as contrast
// failures. Emulate reduced motion (LayoutShell skips the fade) so axe analyzes the
// settled DOM - the same render real reduced-motion users get.
test.use({ reducedMotion: 'reduce' });

// P2-2 — axe-playwright sweep across major public routes.
// /events and /admin already have their own a11y specs.

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const ROUTES = ['/', '/venues', '/news', '/marketplace', '/cities'];

test.describe('Public routes — automated a11y', () => {
  test.setTimeout(120_000);

  for (const route of ROUTES) {
    test(`${route} has no serious/critical axe violations`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForSelector('main', { timeout: 30_000 }).catch(() => {});
      // axe reads *computed* colors. If it runs before the theme stylesheet has
      // applied its CSS custom properties (--foreground / --muted-foreground /
      // --background), it samples fallback greys and reports bogus contrast
      // failures — ratios ~1.0–1.4 that match no real token (the shipped
      // --muted-foreground is 0 0% 35% ≈ 7:1). Wait for network + fonts, and
      // confirm the tokens have actually resolved on :root, before analysing.
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await page
        .waitForFunction(
          () =>
            getComputedStyle(document.documentElement)
              .getPropertyValue('--foreground')
              .trim() !== '',
          null,
          { timeout: 10_000 },
        )
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
});
