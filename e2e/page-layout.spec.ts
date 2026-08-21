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
  // The makers directory (#2770): a masthead band plus a control band plus a
  // capped grid, each owning its own PageContainer — the drift-prone shape, and
  // unswept until now because a new route joins no static route list by itself.
  '/marketplace/brands',
  '/rights',
  '/going-out',
  // A stack of full-bleed bands, each owning its own PageContainer — the shape
  // most likely to drift out of alignment with the header.
  '/history',
  // The same band shape, plus three horizontally-scrolling picker rails that
  // each carry a `min-w-[520px]`. That min-width is only safe because it sits
  // inside an `overflow-x-auto` wrapper — remove the wrapper and this route
  // overflows the viewport at 390px, which is precisely what this spec catches.
  '/trips/discover',
  // The glossary: a masthead, a full-bleed ink scale-board and a two-column
  // body, all separate PageContainers. Absent from this list until the 2026-08
  // rebuild.
  '/tags',
  // The three geo singles. `SinglePage` frames itself with a `flush`
  // PageContainer and then lays out a `1fr 360px` grid inside it, so a rail
  // that does not reflow under the body would overflow at 390px — exactly what
  // this spec catches. No detail route was covered here before.
  '/city/berlin',
  '/country/germany',
  '/villages/chueca',
  '/venues/scum-and-villainy-cantina',
  '/events/capital-pride-ottawa-2026',
];

const WIDTHS = [390, 768, 1440, 1920];

/**
 * How far RIGHT the header's content row starts, relative to the page's.
 *
 * The header is a floating island inset from the window; the page is not. Both
 * share one cap and one gutter. So the offset is NOT simply the inset — it
 * depends on whether the cap has engaged:
 *
 *   header = inset + max(0, (V - 2*inset - cap)/2) + gutter
 *   page   =         max(0, (V          - cap)/2) + gutter
 *
 *   neither capped  -> offset = inset          (the gutter sets both edges)
 *   both capped     -> offset = 0              (centring absorbs the inset)
 *   page only       -> offset = inset - (V-cap)/2
 *
 * which collapses to the line below. Getting this wrong is not hypothetical:
 * the listing block asserted a constant `inset` and failed on EVERY route at
 * 1920px, while the detail block assumed a constant 0 and failed at 390 and
 * 1440 — the same misreading, in opposite directions, in one file.
 */
const expectedHeaderOffset = (viewport: number, cap: number, inset: number) =>
  inset - Math.min(inset, Math.max(0, (viewport - cap) / 2));

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
  // The header is a floating island (design panels 10-12): it is inset from
  // the window on every side, so its content row starts one inset further in
  // than the page's. Read the inset from the token the chrome actually uses
  // rather than hard-coding it, so this guard cannot drift from the value in
  // src/index.css when the design moves within its stated 14-22px range.
  const inset = Math.round(
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--island-inset')) || 0,
  );
  // The cap ACTUALLY IN FORCE, read off the element — not parsed from the
  // token, which is authored in rem and would need a unit guess here.
  const capPx = header ? Math.round(parseFloat(getComputedStyle(header).maxWidth) || 0) : 0;
  return {
    header: header ? contentLeft(header) : null,
    cap: capPx,
    islandInset: inset,
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

        // The relationship, not the number: page content and the header's
        // content row share one gutter and one cap, offset by the island
        // inset. A route that hand-rolls its own wrapper still fails here.
        expect(r.islandInset, 'no --island-inset token on :root').toBeGreaterThan(0);
        const offset = expectedHeaderOffset(width, r.cap as number, r.islandInset as number);
        for (const left of r.pages) {
          expect(
            Math.abs(left + offset - (r.header as number)),
            `${route} @${width}: content starts at ${left}, header at ${r.header} ` +
              `(island inset ${r.islandInset}, cap ${r.cap}, expected offset ${offset})`,
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
          // This block previously compared frame and header DIRECTLY, i.e. it
          // assumed an offset of zero — true only once the cap engages. It was
          // therefore failing at 390 and 1440 by exactly the inset while the
          // listing block above failed at 1920 by exactly the same amount, in
          // the other direction.
          const inset = Math.round(
            parseFloat(
              getComputedStyle(document.documentElement).getPropertyValue('--island-inset'),
            ) || 0,
          );
          const cap = header ? Math.round(parseFloat(getComputedStyle(header).maxWidth) || 0) : 0;
          return {
            inset,
            cap,
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
        const detailOffset = expectedHeaderOffset(width, r.cap as number, r.inset as number);
        expect(
          Math.abs((r.frame as number) + detailOffset - (r.header as number)),
          `${href} @${width}: content starts at ${r.frame}, header at ${r.header} ` +
            `(island inset ${r.inset}, cap ${r.cap}, expected offset ${detailOffset})`,
        ).toBeLessThanOrEqual(1);
        expect(r.overflow, `${href} @${width} scrolls horizontally`).toBeLessThanOrEqual(0);
      });
    }
  }
});

/**
 * Vertical density on a phone — the axis the invariant above does NOT measure.
 *
 * The alignment spec passed on `/cities` at 390px for the entire life of the
 * 2026-08 rebuild while the page was, in fact, unusable there: the sticky filter
 * band was 238px (28% of an 844px viewport, permanently) and the first result
 * card sat 1,271px down, a screen and a half of chrome before a single city.
 * Nothing was misaligned and nothing overflowed, so every automated gate was
 * green. A page can satisfy the whole layout contract and still be bad to use.
 *
 * Both budgets are RATIOS of the viewport, not pixel constants, so they survive
 * a change to the gutter ladder, the type scale or the test viewport itself —
 * the same reason the alignment check asserts a relationship rather than values.
 *
 * These are deliberately loose. They are not a design opinion about how tall a
 * masthead should be; they are a floor that catches "the chrome ate the page".
 */
/**
 * `/events` was excluded when this guard landed — it measured 1,789px / 2.12
 * screens to first content, worse than the `/cities` regression the guard was
 * written for, because a 527px editorial Guides rail sat between the hero and
 * the filters. That rail moved below the results, so the route is back in.
 */
const DENSITY_ROUTES = ['/cities', '/events', '/venues', '/marketplace', '/tags'];

/** Sticky chrome (site header + any sticky bar under it) may not exceed this
 *  share of the viewport. At 844px tall that is ~253px. */
const MAX_STICKY_RATIO = 0.3;
/** The first real content of the page must begin within this many viewports. */
const MAX_SCREENS_TO_CONTENT = 1.25;
/** A link into a detail page — the first thing on these routes that is content
 *  rather than chrome.
 *
 *  PER ROUTE, not one shared list. A shared list measures "the first card-like
 *  link anywhere", which is a different question from "where does this route's
 *  content begin". On 2026-08-16 the runner's geolocation put /events in its
 *  empty state — the chips read `Tonight 0 · This weekend 0 · Next 7 days 0`
 *  and not one event rendered — and the shared list still matched a link inside
 *  the editorial card that sits above the footer, 1,123px down. The route
 *  scored 1.33 screens and failed a guard about buried content, on a page that
 *  had no content to bury.
 *
 *  The empty-state skip below (`firstTop !== null`) is what should have fired.
 *  It cannot while a link belonging to some other route's content still
 *  matches, so the fix belongs in the selector, not in the skip. */
const CARD_LINK_SELECTORS: Record<string, string> = {
  '/cities': 'main a[href*="/city/"]',
  '/events': 'main a[href*="/events/"]',
  '/venues': 'main a[href*="/venues/"]',
  '/marketplace': 'main a[href*="/marketplace/"]',
  '/tags': 'main a[href*="/tags/"]',
};

test.describe('page layout — mobile density', () => {
  for (const route of DENSITY_ROUTES) {
    test(`${route} does not bury its content under chrome at 390px`, async ({ page }) => {
      // A route added to DENSITY_ROUTES without its own selector would otherwise
      // measure nothing and skip silently — green, asserting zero.
      const cardSelector = CARD_LINK_SELECTORS[route];
      expect(cardSelector, `${route} has no entry in CARD_LINK_SELECTORS`).toBeTruthy();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      // Wait for the CARD to exist rather than sleeping a fixed interval. These
      // routes are data-driven, and a fixed wait measures whatever happens to be
      // on screen when it elapses — which made this assertion swing between 0.9
      // and 2.4 screens on the same build depending on how warm the dev server
      // was. Measuring a layout before its content exists is measuring nothing.
      await page
        .locator(cardSelector)
        .first()
        .waitFor({ state: 'attached', timeout: 25_000 })
        .catch(() => {});
      await page.waitForTimeout(400);

      // Measure first content BEFORE scrolling — it is a document position.
      const firstTop = await page.evaluate((SEL) => {
        const first = document.querySelector(SEL);
        return first ? Math.round(first.getBoundingClientRect().top + window.scrollY) : null;
      }, cardSelector);

      // Then scroll, and measure sticky chrome THERE. A bar that sits below the
      // fold at rest is not pinned yet, so measuring at scrollY=0 reports 0 for
      // it — which is exactly how the first version of this guard missed the
      // 235px sticky result bar on /events while it was written to catch that
      // very defect. Sticky cost is a property of the SCROLLED page.
      await page.evaluate(() => window.scrollTo(0, 1500));
      await page.waitForTimeout(300);

      const r = await page.evaluate(() => {
        const vh = window.innerHeight;
        // Every element that is pinned to the top and therefore costs its height
        // on EVERY screen, not just the first.
        const sticky = Array.from(document.querySelectorAll('body *')).filter((n) => {
          const cs = getComputedStyle(n);
          if (cs.position !== 'sticky' && cs.position !== 'fixed') return false;
          const rect = n.getBoundingClientRect();
          // Top-pinned only: a bottom nav or a floating action button is not
          // chrome the reader scrolls past.
          //
          // The threshold is a FRACTION of the viewport, not `top <= 1`. Chrome
          // stacks: a result bar pinned under a 60px header sits at top: 60, so
          // an exact-zero test excludes the very thing being measured — that is
          // how the first version of this guard scored /events at 60px while a
          // 235px sticky bar sat right under the header.
          return rect.height > 0 && rect.top <= vh * 0.2 && rect.bottom < vh * 0.6;
        });
        // Outermost only, so a sticky child inside a sticky bar is not counted twice.
        const outer = sticky.filter((n) => !sticky.some((o) => o !== n && o.contains(n)));
        const stickyPx = outer.reduce((sum, n) => sum + n.getBoundingClientRect().height, 0);

        // First content: the first card-like link into a detail page.
        return { vh, stickyPx: Math.round(stickyPx) };
      });

      expect(
        r.stickyPx / r.vh,
        `${route}: sticky chrome is ${r.stickyPx}px of a ${r.vh}px viewport`,
      ).toBeLessThanOrEqual(MAX_STICKY_RATIO);

      // A route that renders no card links (empty state, cold cache) proves
      // nothing here — skip rather than fail on absence.
      if (firstTop !== null) {
        expect(
          firstTop / r.vh,
          `${route}: first content is ${firstTop}px down (${(firstTop / r.vh).toFixed(2)} screens)`,
        ).toBeLessThanOrEqual(MAX_SCREENS_TO_CONTENT);
      }
    });
  }
});

/**
 * A page's sticky bar must clear the header — the thing STICKY_UNDER_HEADER
 * exists to guarantee and nothing asserted.
 *
 * The constant was `top-[60px] md:top-[64px]`, measured against a header
 * welded to `top: 0`. When the chrome became a floating island (#2874) the
 * header's underside moved down by `--island-inset` and the constant did not
 * follow, so every bar it positions — RouteStrip, SectionNav, StickyLetterBar,
 * the /events and /cities filter bars — pinned INSIDE the header: 10px behind
 * the paper bar at 390px, 18px behind the ink flood at 1440px, measured on
 * prod 2026-08-21. The alignment block above could not see it; it reads
 * horizontal edges at rest, and this is a vertical failure that only exists
 * once the page has scrolled.
 *
 * Asserted as a RELATIONSHIP (bar top >= header bottom), so re-tuning the
 * island inset or the bar's own height keeps it meaningful. The scroll is what
 * makes it real: the header must be in its PINNED state, which on desktop is
 * the compact one-line collapse, and both bars must have detached.
 */
/**
 * Every page-level sticky element — control bands AND sidebar rails.
 *
 * `/events` and `/cities` were the whole list when this block was written to
 * catch the island drift, and that scope hid four more instances of the very
 * same bug: `/help`'s emergency-numbers spine at `top-16` (18px behind),
 * `/tags`' category rail at `top-[76px]` (6px), `/privacy`'s TOC rail at
 * `top-20` (2px), and `TripWorkspace`'s bar at `top-16`. All four were
 * literals measured against the pre-island 64px header, all confirmed on prod
 * 2026-08-21. A guard is only as broad as its route list.
 *
 * Asserted on the CSS OFFSET, not on a measured rect after scrolling — which
 * is what the first version did, and it cannot be extended to these routes:
 * a sticky element is RELEASED when its container's bottom passes, so
 * `/privacy`'s RouteStrip legitimately measures `top: 0` mid-scroll and a
 * rect-based check fails it for no defect. The offset is static, needs no
 * scroll, and is the thing actually under test.
 */
const STICKY_BAR_ROUTES = ['/events', '/cities', '/help', '/tags', '/privacy', '/news'];

test.describe('page layout — sticky elements clear the header', () => {
  for (const width of [390, 1440]) {
    for (const route of STICKY_BAR_ROUTES) {
      test(`${route} pins below the header at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        await page.waitForLoadState('domcontentloaded');
        // Wait for the thing under test, never for a guessed duration. These
        // bars render after their data resolves: a flat 1200ms reported
        // `/tags` @390 as having NO page-level sticky when it has two, i.e. an
        // absence assertion firing on a slow render rather than on a defect.
        await page.waitForFunction(
          () =>
            Array.from(document.querySelectorAll('main *')).some(
              (n) => getComputedStyle(n).position === 'sticky',
            ),
          undefined,
          { timeout: 15_000 },
        );

        const r = await page.evaluate(() => {
          // Resolve --header-pinned-bottom through a probe: it is a calc(), so
          // reading the raw custom property gives "calc(22px + 60px)".
          const probe = document.createElement('div');
          probe.style.cssText = 'position:fixed;visibility:hidden;top:var(--header-pinned-bottom)';
          document.body.appendChild(probe);
          const pinned = Math.round(parseFloat(getComputedStyle(probe).top) || 0);
          probe.remove();

          // Page-level only. A sticky row inside its own scroll container (an
          // admin table head, a horizontally-scrolling rail) pins relative to
          // THAT container, and the page header is none of its business.
          const inOwnScroller = (n: Element) => {
            for (let p = n.parentElement; p && p !== document.body; p = p.parentElement) {
              const o = getComputedStyle(p);
              if (/(auto|scroll)/.test(o.overflowY + o.overflowX)) return true;
            }
            return false;
          };

          const sticky = Array.from(document.querySelectorAll('main *')).filter(
            (n) => getComputedStyle(n).position === 'sticky' && !inOwnScroller(n),
          );
          return {
            pinned,
            offsets: sticky.map((n) => ({
              top: Math.round(parseFloat(getComputedStyle(n).top) || 0),
              cls: (n.className || '').toString().slice(0, 60),
            })),
          };
        });

        expect(r.pinned, 'could not resolve --header-pinned-bottom').toBeGreaterThan(0);
        // Absence proves nothing — a route listed here with no sticky element
        // has lost the thing this test is about, which is itself a regression.
        expect(r.offsets.length, `${route} @${width}: no page-level sticky`).toBeGreaterThan(0);
        for (const { top, cls } of r.offsets) {
          expect(
            top,
            `${route} @${width}: sticky pins at ${top}, header ends at ${r.pinned} — ${cls}`,
          ).toBeGreaterThanOrEqual(r.pinned);
        }
      });
    }
  }
});

/**
 * Bleeding out and re-padding is a ROUND TRIP: a bled bar's row must land back
 * on its own parent's content box.
 *
 * These bars use `PAGE_BLEED` to push their rule to the container edge and then
 * re-apply `PAGE_GUTTER` inside so the items line back up. The trap is adding a
 * *second* cap to that inner row: `SectionNav` carried `max-w-screen-2xl`
 * (1536) while the bleed had landed it on the page container's 1600 box, so
 * `mx-auto` split the 64px difference into 32px of margin per side and the tabs
 * sat 32px right of the cards below — measured on prod at 1990px, tabs at 259
 * vs content at 227. Exactly zero below 1536px, which is why it survived: the
 * indent is `max(0, (min(1600, vw) - 1536) / 2)`, so only large desktops saw it.
 *
 * **Against the bar's PARENT, not against the page column.** The first version
 * of this compared every row to the page container and failed `/tags` at 288
 * and 448 — because that bar is not page-level at all: it sits inside the
 * glossary's two-column body, bleeding against a column whose content starts at
 * 448. Its row landing at 448 is correct. Asserting the round trip is the
 * invariant that holds for a bar at any nesting depth, and it still catches
 * SectionNav, whose parent IS the page container.
 *
 * Measured on the row's own content box rather than its first item, because
 * these rows are `overflow-x-auto` and SectionNav scrolls its active tab into
 * view — a first-item assertion would be a coin flip on which tab is active.
 */
const BLED_BAR_ROUTES = ['/going-out', '/tags'];

test.describe('page layout — bled bars align with the content column', () => {
  for (const width of [1440, 1920]) {
    for (const route of BLED_BAR_ROUTES) {
      test(`${route} aligns its sticky bar row at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        await page.waitForLoadState('domcontentloaded');
        // These bars render after their data resolves — /tags' filter spine
        // took longer than a flat 600ms wait and the run reported it as ABSENT,
        // which the absence assertion below then read as a regression. Wait for
        // the thing being measured, never for a guessed duration.
        await page
          .locator('main [class*="top-[var(--header-pinned-bottom)]"]')
          .first()
          .waitFor({ state: 'attached', timeout: 15_000 });

        const r = await page.evaluate(() => {
          const cs = (n: Element, k: string) =>
            Math.round(parseFloat(getComputedStyle(n)[k as never]) || 0);
          const contentLeft = (n: Element) =>
            Math.round(n.getBoundingClientRect().left) + cs(n, 'paddingLeft');

          // BLED bars only, identified by a NEGATIVE LEFT MARGIN — which is
          // literally what PAGE_BLEED is (`-mx-4 sm:-mx-6 md:-mx-8`) and so
          // cannot be confused by anything else on the page. /tags also carries
          // a sticky SIDEBAR rail sitting inside the column, whose first child
          // is not a bled row and would report a bogus misalignment.
          //
          // Comparing the bar's left against `min(pageLefts)` was tried and is
          // WRONG: /tags renders a full-bleed ink band, so the minimum page-
          // container edge already equals the bar's own left and a `<` test
          // excluded the very bar it was meant to select — reported as "no bled
          // sticky bar row", i.e. as an absence rather than as a bad filter.
          const bars = Array.from(document.querySelectorAll('main *')).filter(
            (n) =>
              getComputedStyle(n).position === 'sticky' &&
              (parseFloat(getComputedStyle(n).marginLeft) || 0) < 0,
          );

          // The row is the bar's FIRST ELEMENT CHILD, not a `ul, ol` query:
          // SectionNav and RouteStrip use a list, TagsFilterSpine a plain div.
          return bars
            .filter((b) => b.firstElementChild && b.parentElement)
            .map((b) => ({
              parent: contentLeft(b.parentElement as Element),
              row: contentLeft(b.firstElementChild as Element),
            }));
        });

        // Absence is a regression, not a skip — the route is listed BECAUSE it
        // has such a bar.
        expect(r.length, `${route} @${width}: no bled sticky bar row`).toBeGreaterThan(0);
        for (const { parent, row } of r) {
          expect(
            row,
            `${route} @${width}: bar row content at ${row}, its container's content at ${parent}`,
          ).toBe(parent);
        }
      });
    }
  }
});
