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

const surfaceEdgeAudit = (page: Page) =>
  page.evaluate(() => {
    const alpha = (color: string) => {
      if (!color || color === 'transparent') return 0;
      const match = color.match(/rgba?\([^)]*[, /]([\d.]+)\s*\)$/);
      return color.startsWith('rgba') && match ? Number(match[1]) : 1;
    };
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 2 &&
        rect.height > 2 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0
      );
    };
    const label = (element: Element) =>
      `${element.tagName.toLowerCase()}.${String((element as HTMLElement).className || '').slice(0, 120)}`;
    const elements = [...document.querySelectorAll('body *')].filter(visible);
    const thinBorders = elements
      .filter((element) => {
        if (
          element.closest('svg, canvas') ||
          element.classList.contains('border-track-ring') ||
          element.matches('button,input,textarea,select,[role="checkbox"],[role="combobox"]')
        ) {
          return false;
        }
        const style = getComputedStyle(element);
        return ['Top', 'Right', 'Bottom', 'Left'].some((side) => {
          const width = Number.parseFloat(
            style.getPropertyValue(`border-${side.toLowerCase()}-width`),
          );
          const borderStyle = style.getPropertyValue(`border-${side.toLowerCase()}-style`);
          const color = style.getPropertyValue(`border-${side.toLowerCase()}-color`);
          return width > 0 && width <= 2 && borderStyle !== 'none' && alpha(color) > 0.03;
        });
      })
      .map(label);
    const sharpControls = elements
      .filter((element) =>
        element.matches(
          'button,input,textarea,select,a[role="button"],[role="button"],[role="tab"],[role="dialog"],[data-slot="card"]',
        ),
      )
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const radii = [
          style.borderTopLeftRadius,
          style.borderTopRightRadius,
          style.borderBottomRightRadius,
          style.borderBottomLeftRadius,
        ].map((value) => Number.parseFloat(value) || 0);
        const hasSurface =
          style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.boxShadow !== 'none';
        return Math.min(...radii) < 8 && rect.width > 20 && rect.height > 20 && hasSurface;
      })
      .map(label);

    return { thinBorders, sharpControls };
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

  test('homepage renders one functional four-line network above the fold', async ({ page }) => {
    await gotoReady(page, '/');

    const network = page.locator('.intent-map');
    await expect(network).toBeVisible();
    await expect(network.locator('svg path')).toHaveCount(4);
    await expect(network.locator('li')).toHaveCount(8);
    await expect(page.locator('.hero-network')).toHaveCount(0);
    await expect(page.locator('.network-backdrop')).toHaveCount(0);

    const networkBox = await network.boundingBox();
    expect(networkBox).not.toBeNull();
    expect(networkBox!.y).toBeLessThan(900);
  });

  test('homepage network draws its lines and lands stations in sequence', async ({ page }) => {
    await gotoReady(page, '/');

    const motion = await page.locator('.intent-map').evaluate((network) => ({
      tracks: [...network.querySelectorAll('.intent-track-draw')].map((track) => {
        const style = getComputedStyle(track);
        return {
          name: style.animationName,
          duration: style.animationDuration,
          delay: style.animationDelay,
        };
      }),
      stations: [...network.querySelectorAll('.intent-station-ring')].map((station) => {
        const style = getComputedStyle(station);
        return { name: style.animationName, delay: style.animationDelay };
      }),
    }));

    expect(motion.tracks).toHaveLength(4);
    expect(motion.tracks.every((track) => track.name === 'network-draw')).toBe(true);
    expect(motion.tracks.every((track) => track.duration === '1.2s')).toBe(true);
    expect(new Set(motion.tracks.map((track) => track.delay)).size).toBe(4);
    expect(motion.stations).toHaveLength(8);
    expect(motion.stations.every((station) => station.name === 'station-pop')).toBe(true);
    expect(new Set(motion.stations.map((station) => station.delay)).size).toBe(8);
  });

  test('interactive cards use the authored diagonal lift', async ({ page }) => {
    await gotoReady(page, '/');

    const card = page.locator('.card-lift').first();
    await expect(card).toBeVisible();
    await card.hover();
    await expect
      .poll(() => card.evaluate((element) => getComputedStyle(element).transform))
      .toMatch(/matrix\(1, 0, 0, 1, -3, -3\)/);
  });

  test('interior pages keep one compact route line without ambient wallpaper', async ({ page }) => {
    await gotoReady(page, '/venues');

    const rail = page.locator('.route-network-rail');
    await expect(rail).toBeVisible();
    await expect(rail.locator('.route-network-rail__track')).toHaveCount(1);
    await expect(page.locator('.network-backdrop')).toHaveCount(0);

    const activeTrack = rail.locator('.route-network-rail__track--pink');
    await expect(activeTrack).toHaveCount(1);
    const box = await rail.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThanOrEqual(52);
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

  test('reduced motion keeps the network and cards still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoReady(page, '/');

    const networkMotion = await page.locator('.intent-map').evaluate((network) => ({
      track: getComputedStyle(network.querySelector('.intent-track-draw')!).animationName,
      station: getComputedStyle(network.querySelector('.intent-station-ring')!).animationName,
    }));
    expect(networkMotion).toEqual({ track: 'none', station: 'none' });

    const card = page.locator('.card-lift').first();
    await card.hover();
    expect(await card.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
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

  for (const path of ['/events', '/travel', '/pride', '/help', '/news']) {
    test(`${path} has no decorative hairlines or sharp controls`, async ({ page }) => {
      await gotoReady(page, path);
      const audit = await surfaceEdgeAudit(page);
      expect(audit.thinBorders, `visible thin borders on ${path}`).toEqual([]);
      expect(audit.sharpControls, `sharp surfaced controls on ${path}`).toEqual([]);
    });
  }

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
        intentMap: !!document.querySelector('.intent-map'),
        routeRail: !!document.querySelector('.route-network-rail'),
      }));

      expect(shell.mainVisible).toBe(true);
      expect(shell.trackPink).not.toBe('');
      expect(shell.overflow, `${path} has horizontal overflow`).toBeLessThanOrEqual(1);
      if (path === '/') expect(shell.intentMap).toBe(true);
      // /help was exempt from the rail while it carried a bespoke safety
      // header instead of the product chrome. It is an ordinary page now, so
      // it is held to the same shell as everything else — that equivalence is
      // the point of the change, so it is asserted rather than excused.
      if (path !== '/') expect(shell.routeRail).toBe(true);
    });
  }
});

declare global {
  interface Window {
    __routeJourneys?: Array<{ className: string; display: string }>;
  }
}
