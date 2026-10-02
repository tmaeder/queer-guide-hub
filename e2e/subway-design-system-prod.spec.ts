import { expect, test, type Page } from '@playwright/test';

const dismissCookieBanner = async (page: Page) => {
  await page
    .getByRole('button', { name: /accept all|necessary only/i })
    .first()
    .click({ timeout: 3_000 })
    .catch(() => {});
};

const gotoReady = async (page: Page, path: string) => {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main', { state: 'attached', timeout: 30_000 });
  await dismissCookieBanner(page);
};

const observeRouteJourneys = (page: Page) =>
  page.evaluate(() => {
    const windowWithProbe = window as typeof window & {
      __routeJourneys?: Array<{ className: string; display: string }>;
    };
    windowWithProbe.__routeJourneys = [];
    const record = (node: Node) => {
      if (!(node instanceof Element)) return;
      const journeys = [
        ...(node.matches('[data-testid="route-journey"]') ? [node] : []),
        ...node.querySelectorAll('[data-testid="route-journey"]'),
      ];
      for (const journey of journeys) {
        windowWithProbe.__routeJourneys!.push({
          className: journey.className,
          display: getComputedStyle(journey).display,
        });
      }
    };
    new MutationObserver((records) => {
      for (const recordEntry of records) {
        for (const node of recordEntry.addedNodes) record(node);
      }
    }).observe(document.body, { childList: true, subtree: true });
  });

test.describe('production subway design-system contract', () => {
  test('publishes the canonical tokens and typography', async ({ page }) => {
    await gotoReady(page, '/');

    const system = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        bodyFont: getComputedStyle(document.body).fontFamily.toLowerCase(),
        displayFont: root.getPropertyValue('--font-display').trim().toLowerCase(),
        journey: root.getPropertyValue('--motion-journey').trim(),
        pink: root.getPropertyValue('--track-pink').trim(),
        blue: root.getPropertyValue('--track-blue').trim(),
        green: root.getPropertyValue('--track-green').trim(),
        yellow: root.getPropertyValue('--track-yellow').trim(),
      };
    });

    expect(system.bodyFont).toContain('space grotesk');
    expect(system.displayFont).toContain('anton');
    const journeyMs = system.journey.endsWith('ms')
      ? Number.parseFloat(system.journey)
      : Number.parseFloat(system.journey) * 1_000;
    expect(journeyMs).toBe(620);
    expect(system.pink).not.toBe('');
    expect(system.blue).not.toBe('');
    expect(system.green).not.toBe('');
    expect(system.yellow).not.toBe('');
  });

  test('client-side navigation plays one complete station journey', async ({ page }) => {
    await gotoReady(page, '/');
    await observeRouteJourneys(page);

    await page.locator('header nav[aria-label="Primary"] a').first().click();
    await expect(page).toHaveURL(/\/going-out$/);
    await expect.poll(() => page.evaluate(() => window.__routeJourneys?.length ?? 0)).toBe(1);

    const [journey] = await page.evaluate(() => window.__routeJourneys ?? []);
    expect(journey.display).not.toBe('none');
    expect(journey.className).toMatch(/route-journey--(pink|blue|green|yellow)/);
    await expect(page.getByTestId('route-journey')).toHaveCount(0, { timeout: 2_000 });
  });

  test('reduced motion suppresses the route journey', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoReady(page, '/');

    await page.locator('header nav[aria-label="Primary"] a').first().click();
    await expect(page).toHaveURL(/\/going-out$/);
    await expect(page.getByTestId('route-journey')).toBeHidden();
    await expect(page.getByTestId('route-journey')).toHaveCount(0, { timeout: 2_000 });
  });

  test('safety routes remain motion-free', async ({ page }) => {
    await gotoReady(page, '/about');
    await observeRouteJourneys(page);

    const helpLink = page.locator('a[href$="/help"]').first();
    await expect(helpLink).toHaveCount(1);
    await helpLink.evaluate((element: HTMLAnchorElement) => element.click());
    await expect(page).toHaveURL(/\/help$/);
    await page.waitForTimeout(800);
    await expect.poll(() => page.evaluate(() => window.__routeJourneys?.length ?? 0)).toBe(0);
  });

  for (const path of [
    '/',
    '/venues',
    '/events',
    '/news',
    '/marketplace',
    '/trips',
    '/about',
    '/help',
  ]) {
    test(`${path} keeps its shell on-system at 390px`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await gotoReady(page, path);

      const shell = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        mainVisible: !!document.querySelector('main'),
        trackPink: getComputedStyle(document.documentElement)
          .getPropertyValue('--track-pink')
          .trim(),
      }));

      expect(shell.mainVisible).toBe(true);
      expect(shell.trackPink).not.toBe('');
      expect(shell.overflow, `${path} has horizontal overflow`).toBeLessThanOrEqual(1);
    });
  }
});

declare global {
  interface Window {
    __routeJourneys?: Array<{ className: string; display: string }>;
  }
}
