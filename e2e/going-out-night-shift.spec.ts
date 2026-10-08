import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitForAppReady } from './support/appReady';
import { REDUCED_MOTION, assertReducedMotion } from './support/reducedMotion';

test.use(REDUCED_MOTION);

const openGoingOut = async (page: Page) => {
  await page.goto('/going-out', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForAppReady(page);
  await page.locator('.night-shift-hero').waitFor({ state: 'visible', timeout: 30_000 });
};

test.describe('Going out — Night Shift', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test('renders the page-specific hero and complete route', async ({ page }) => {
    await openGoingOut(page);

    const shell = page.locator('.night-shift-page');
    await expect(shell).toBeVisible();
    await expect(shell.getByRole('heading', { level: 1, name: /Going out/ })).toBeVisible();
    await expect(shell.getByText('Night shift · community listed', { exact: true })).toBeVisible();

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
  });

  test('keeps the departures surface honest in both populated and empty states', async ({
    page,
  }) => {
    await openGoingOut(page);

    const section = page.locator('#whats-on');
    await expect(section).toContainText(
      /Showing events (tonight|this weekend|in the next \d+ days|soonest anywhere)|No upcoming events/,
    );

    const departures = section.locator('.night-shift-departure');
    await departures
      .first()
      .or(section.getByText('No upcoming events are listed yet.'))
      .waitFor({ state: 'visible' });
    if ((await departures.count()) > 0) {
      await expect(departures.first().locator('.night-shift-departure-date')).toBeVisible();
      await expect(departures.first().locator('.night-shift-departure-title')).not.toBeEmpty();
      await expect(departures.first().locator('.night-shift-departure-city')).not.toBeEmpty();
    } else {
      await expect(section).toContainText('No upcoming events are listed yet.');
    }
  });

  test('uses readable dark-theme tokens for supporting copy', async ({ page }) => {
    await openGoingOut(page);

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
            return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
        };

        const foreground = parse(getComputedStyle(node).color);
        const pageShell = node.closest('.night-shift-page');
        const background = parse(getComputedStyle(pageShell!).backgroundColor);
        const light = Math.max(luminance(foreground), luminance(background));
        const dark = Math.min(luminance(foreground), luminance(background));
        return { foreground, background, contrast: (light + 0.05) / (dark + 0.05) };
      });

    expect(colors.foreground).toHaveLength(3);
    expect(colors.background).toHaveLength(3);
    expect(colors.contrast).toBeGreaterThanOrEqual(4.5);
  });

  test('does not overflow a 390px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openGoingOut(page);

    const geometry = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      heroWidth: Math.round(
        document.querySelector('.night-shift-hero')!.getBoundingClientRect().width,
      ),
    }));

    expect(geometry.scrollWidth).toBe(geometry.clientWidth);
    expect(geometry.heroWidth).toBeLessThanOrEqual(geometry.clientWidth);
  });

  test('has no serious or critical accessibility violations', async ({ page }) => {
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
});
