import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
