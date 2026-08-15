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

// `/cities` was missing here until the 2026-08 rebuild. It was safe by accident —
// its rows were a single link with no interactive children — but the redesigned
// card is a `relative` article with a sibling overlay link, which is exactly the
// shape that produces `a button` the moment someone adds a favourite or compare
// control to it.
const CARD_ROUTES = ['/city/berlin', '/cities', '/events', '/venues', '/news', '/places'];

// Routes covering the converted `<Button asChild>` sites. These render static
// chrome rather than data-driven cards, so they only need `main` to be present.
//   /about                  — About.tsx (Submit a venue / Support us)
//   /marketplace/categories — MarketplaceCategories.tsx (All marketplace)
//   /marketplace/share      — MarketplaceShare.tsx (Marketplace)
//   /community/members      — UserDirectoryGrid.tsx (card overlay link)
// The `__no-such-*__` slugs deliberately hit each page's not-found branch,
// which is where the "Back to …" buttons live:
//   /venues/…            — EntityDetail.tsx   /events/…  — EventDetail.tsx
//   /news/…              — NewsDetail.tsx     /marketplace/… — MarketplaceItemDetail.tsx
//   /marketplace/brands/… — MarketplaceBrand.tsx
// Not covered here: MarketplaceCategory and MarketplaceMerchant derive their
// subject from the URL param, so an arbitrary slug renders an empty-but-valid
// page instead of the not-found branch — there is no anon-reachable URL that
// exercises those two buttons. The unit-level guards still cover them.
const STATIC_ROUTES = [
  // The homepage hero carries the primary navigation as clickable subway
  // stations (IntentMap), so the site's most-used links belong under this
  // guard — they were unguarded here while the intent rail was a plain grid.
  '/',
  '/about',
  '/marketplace/categories',
  '/marketplace/share',
  '/community/members',
  '/venues/__no-such-venue__',
  '/events/__no-such-event__',
  '/news/__no-such-article__',
  '/marketplace/__no-such-item__',
  '/marketplace/brands/__no-such-brand__',
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
      // 60s, not 30s: against prod the FIRST route of a run pays a cold
      // Cloudflare edge miss. /city/berlin timed out at 30s waiting for `main`
      // on a real run, then passed in 6.8s on an immediate re-run.
      await page.waitForSelector('main', { timeout: 60_000 });
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
      // The not-found branches render only after their query resolves, and the
      // gated-detail fallback adds a second round trip on top — 5s was not
      // enough for /venues locally.
      await page.waitForTimeout(10_000);

      await expectNoNestedInteractive(page, route);
    });
  }
});
