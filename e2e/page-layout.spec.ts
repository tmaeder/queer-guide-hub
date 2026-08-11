import { test, expect } from '@playwright/test';

/**
 * Page-layout standard (see docs/design-system/README.md §Page layout).
 *
 * Every page frames its content with <PageContainer>: one gutter ladder
 * (px-4 sm:px-6 md:px-8), one cap (--container-page, 1600), one vertical rhythm.
 * The point of the standard is that a page's content starts on the SAME
 * vertical as the nav above it, at every breakpoint — before it existed, the
 * header grew to md:px-8 while 62 pages stayed pinned at a flat px-4, so the
 * chrome breathed and the content did not.
 *
 * This asserts that alignment directly rather than snapshotting pixels: it
 * compares the page's outermost container's content edge against the header's,
 * which is the invariant, and stays true if the gutter values ever change.
 */

const ROUTES = [
  '/',
  '/events',
  '/venues',
  '/cities',
  '/news',
  '/guides',
  '/about',
  '/help',
  '/hotels',
  '/marketplace',
  '/rights',
  '/going-out',
  // A stack of full-bleed bands, each owning its own PageContainer — the shape
  // most likely to drift out of alignment with the header.
  '/history',
];

const WIDTHS = [390, 768, 1440, 1920];

/** Left edge of a container's CONTENT (border box + its own gutter). */
const EDGES = `(() => {
  const cs = (n, k) => Math.round(parseFloat(getComputedStyle(n)[k]) || 0);
  const contentLeft = (n) => Math.round(n.getBoundingClientRect().left) + cs(n, 'paddingLeft');
  const header = document.querySelector('header .max-w-page');
  const main = document.querySelector('main');
  const all = main ? Array.from(main.querySelectorAll('.max-w-page')) : [];
  // Outermost only — a container nested inside another is a legitimate inner
  // block (a hero inside a band), not the page's own frame.
  const tops = all.filter((n) => !all.some((o) => o !== n && o.contains(n)));
  return {
    header: header ? contentLeft(header) : null,
    pages: Array.from(new Set(tops.map(contentLeft))),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
})()`;

test.describe('page layout — one gutter, one cap, one rhythm', () => {
  for (const width of WIDTHS) {
    for (const route of ROUTES) {
      test(`${route} aligns with the header at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(600);

        const r = await page.evaluate(EDGES);

        // A route with no container at all is a regression in itself: it means
        // the page hand-rolled a wrapper again (or lost its frame entirely).
        expect(r.pages.length, `${route} has no PageContainer`).toBeGreaterThan(0);
        expect(r.header, 'header has no capped content row').not.toBeNull();

        for (const left of r.pages) {
          expect(
            Math.abs(left - (r.header as number)),
            `${route} @${width}: content starts at ${left}, header at ${r.header}`,
          ).toBeLessThanOrEqual(1);
        }

        expect(r.overflow, `${route} @${width} scrolls horizontally`).toBeLessThanOrEqual(0);
      });
    }
  }
});

/**
 * DETAIL routes. ROUTES above is listing-only, and that gap is exactly why
 * `EntityDetailScroll` — the shell behind milestone, venue and organization
 * detail — kept a hand-rolled `container mx-auto px-4 py-8` through the whole
 * layout sweep without anything noticing.
 *
 * Slugs are data-dependent, so each case samples one from its listing and
 * skips when there is none, rather than hardcoding a slug that can be merged
 * or unpublished out from under the suite.
 */
const DETAIL_ROUTES: Array<{ name: string; listing: string; hrefPattern: RegExp }> = [
  { name: 'milestone', listing: '/history', hrefPattern: /\/history\/[^/]+$/ },
  { name: 'venue', listing: '/venues', hrefPattern: /\/venues?\/[^/]+$/ },
];

test.describe('page layout — detail routes', () => {
  for (const width of [390, 1440]) {
    for (const { name, listing, hrefPattern } of DETAIL_ROUTES) {
      test(`${name} detail aligns with the header at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(listing);
        await page.waitForLoadState('domcontentloaded');

        const href = await page
          .locator(`a[href]`)
          .evaluateAll(
            (nodes, pattern) =>
              nodes
                .map((n) => (n as HTMLAnchorElement).getAttribute('href') ?? '')
                .find((h) => new RegExp(pattern).test(h)) ?? null,
            hrefPattern.source,
          );
        test.skip(!href, `no ${name} link found on ${listing}`);

        await page.goto(href as string);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(600);

        const r = await page.evaluate(EDGES);
        expect(r.pages.length, `${href} has no PageContainer`).toBeGreaterThan(0);
        expect(r.header, 'header has no capped content row').not.toBeNull();
        for (const left of r.pages) {
          expect(
            Math.abs(left - (r.header as number)),
            `${href} @${width}: content starts at ${left}, header at ${r.header}`,
          ).toBeLessThanOrEqual(1);
        }
        expect(r.overflow, `${href} @${width} scrolls horizontally`).toBeLessThanOrEqual(0);
      });
    }
  }
});
