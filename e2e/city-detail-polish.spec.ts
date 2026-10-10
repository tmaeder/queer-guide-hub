import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { REDUCED_MOTION } from './support/reducedMotion';

test.use(REDUCED_MOTION);

const LOCATIONS = [
  { path: '/city/berlin', name: 'Berlin', disclosure: 'travel', saveActions: 1 },
] as const;

const VIEWPORTS = [
  { label: 'desktop', width: 1440, height: 1000 },
  { label: 'mobile', width: 390, height: 844 },
] as const;

async function dismissCookieBanner(page: Page) {
  await page
    .getByRole('button', { name: /accept all|necessary only/i })
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
}

async function openLocation(page: Page, path: string) {
  await page.goto(path);
  await page.locator('article h1').first().waitFor({ state: 'visible', timeout: 30_000 });
  await dismissCookieBanner(page);
}

test.describe('task-first location layout matrix', () => {
  test.setTimeout(120_000);

  for (const location of LOCATIONS) {
    for (const viewport of VIEWPORTS) {
      test(`${location.name} at ${viewport.width}px keeps the opening tasks and navigation intact`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await openLocation(page, location.path);

        await expect(page.locator('article h1').first()).toContainText(location.name);
        await expect(page.getByTestId('single-rail')).toHaveCount(0);

        const overview = page.locator('article section[aria-label="Overview"]');
        const verdict = overview.locator('[data-testid$="safety-verdict"]').first();
        const mapLabel = overview.getByText('Around this station', { exact: true });
        await expect(overview).toBeVisible();
        await expect(verdict).toBeVisible();
        await expect(mapLabel).toBeVisible();

        if (viewport.label === 'mobile') {
          const [verdictBox, mapBox] = await Promise.all([
            verdict.boundingBox(),
            mapLabel.boundingBox(),
          ]);
          const secondScreen = viewport.height * 2;
          expect(verdictBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(secondScreen);
          expect(mapBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(secondScreen);
        }

        await expect(page.getByRole('button', { name: /plan (a trip|carefully)/i })).toHaveCount(1);
        await expect(page.getByRole('button', { name: /save(d)? to favorites/i })).toHaveCount(
          location.saveActions,
        );

        const moreActions = page.getByRole('button', { name: 'More actions' });
        await expect(moreActions).toHaveCount(1);
        await moreActions.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('dialog', { name: 'More actions' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(moreActions).toBeFocused();

        const stations = page.locator('article nav a[href^="#"]');
        expect(await stations.count()).toBeGreaterThan(1);
        for (const station of await stations.all()) {
          const href = await station.getAttribute('href');
          if (href) await expect(page.locator(`[id="${href.slice(1)}"]`)).toHaveCount(1);
        }

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);
      });
    }
  }

  for (const location of LOCATIONS) {
    test(`${location.name} opens a hash-targeted disclosure and focuses its heading`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${location.path}#${location.disclosure}`);
      await page.locator('article h1').first().waitFor({ state: 'visible', timeout: 30_000 });

      const panel = page.locator(`#${location.disclosure}-detail`);
      const toggle = page.locator(`button[aria-controls="${location.disclosure}-detail"]`);
      await expect(panel).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator(`#${location.disclosure} h2`)).toBeFocused();
    });
  }

  test('city rights depth follows country risk while the country warning stays explicit', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await openLocation(page, '/city/kabul');
    await expect(page.locator('button[aria-controls="rights-detail"]')).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await openLocation(page, '/city/edinburgh');
    await expect(page.locator('button[aria-controls="rights-detail"]')).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await openLocation(page, '/country/afghanistan');
    await expect(page.locator('main')).toContainText(
      /Travel Warning: Same-sex activity may carry the death penalty/,
    );
    await expect(page.locator('#rights')).toBeVisible();
  });
});

test.describe('location detail accessibility', () => {
  test.setTimeout(120_000);

  for (const location of LOCATIONS) {
    test(`${location.name} has sound heading order and no serious axe violations`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await openLocation(page, location.path);
      await page.evaluate(() => document.fonts.ready).catch(() => {});

      const headingLevels = await page
        .locator('article h1, article h2, article h3')
        .evaluateAll((headings) =>
          headings
            .filter((heading) => !heading.closest('[hidden]'))
            .map((heading) => Number(heading.tagName.slice(1))),
        );
      expect(headingLevels[0]).toBe(1);
      for (let index = 1; index < headingLevels.length; index += 1) {
        expect(
          headingLevels[index] - headingLevels[index - 1],
          `heading order jumped from h${headingLevels[index - 1]} to h${headingLevels[index]}`,
        ).toBeLessThanOrEqual(1);
      }

      const results = await new AxeBuilder({ page })
        .include('article')
        .disableRules(['link-in-text-block'])
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const blocking = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    });
  }
});
