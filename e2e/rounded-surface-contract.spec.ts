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
] as const;

const gotoReady = async (page: Page, path: string) => {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('main', { state: 'attached', timeout: 30_000 });
  await page
    .getByRole('button', { name: /accept all|necessary only/i })
    .first()
    .click({ timeout: 2_000 })
    .catch(() => {});
  await page.waitForTimeout(250);
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
            'main, .min-h-screen.flex.flex-col.bg-background, .route-context-shell, ' +
              '[data-testid="route-journey"], .route-network-rail, .route-network-rail__track',
          )
        ) {
          return false;
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

for (const path of PUBLIC_SURFACES) {
  test(`${path} has no sharp rendered surfaces`, async ({ page }) => {
    await gotoReady(page, path);
    expect(await auditRoundedSurfaces(page), `sharp surfaces on ${path}`).toEqual([]);

    const visibleHairlines = await page.locator('body').evaluate(() => {
      const alpha = (value: string) => {
        if (!value || value === 'transparent') return 0;
        const slash = value.match(/\/\s*([\d.]+%?)\s*\)$/);
        if (slash) {
          return slash[1].endsWith('%')
            ? Number.parseFloat(slash[1]) / 100
            : Number.parseFloat(slash[1]);
        }
        const rgba = value.match(/rgba\([^)]*,\s*([\d.]+)\s*\)$/);
        return rgba ? Number.parseFloat(rgba[1]) : 1;
      };

      return Array.from(
        document.querySelectorAll<HTMLElement>(
          '[class~="border-border-hairline"], [class~="divide-border-hairline"] > :not([hidden]) ~ :not([hidden])',
        ),
      )
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1 || style.visibility === 'hidden') return false;

          return (
            (Number.parseFloat(style.borderTopWidth) > 0 && alpha(style.borderTopColor) > 0.01) ||
            (Number.parseFloat(style.borderRightWidth) > 0 &&
              alpha(style.borderRightColor) > 0.01) ||
            (Number.parseFloat(style.borderBottomWidth) > 0 &&
              alpha(style.borderBottomColor) > 0.01) ||
            (Number.parseFloat(style.borderLeftWidth) > 0 && alpha(style.borderLeftColor) > 0.01)
          );
        })
        .slice(0, 20)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          className: element.className,
          text: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80),
        }));
    });

    expect(visibleHairlines, `visible legacy hairlines on ${path}`).toEqual([]);
  });
}
