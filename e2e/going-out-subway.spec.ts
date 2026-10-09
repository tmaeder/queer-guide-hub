import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitForAppReady } from './support/appReady';
import { REDUCED_MOTION, assertReducedMotion } from './support/reducedMotion';

test.use(REDUCED_MOTION);

const openGoingOut = async (page: Page) => {
  await page.goto('/going-out', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForAppReady(page);
  await page.locator('.going-out-hero').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('.going-out-city').first().waitFor({ state: 'visible', timeout: 30_000 });
  const necessaryOnly = page.getByRole('button', { name: 'Necessary Only', exact: true });
  if (await necessaryOnly.isVisible()) await necessaryOnly.click();
};

test.describe('Going out — shared subway system', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('queer-guide-theme', 'light'));
  });

  test('renders the shared hero and complete route', async ({ page }, testInfo) => {
    await openGoingOut(page);

    const shell = page.locator('.going-out-page');
    await expect(shell).toBeVisible();
    await expect(shell.getByRole('heading', { level: 1, name: /Going out/ })).toBeVisible();

    await expect(shell.getByRole('link', { name: 'Find your next stop' })).toHaveAttribute(
      'href',
      '#plan',
    );
    await expect(shell.getByRole('link', { name: 'See what’s on' })).toHaveAttribute(
      'href',
      '#whats-on',
    );

    for (const name of ['Where to go', "What's on", 'Before you go', 'Elsewhere']) {
      await expect(shell.getByRole('heading', { level: 2, name })).toBeVisible();
    }
    await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true });
    await page.screenshot({ path: testInfo.outputPath('desktop-viewport.png') });
  });

  test('keeps the departures surface honest in both populated and empty states', async ({
    page,
  }) => {
    await openGoingOut(page);

    const section = page.locator('#whats-on');
    await expect(section).toContainText(
      /Showing events (tonight|this weekend|in the next \d+ days|soonest anywhere)|No upcoming events/,
    );

    const departures = section.locator('.going-out-departure');
    await departures
      .first()
      .or(section.getByText('No upcoming events are listed yet.'))
      .waitFor({ state: 'visible' });
    if ((await departures.count()) > 0) {
      await expect(departures.first().locator('.going-out-departure-date')).toBeVisible();
      await expect(departures.first().locator('.going-out-departure-title')).not.toBeEmpty();
      await expect(departures.first().locator('.going-out-departure-city')).not.toBeEmpty();
    } else {
      await expect(section).toContainText('No upcoming events are listed yet.');
    }
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`inherits the ${theme} theme with readable supporting copy`, async ({ page }) => {
      await page.addInitScript((mode) => localStorage.setItem('queer-guide-theme', mode), theme);
      await openGoingOut(page);

      const surfaces = await page.locator('.going-out-hero').evaluate((hero) => ({
        hero: getComputedStyle(hero).backgroundColor,
        root: getComputedStyle(document.documentElement).getPropertyValue('--background').trim(),
        inherited: getComputedStyle(hero).getPropertyValue('--background').trim(),
      }));
      expect(surfaces.inherited).toBe(surfaces.root);
      // Inheritance alone would also pass on a black painted container. The
      // visible hero surface must equal the shared theme's actual background.
      const expectedSurface = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'hsl(var(--background))';
        document.body.appendChild(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      });
      expect(surfaces.hero).toBe(expectedSurface);

      const colors = await page
        .locator('#whats-on p')
        .first()
        .evaluate((node) => {
          const parse = (value: string) =>
            value
              .match(/\d+(?:\.\d+)?/g)
              ?.slice(0, 3)
              .map(Number) ?? [];
          const luminance = ([r, g, b]: number[]) => {
            const channels = [r, g, b].map((value) => {
              const channel = value / 255;
              return channel <= 0.03928
                ? channel / 12.92
                : Math.pow((channel + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
          };

          const foreground = parse(getComputedStyle(node).color);
          const background = parse(getComputedStyle(document.body).backgroundColor);
          const light = Math.max(luminance(foreground), luminance(background));
          const dark = Math.min(luminance(foreground), luminance(background));
          return { foreground, background, contrast: (light + 0.05) / (dark + 0.05) };
        });

      expect(colors.foreground).toHaveLength(3);
      expect(colors.background).toHaveLength(3);
      expect(colors.contrast).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('does not overflow or hide useful content behind a tall mobile hero', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openGoingOut(page);

    const geometry = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      heroWidth: Math.round(
        document.querySelector('.going-out-hero')!.getBoundingClientRect().width,
      ),
      heroHeight: document.querySelector('.going-out-hero')!.getBoundingClientRect().height,
    }));

    expect(geometry.scrollWidth).toBe(geometry.clientWidth);
    expect(geometry.heroWidth).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.heroHeight).toBeLessThan(440);
    await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
    await page.screenshot({ path: testInfo.outputPath('mobile-viewport.png') });
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`has no serious or critical accessibility violations in ${theme} mode`, async ({
      page,
    }) => {
      await page.addInitScript((mode) => localStorage.setItem('queer-guide-theme', mode), theme);
      await openGoingOut(page);
      await assertReducedMotion(page);

      const results = await new AxeBuilder({ page })
        .exclude('footer')
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
