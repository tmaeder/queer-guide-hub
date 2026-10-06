import { expect, test, type Page } from '@playwright/test';
import { waitForAppReady } from './support/appReady';
import { REDUCED_MOTION } from './support/reducedMotion';

test.use(REDUCED_MOTION);

const VIEWPORTS = [
  { name: '320px', width: 320, height: 720 },
  { name: '390px', width: 390, height: 844 },
  { name: '768px', width: 768, height: 900 },
  { name: '1280px', width: 1280, height: 900 },
] as const;

async function gotoHome(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await expect(page.locator('main h1')).toBeVisible();
}

test.describe('UX accessibility remediation — production contract', () => {
  test.setTimeout(120_000);

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}: navigation targets remain usable without horizontal overflow`, async ({
      page,
    }) => {
      await gotoHome(page, viewport.width, viewport.height);

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflows).toBeLessThanOrEqual(1);

      const headerTargets = page.locator(
        'header a[aria-label]:visible, header button[aria-label]:visible',
      );
      expect(await headerTargets.count()).toBeGreaterThan(0);
      for (const target of await headerTargets.all()) {
        const box = await target.boundingBox();
        expect(box, 'visible header target has a box').not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }

      const footer = page.locator('footer');
      await footer.scrollIntoViewIfNeeded();
      await expect(footer).toBeVisible();
      for (const name of [/privacy/i, /terms/i]) {
        const link = footer.getByRole('link', { name }).first();
        await expect(link).toBeVisible();
        const box = await link.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test('a failed news request leaves a visible recovery action instead of a blank band', async ({
    page,
  }) => {
    await page.route('**/rest/v1/rpc/get_news_front*', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'forced production E2E failure' }),
      });
    });

    await gotoHome(page, 1280, 900);
    for (let index = 0; index < 6; index += 1) {
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(500);
    }

    const newsHeading = page.getByRole('heading', { name: /latest news/i });
    await expect(newsHeading).toBeVisible({ timeout: 30_000 });
    const section = newsHeading.locator('xpath=ancestor::section[1]');
    await expect(section.getByText(/this section could not load/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(section.getByRole('button', { name: /try again/i })).toBeVisible();
  });
});
