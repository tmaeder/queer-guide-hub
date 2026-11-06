import { expect, test, type Page } from '@playwright/test';
import { loadHomeContent } from './support/homeContent';
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

  test('a failed city guide request leaves a visible recovery action instead of a blank band', async ({
    page,
  }) => {
    let failRequest = true;
    await page.route(/\/rest\/v1\/cities\?.*editorial_hook/, async (route) => {
      if (!failRequest) return route.continue();
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'PGRST100', message: 'Forced city guide request failure' }),
      });
    });

    await gotoHome(page, 1280, 900);
    await loadHomeContent(page);
    const section = page.getByRole('region', { name: 'City guides' });
    await expect(
      page.getByRole('region', { name: /^places and events/i }).locator('[aria-busy]'),
    ).toHaveAttribute('aria-busy', 'false');
    await section.locator('[aria-busy="true"]').scrollIntoViewIfNeeded();
    await expect(section.getByText(/this section could not load/i)).toBeVisible({
      timeout: 30_000,
    });
    failRequest = false;
    await section.getByRole('button', { name: /try again/i }).click();
    await expect(section.locator('a[href*="/city/"]').first()).toBeVisible();
  });
});
