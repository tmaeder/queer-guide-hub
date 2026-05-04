import { test, expect } from '@playwright/test';

// Venues audit Phase 5 (P0): no horizontal overflow at any viewport width.

const VIEWPORTS = [320, 375, 768, 1024, 1237, 1440, 2560];

test.describe('Venues — no horizontal overflow', () => {
  for (const width of VIEWPORTS) {
    test(`no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/venues');
      await page.waitForLoadState('domcontentloaded');
      // Let layout settle.
      await page.waitForTimeout(500);

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(
        scrollWidth,
        `scrollWidth (${scrollWidth}) should equal clientWidth (${clientWidth}) at ${width}px`,
      ).toBeLessThanOrEqual(clientWidth);
    });
  }
});
