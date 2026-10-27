import { expect, test } from '@playwright/test';

const fields = [
  { path: '/marketplace', label: 'Search products and services' },
  { path: '/news/all', label: 'Search articles' },
  { path: '/help', id: 'help-search' },
  { path: '/sitemap', label: 'Filter sitemap links' },
  { path: '/groups', placeholder: 'Search groups...' },
];

for (const width of [1440, 320]) {
  for (const field of fields) {
    test(`${field.path} keeps input text clear of icons at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(field.path, { waitUntil: 'domcontentloaded' });
      const input = field.id
        ? page.locator(`#${field.id}`)
        : field.placeholder
          ? page.getByPlaceholder(field.placeholder, { exact: true })
          : page
              .getByRole('combobox', { name: field.label })
              .or(page.getByRole('textbox', { name: field.label }))
              .or(page.getByRole('searchbox', { name: field.label }));
      await expect(input).toBeVisible({ timeout: 60000 });
      const consent = page.getByRole('button', { name: 'Necessary Only', exact: true });
      if (
        await consent
          .waitFor({ state: 'visible', timeout: 2000 })
          .then(() => true)
          .catch(() => false)
      )
        await consent.click();

      for (const value of ['', 'icon spacing check']) {
        await input.fill(value);
        await page.keyboard.press('Escape');
        await input.evaluate(async (element) => {
          element.getBoundingClientRect();
          await Promise.all(
            element.getAnimations().map((animation) => animation.finished.catch(() => {})),
          );
        });
        const geometry = await input.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const contentLeft = rect.left + Number.parseFloat(style.paddingLeft);
          const contentRight = rect.right - Number.parseFloat(style.paddingRight);
          const adornments = [...element.parentElement!.children]
            .filter(
              (sibling) =>
                sibling.matches('svg[data-site-icon], button') &&
                (sibling.matches('svg[data-site-icon]') ||
                  sibling.querySelector('svg[data-site-icon]')),
            )
            .filter((sibling) => getComputedStyle(sibling).position === 'absolute')
            .map((sibling) => {
              const box = sibling.getBoundingClientRect();
              return {
                left: box.left,
                right: box.right,
                top: box.top,
                bottom: box.bottom,
                width: box.width,
                height: box.height,
              };
            })
            .filter((box) => box.width > 0 && box.height > 0);
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            height: rect.height,
            contentLeft,
            contentRight,
            adornments,
          };
        });
        expect(geometry.adornments.length).toBeGreaterThan(0);
        expect(geometry.height).toBeGreaterThanOrEqual(80);
        expect(geometry.contentRight).toBeGreaterThan(geometry.contentLeft);
        for (const adornment of geometry.adornments) {
          if ((adornment.left + adornment.right) / 2 < (geometry.left + geometry.right) / 2) {
            expect(geometry.contentLeft - adornment.right).toBeGreaterThanOrEqual(8);
          } else {
            expect(adornment.left - geometry.contentRight).toBeGreaterThanOrEqual(8);
          }
          expect(adornment.top).toBeGreaterThanOrEqual(geometry.top - 1);
          expect(adornment.bottom).toBeLessThanOrEqual(geometry.bottom + 1);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
  }
}
