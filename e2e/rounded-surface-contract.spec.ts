import { expect, test, type Page } from '@playwright/test';

const PUBLIC_SURFACES = [
  '/',
  '/venues',
  '/events',
  '/going-out',
  '/travel',
  '/cities',
  '/city/compare',
  '/organizations',
  '/personalities',
  '/history',
  '/pride',
  '/guides',
  '/tags',
  '/tags/sti-guide',
  '/marketplace',
  '/marketplace/categories',
  '/marketplace/brands',
  '/hotels',
  '/news',
  '/news/all',
  '/podcasts',
  '/community',
  '/about',
  '/contact',
  '/donate',
  '/help',
  '/rights',
  '/rights/sources',
  '/rights/trans',
  '/travel/book',
  '/map',
  '/explore/connections',
  '/competitions',
  '/competitions/drag-series',
  '/tags/interactions',
  '/privacy',
  '/search',
  '/community/feed',
  '/community/members',
  '/community/friends',
  '/community/groups',
  '/people',
  '/people/friends',
  '/people/dating',
  '/people/travel',
  '/people/nearby',
  '/settings',
  '/sitemap',
  '/feedback',
  '/submit',
  '/auth',
  '/tools/checklist',
  '/city/berlin',
  '/country/germany',
  '/villages/chueca',
] as const;

const gotoReady = async (page: Page, path: string) => {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main', { state: 'attached', timeout: 30_000 });
  await page
    .getByRole('button', { name: /accept all|necessary only/i })
    .first()
    .click({ timeout: 2_000 })
    .catch(() => {});
  await page.waitForTimeout(150);
};

const setViewportAndSettle = async (page: Page, width: number, height: number) => {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
};

const auditRoundedSurfaces = (page: Page) =>
  page.evaluate(() => {
    const alpha = (color: string) => {
      if (!color || color === 'transparent') return 0;
      const slashAlpha = color.match(/\/\s*([\d.]+%?)\s*\)$/);
      if (slashAlpha) {
        return slashAlpha[1].endsWith('%')
          ? Number.parseFloat(slashAlpha[1]) / 100
          : Number.parseFloat(slashAlpha[1]);
      }
      const rgbaAlpha = color.match(/rgba\([^)]*,\s*([\d.]+)\s*\)$/);
      return rgbaAlpha ? Number.parseFloat(rgbaAlpha[1]) : 1;
    };
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width >= 24 &&
        rect.height >= 20 &&
        rect.width * rect.height >= 800 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0
      );
    };
    return [...document.querySelectorAll('body *')]
      .filter(visible)
      .filter((element) => {
        if (
          element.closest('svg, canvas, [data-maplibre-map], .maplibregl-map') ||
          element.matches(
            'main, .min-h-screen.bg-background, .route-context-shell, ' +
              '[data-testid="route-journey"], .route-network-rail, .route-network-rail__track',
          )
        ) {
          return false;
        }

        // A table row is one composite plate even though its fill lives on
        // adjacent cells. Accept the internal square joins only when the
        // row's exposed left and right endpoints carry the full radius.
        if (element.matches('th, td') && element.parentElement) {
          const visibleCells = [...element.parentElement.children].filter(visible);
          const first = visibleCells.at(0);
          const last = visibleCells.at(-1);
          if (first && last) {
            const firstStyle = getComputedStyle(first);
            const lastStyle = getComputedStyle(last);
            const roundedEndpoints =
              Number.parseFloat(firstStyle.borderTopLeftRadius) >= 8 &&
              Number.parseFloat(firstStyle.borderBottomLeftRadius) >= 8 &&
              Number.parseFloat(lastStyle.borderTopRightRadius) >= 8 &&
              Number.parseFloat(lastStyle.borderBottomRightRadius) >= 8;
            if (roundedEndpoints) return false;
          }
        }

        const style = getComputedStyle(element);
        const parentStyle = element.parentElement ? getComputedStyle(element.parentElement) : null;
        const hasDistinctFill =
          alpha(style.backgroundColor) > 0.03 &&
          style.backgroundColor !== parentStyle?.backgroundColor;
        const hasElevation = style.boxShadow !== 'none';
        const isSurfaceRole = element.matches(
          'button,input,textarea,select,article,aside,section,header,footer,nav,form,fieldset,' +
            '[role="button"],[role="tab"],[role="dialog"],[role="alert"],[role="menu"],[data-slot="card"]',
        );
        if (!(hasDistinctFill || hasElevation) || (!hasDistinctFill && !isSurfaceRole))
          return false;

        const radii = [
          style.borderTopLeftRadius,
          style.borderTopRightRadius,
          style.borderBottomRightRadius,
          style.borderBottomLeftRadius,
        ].map((value) => Number.parseFloat(value) || 0);
        return Math.min(...radii) < 8;
      })
      .map((element) => {
        const html = element as HTMLElement;
        const rect = element.getBoundingClientRect();
        const text = (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48);
        return (
          `${element.tagName.toLowerCase()}.${String(html.className || '').slice(0, 120)} ` +
          `[${Math.round(rect.width)}x${Math.round(rect.height)}] ${text}`
        );
      })
      .slice(0, 30);
  });

const auditThinBorders = (page: Page) =>
  page.evaluate(() => {
    const alpha = (color: string) => {
      if (!color || color === 'transparent') return 0;
      const slashAlpha = color.match(/\/\s*([\d.]+%?)\s*\)$/);
      if (slashAlpha) {
        return slashAlpha[1].endsWith('%')
          ? Number.parseFloat(slashAlpha[1]) / 100
          : Number.parseFloat(slashAlpha[1]);
      }
      const rgbaAlpha = color.match(/rgba\([^)]*,\s*([\d.]+)\s*\)$/);
      return rgbaAlpha ? Number.parseFloat(rgbaAlpha[1]) : 1;
    };
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width >= 4 &&
        rect.height >= 4 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0
      );
    };

    return [...document.querySelectorAll('body *')]
      .filter(visible)
      .filter((element) => {
        // Borders are legitimate only when they ARE the information geometry:
        // maps, diagrams, route tracks, station/risk marks, charts and native
        // media. Product surfaces and controls never need a one-pixel frame.
        if (
          element.closest(
            'svg,canvas,video,[data-maplibre-map],.maplibregl-map,.maplibregl-popup-tip,' +
              '[data-information-geometry="true"]',
          ) ||
          element.matches(
            '.route-network-rail,.route-network-rail__track,.route-line,.route-station,.transit-marker,' +
              '.station-dot,.risk-mark,[class*="station-dot"],[class*="route-line"]',
          )
        ) {
          return false;
        }

        const style = getComputedStyle(element);
        const widths = [
          style.borderTopWidth,
          style.borderRightWidth,
          style.borderBottomWidth,
          style.borderLeftWidth,
        ].map((value) => Number.parseFloat(value) || 0);
        const colors = [
          style.borderTopColor,
          style.borderRightColor,
          style.borderBottomColor,
          style.borderLeftColor,
        ];
        return widths.some(
          (width, index) => width > 0 && width <= 2 && alpha(colors[index]) > 0.03,
        );
      })
      .map((element) => {
        const html = element as HTMLElement;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const text = (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48);
        return {
          element: `${element.tagName.toLowerCase()}.${String(html.className || '').slice(0, 120)}`,
          size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
          borders: [
            `${style.borderTopWidth} ${style.borderTopColor}`,
            `${style.borderRightWidth} ${style.borderRightColor}`,
            `${style.borderBottomWidth} ${style.borderBottomColor}`,
            `${style.borderLeftWidth} ${style.borderLeftColor}`,
          ],
          text,
        };
      })
      .slice(0, 30);
  });

for (const path of PUBLIC_SURFACES) {
  test(`${path} has no sharp surfaces or thin UI borders`, async ({ page }) => {
    test.setTimeout(60_000);
    await setViewportAndSettle(page, 1280, 900);
    await gotoReady(page, path);
    expect(await auditRoundedSurfaces(page), `sharp desktop surfaces on ${path}`).toEqual([]);
    expect(await auditThinBorders(page), `thin desktop UI borders on ${path}`).toEqual([]);

    await setViewportAndSettle(page, 390, 844);
    expect(await auditRoundedSurfaces(page), `sharp mobile surfaces on ${path}`).toEqual([]);
    expect(await auditThinBorders(page), `thin mobile UI borders on ${path}`).toEqual([]);
  });
}
