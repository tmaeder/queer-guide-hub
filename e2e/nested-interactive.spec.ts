import { test, expect } from '@playwright/test';

/**
 * Nested interactive content (`<a>` or `<button>` inside an `<a>`) is invalid
 * HTML. Browsers un-nest it unpredictably and it breaks keyboard / screen-reader
 * navigation — axe reports it as `nested-interactive` (serious, WCAG 4.1.2).
 *
 * The shared cards (EventCard, VenueCard, GeoCard, NewsCard) used to wrap the
 * whole card in a `LocalizedLink`, putting their tag chips, favorite / add-to-trip
 * / check-in / share buttons inside that anchor. They now render the card link as
 * an absolutely-positioned overlay *sibling* instead. This spec is the guard.
 */

// Route transitions fade opacity 0->1; settle the DOM before querying.
test.use({ reducedMotion: 'reduce' });

// Every route below renders at least one of the four cards; waiting on a card
// link (rather than `networkidle`) keeps this deterministic — /city/berlin polls
// and never reaches network idle.
const CARD_LINK =
  'a[href*="/venues/"], a[href*="/events/"], a[href*="/news/"], a[href*="/city/"], a[href*="/country/"]';

const ROUTES = ['/city/berlin', '/events', '/venues', '/news', '/places'];

test.describe('No nested interactive elements', () => {
  // /city/berlin needs ~20s to paint its first card even unloaded, and this
  // suite runs alongside others — give the wait real headroom.
  test.setTimeout(180_000);

  for (const route of ROUTES) {
    test(`${route} has no interactive element nested inside an <a>`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('main', { timeout: 30_000 });
      await page.waitForSelector(CARD_LINK, { timeout: 120_000 });
      // Let the rest of the lazy sections hydrate before snapshotting the DOM.
      await page.waitForTimeout(3_000);

      const nested = await page.$$eval(
        'a a, a button, a [role="button"]',
        (els) => els.map((el) => el.outerHTML.slice(0, 160)),
      );
      expect(nested, `Nested interactive elements on ${route}:\n${nested.join('\n')}`).toEqual([]);
    });
  }
});
