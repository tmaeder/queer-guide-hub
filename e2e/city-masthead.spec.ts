import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: 'reduce' });

for (const width of [1440, 390, 320]) {
  for (const city of ['berlin', 'london', 'vaduz']) {
    test(`${city} masthead at ${width}px`, async ({ page }) => {
      test.setTimeout(150_000);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(() => {
        localStorage.setItem('i18nextLng', 'en');
        localStorage.setItem(
          'queer-guide-cookie-consent',
          JSON.stringify({
            preferences: { necessary: true, functional: true, analytics: false, marketing: false },
            version: '1.0',
            timestamp: new Date().toISOString(),
          }),
        );
      });
      await page.goto(`/city/${city}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(
        new RegExp(city, 'i'),
        { timeout: 60_000 },
      );
      const backdrop = page.getByTestId('single-backdrop');
      await expect(backdrop).toHaveCount(city === 'vaduz' ? 0 : 1);
      if (city !== 'vaduz') {
        const geometry = await backdrop.evaluate((el) => {
          const svg = el.querySelector('svg')!;
          return {
            hidden: el.getAttribute('aria-hidden'),
            pointerEvents: getComputedStyle(el).pointerEvents,
            opacity: Number(getComputedStyle(el).opacity),
            isolation: getComputedStyle(el.parentElement!).isolation,
            anchor: svg.getAttribute('preserveAspectRatio'),
            paths: [...svg.querySelectorAll('path')].map((path) => ({
              d: path.getAttribute('d'),
              width: path.getAttribute('stroke-width'),
              effect: path.getAttribute('vector-effect'),
            })),
          };
        });
        expect(geometry.hidden).toBe('true');
        expect(geometry.pointerEvents).toBe('none');
        expect(geometry.opacity).toBe(width >= 768 ? 0.35 : 0.2);
        expect(geometry.isolation).toBe('isolate');
        expect(geometry.anchor).toBe('xMaxYMid meet');
        expect(geometry.paths.length).toBeGreaterThan(0);
        expect(
          geometry.paths.every(
            (path) => path.d && path.width === '7' && path.effect === 'non-scaling-stroke',
          ),
        ).toBe(true);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      expect(errors).toEqual([]);
      await test
        .info()
        .attach(`${city}-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
    });
  }
}
