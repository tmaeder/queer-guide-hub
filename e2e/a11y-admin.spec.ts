import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const ADMIN_ROUTES = [
  '/admin',
  '/admin/content/events',
  '/admin/pipelines',
];

test.describe('Admin shell — automated a11y', () => {
  test.setTimeout(180_000);

  for (const route of ADMIN_ROUTES) {
    test(`${route} has no serious/critical axe violations`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForSelector('main, [role="main"], #admin-main-content', { timeout: 30_000 }).catch(() => {});

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
    await page.waitForLoadState('domcontentloaded');
    const skip = page.getByRole('link', { name: /skip to admin content/i });
    await expect(skip).toHaveCount(1);
  });
});
