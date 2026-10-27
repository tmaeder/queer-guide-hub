import { expect, test } from '@playwright/test';

for (const width of [1440, 390, 320]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`footer icon contrast at ${width}px in ${theme} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height: width > 768 ? 1000 : 844 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto('/legal', { waitUntil: 'domcontentloaded' });
      const footer = page.locator('[data-site-footer]');
      await expect(footer).toBeVisible({ timeout: 60000 });
      const consent = page.getByRole('button', { name: 'Necessary Only', exact: true });
      if (
        await consent
          .waitFor({ state: 'visible', timeout: 8000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await consent.click();
      }
      await page.keyboard.press('End');
      await footer.scrollIntoViewIfNeeded();
      await footer.getByRole('button', { name: 'Toggle theme' }).click();
      await page
        .getByRole('menuitem', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true })
        .click();
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));

      const destinations = footer.locator('.footer-destination');
      await expect(destinations).toHaveCount(7);
      for (const link of await destinations.all()) {
        await link.click({ trial: true });
        const contrast = await link.locator('.footer-destination-icon').evaluate((badge) => {
          const luminance = (color: string) => {
            const channels = color
              .match(/[\d.]+/g)!
              .slice(0, 3)
              .map(Number)
              .map((value) => {
                const channel = value / 255;
                return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
              });
            return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
          };
          const ground = luminance(getComputedStyle(badge).backgroundColor);
          return [...badge.querySelectorAll('path[stroke="currentColor"]')].map((path) => {
            const outline = luminance(getComputedStyle(path).color);
            return (Math.max(outline, ground) + 0.05) / (Math.min(outline, ground) + 0.05);
          });
        });
        expect(contrast.length, await link.innerText()).toBeGreaterThan(0);
        expect(Math.min(...contrast), await link.innerText()).toBeGreaterThanOrEqual(3);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (process.env.FOOTER_ICON_SCREENSHOTS) {
        await page.keyboard.press('End');
        await footer.scrollIntoViewIfNeeded();
        await footer.screenshot({
          path: `${process.env.FOOTER_ICON_SCREENSHOTS}/${width}-${theme}.png`,
          animations: 'disabled',
        });
      }
    });
  }
}
