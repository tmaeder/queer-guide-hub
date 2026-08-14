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
/**
 * Milestone only, deliberately.
 *
 * Venue detail rides the SAME `EntityDetailScroll` shell, so it adds no shell
 * coverage — and it proved order-dependent: `/venues` orders by trending, so
 * each run samples a different slug and some never resolve to the shell
 * (measured: venue@1440 green in 6.1s while venue@390 hung the full 30s in the
 * same batch, then passed in isolation). A flaky case in a shared suite costs
 * every future reader more than the duplicate coverage is worth. `/history`
 * renders a stable chronological spine, so its first link is deterministic.
 */
const DETAIL_ROUTES: Array<{ name: string; listing: string; hrefPattern: RegExp }> = [
  { name: 'milestone', listing: '/history', hrefPattern: /\/history\/[^/]+$/ },
];

test.describe('page layout — detail routes', () => {
  for (const width of [390, 1440]) {
    for (const { name, listing, hrefPattern } of DETAIL_ROUTES) {
      test(`${name} detail aligns with the header at ${width}px`, async ({ page }) => {
        // Two navigations plus a data-dependent poll: the listing has to hydrate
        // before a slug can be sampled, then the detail page has to load. That
        // exceeds the 30s default — venue detail alone takes ~6s locally.
        test.setTimeout(120_000);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(listing);
        await page.waitForLoadState('domcontentloaded');

        // Listings hydrate their rows from react-query AFTER domcontentloaded,
        // so sampling immediately finds nothing and `test.skip` fires — the
        // whole case then reports green while asserting NOTHING. Poll until a
        // link exists; only a genuinely empty listing may skip.
        const sample = () =>
          page
            .locator('a[href]')
            .evaluateAll(
              (nodes, pattern) =>
                nodes
                  .map((n) => (n as HTMLAnchorElement).getAttribute('href') ?? '')
                  .find((h) => new RegExp(pattern).test(h)) ?? null,
              hrefPattern.source,
            );
        await expect
          .poll(sample, { timeout: 30_000, message: `no ${name} link on ${listing}` })
          .not.toBeNull()
          .catch(() => {});
        const href = await sample();
        test.skip(!href, `${listing} rendered no ${name} link in 30s — empty listing?`);

        await page.goto(href as string);
        // Wait for the SHELL ITSELF, not a timeout. At a fixed 600ms the detail
        // frame has not mounted yet and EDGES measures whichever container the
        // route's Suspense fallback happens to render — which aligns fine, so
        // the case passed even against a hand-rolled `container mx-auto px-4`.
        // Measured: the negative control was green until this wait existed.
        await page.waitForSelector('[data-testid="entity-detail-layout"]', { timeout: 30_000 });

        // Assert on the detail frame BY NAME. "Some capped element on the page
        // aligns" is satisfiable by a sibling and proves nothing about the
        // shell under test.
        const r = await page.evaluate(() => {
          const cs = (n: Element, k: string) =>
            Math.round(parseFloat(getComputedStyle(n)[k as never]) || 0);
          const contentLeft = (n: Element) =>
            Math.round(n.getBoundingClientRect().left) + cs(n, 'paddingLeft');
          const frame = document.querySelector('[data-testid="entity-detail-layout"]');
          const header = document.querySelector('header .max-w-page');
          return {
            capped: frame ? frame.className.includes('max-w-page') : false,
            bareContainer: frame ? frame.className.split(/\s+/).includes('container') : false,
            frame: frame ? contentLeft(frame) : null,
            header: header ? contentLeft(header) : null,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        });

        expect(r.capped, `${href} detail frame is not on --container-page`).toBe(true);
        expect(r.bareContainer, `${href} detail frame hand-rolls \`container\``).toBe(false);
        expect(r.header, 'header has no capped content row').not.toBeNull();
        expect(
          Math.abs((r.frame as number) - (r.header as number)),
          `${href} @${width}: content starts at ${r.frame}, header at ${r.header}`,
        ).toBeLessThanOrEqual(1);
        expect(r.overflow, `${href} @${width} scrolls horizontally`).toBeLessThanOrEqual(0);
      });
    }
  }
});
