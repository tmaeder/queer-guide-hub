import { test, expect } from '@playwright/test';

/**
 * Nested interactive content (`<a>` or `<button>` inside an `<a>`) is invalid
 * HTML. Browsers un-nest it unpredictably and it breaks keyboard / screen-reader
 * navigation — axe reports it as `nested-interactive` (serious, WCAG 4.1.2).
 *
 * Two shapes produce it in this codebase, and this spec guards both:
 *
 *  1. A card that wraps its whole body in a `LocalizedLink`, putting its tag
 *     chips and favorite / add-to-trip / check-in / share buttons inside that
 *     anchor. Those cards now render the card link as an absolutely-positioned
 *     overlay *sibling* (EventCard, VenueCard, GeoCard, NewsCard, EntityCard,
 *     UserDirectoryGrid).
 *  2. `<LocalizedLink><Button>…</Button></LocalizedLink>`, which nests a real
 *     `<button>` inside the `<a>`. Those sites now use `<Button asChild>` with
 *     the link as its child.
 */

// Route transitions fade opacity 0->1; settle the DOM before querying.
test.use({ reducedMotion: 'reduce' });

const NESTED_SELECTOR = 'a a, a button, a [role="button"]';

// Routes that render at least one of the shared cards. Waiting on a card link
// (rather than `networkidle`) keeps this deterministic — /city/berlin polls and
// never reaches network idle.
const CARD_LINK =
  'a[href*="/venues/"], a[href*="/events/"], a[href*="/news/"], a[href*="/city/"], a[href*="/country/"]';

const CARD_ROUTES = ['/city/berlin', '/events', '/venues', '/news', '/places'];

// Routes covering the converted `<Button asChild>` sites. These render static
// chrome rather than data-driven cards, so they only need `main` to be present.
//   /about                    — About.tsx (Submit a venue / Support us)
//   /marketplace/categories   — MarketplaceCategories.tsx (All marketplace)
//   /marketplace/share        — MarketplaceShare.tsx (Marketplace)
// The `__no-such-*__` slugs deliberately hit each page's not-found branch,
// which is where the "Back to …" buttons live.
//   /venues/…      — EntityDetail.tsx      /events/…      — EventDetail.tsx
//   /news/…        — NewsDetail.tsx        /marketplace/… — MarketplaceItemDetail.tsx
//   /marketplace/category/… — MarketplaceCategory.tsx
const STATIC_ROUTES = [
  '/about',
  '/marketplace/categories',
  '/marketplace/share',
  '/venues/__no-such-venue__',
  '/events/__no-such-event__',
  '/news/__no-such-article__',
  '/marketplace/__no-such-item__',
  '/marketplace/category/__no-such-category__',
];

async function expectNoNestedInteractive(page: import('@playwright/test').Page, route: string) {
  const nested = await page.$$eval(NESTED_SELECTOR, (els) =>
    els.map((el) => el.outerHTML.slice(0, 160)),
  );
  expect(nested, `Nested interactive elements on ${route}:\n${nested.join('\n')}`).toEqual([]);
}

test.describe('No nested interactive elements', () => {
  // /city/berlin needs ~20s to paint its first card even unloaded, and this
  // suite runs alongside others — give the wait real headroom.
  test.setTimeout(180_000);

  for (const route of CARD_ROUTES) {
    test(`${route} has no interactive element nested inside an <a>`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('main', { timeout: 30_000 });
      await page.waitForSelector(CARD_LINK, { timeout: 120_000 });
      // Let the rest of the lazy sections hydrate before snapshotting the DOM.
      await page.waitForTimeout(3_000);

      await expectNoNestedInteractive(page, route);
    });
  }

  for (const route of STATIC_ROUTES) {
    test(`${route} has no interactive element nested inside an <a>`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('main', { timeout: 30_000 });
      // The not-found branches render only after their query resolves.
      await page.waitForTimeout(5_000);

      await expectNoNestedInteractive(page, route);
    });
  }
});
