import { test, expect } from '@playwright/test';

/**
 * Intent Router navigation.
 *
 * Guards the properties that made the old nav wrong, so they cannot come back:
 *
 *  1. The desktop row is single-sourced from INTENT_NAV. It used to be a
 *     hardcoded array in Header.tsx that had silently diverged from the config,
 *     leaving /venues and /people unreachable from desktop chrome.
 *  2. Every intent route resolves — unprefixed and locale-prefixed. A route
 *     declared outside the `/:locale?` parent renders NotFound under /de/.
 *  3. /shop redirects to /marketplace — bare, deep, and locale-prefixed. The
 *     public/_redirects 301 is unprefixed by design and inert off Cloudflare,
 *     so the router is the only layer covering /de/shop, and the only layer
 *     this run can see at all.
 *  4. Retiring /places preserves the locale prefix (LocalizedRedirect, not a
 *     bare Navigate, which would bounce /de/places to English).
 *  5. Crisis-adjacent intents stay animation-free.
 */

test.use({ reducedMotion: 'reduce' });

const INTENTS = [
  { label: 'Going out', href: '/going-out' },
  { label: 'Travelling', href: '/travel' },
  { label: 'Meet people', href: '/people' },
  { label: 'Rights', href: '/rights' },
  // /help, not /support: the Support intent was repointed in #2692 because the
  // two pages had the same source and /help is the superset (CMS hotline
  // corpus, per-country routes, QuickExit, EmergencyService JSON-LD). This row
  // asserted /support until 2026-08-10, i.e. it required the nav to link at a
  // redirect. /support itself still resolves and is still covered, by the
  // crisis-adjacent block at the bottom of this file.
  // The tags wiki, promoted to a top-level intent (2026-08-22). /tags is the
  // real glossary hub, no wrapper path.
  { label: 'Glossary', href: '/tags' },
  { label: 'Support', href: '/help' },
  // /marketplace, not /shop, and for the same reason as Support above: /shop
  // was /marketplace's twin — two of its three sections were duplicates of
  // blocks the marketplace landing already rendered — and /marketplace is the
  // superset. The label stays "Shop"; `to` and `labelKey` are independent.
  { label: 'Shop', href: '/marketplace' },
];

test.describe('desktop intent nav', () => {
  test.skip(({ isMobile }) => !!isMobile, 'desktop row is hidden below lg');

  test('renders exactly the seven intents in the primary landmark', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('header nav[aria-label="Primary"]');
    await expect(nav).toBeVisible();

    const links = nav.locator('a');
    await expect(links).toHaveCount(INTENTS.length);
    for (const [i, intent] of INTENTS.entries()) {
      await expect(links.nth(i)).toHaveText(intent.label);
      await expect(links.nth(i)).toHaveAttribute('href', new RegExp(`${intent.href}$`));
    }
  });

  test('marks the active intent with aria-current', async ({ page }) => {
    await page.goto('/rights');
    const nav = page.locator('header nav[aria-label="Primary"]');
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(nav.locator('a[aria-current="page"]')).toHaveText('Rights');
  });

  test('lights the owning intent on a browse route it claims', async ({ page }) => {
    // /venues belongs to Going out — this is the prefix matching that replaced
    // the old exact-equality check.
    await page.goto('/venues');
    const current = page.locator('header nav[aria-label="Primary"] a[aria-current="page"]');
    await expect(current).toHaveText('Going out');
  });
});

test.describe('homepage intent map', () => {
  const MAP = 'section[aria-labelledby="intent-map-heading"]';

  // Where the stations actually POINT. This is INTENTS[].href above plus
  // `/search` — the interchange, which is not an intent and so has no nav tab.
  const STATION_HREFS = [
    '/going-out',
    '/travel',
    '/people',
    '/search', // the interchange, where all four lines meet
    '/tags', // glossary — the 7th intent
    '/rights',
    '/help',
    '/marketplace',
  ];

  test('renders the seven intents plus the interchange as stations', async ({ page }) => {
    // The desktop visual snapshot masks `main section:first-of-type`, which
    // this section matches — so the screenshot does NOT guard the map. This
    // does. It also catches the CSS-only breakpoint split degrading into two
    // rendered layouts (fourteen anchors for seven destinations).
    await page.goto('/');
    const map = page.locator(MAP);
    await expect(map).toBeVisible();
    await expect(map.locator('li')).toHaveCount(STATION_HREFS.length);

    for (const href of STATION_HREFS) {
      await expect(map.locator(`a[href$="${href}"]`)).toHaveCount(1);
    }
    await expect(map.locator('a')).toHaveCount(STATION_HREFS.length);
  });

  test('claims no nav landmark of its own', async ({ page }) => {
    // The map lives inside SubwayHero's <header>, so a <nav> here would be a
    // second `header nav[...]` and turn every such locator in this file into
    // a Playwright strict-mode violation. It is a <section> named by its
    // visible <h2> precisely so it cannot collide.
    await page.goto('/');
    await expect(page.locator(`${MAP} nav`)).toHaveCount(0);
  });
});

test.describe('intent routes', () => {
  for (const intent of INTENTS) {
    test(`${intent.href} renders a page, not a 404`, async ({ page }) => {
      await page.goto(intent.href);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.locator('main')).not.toContainText('Page not found');
    });
  }

  test('resolves under a locale prefix', async ({ page }) => {
    await page.goto('/de/rights');
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('main')).not.toContainText('Page not found');
  });

  test('/shop is folded into the marketplace', async ({ page }) => {
    await page.goto('/shop');
    await expect(page).toHaveURL(/\/marketplace$/);
    await expect(page.locator('main h1')).toBeVisible();
  });

  test('/shop/<legacy> still redirects to the marketplace', async ({ page }) => {
    await page.goto('/shop/anything-legacy');
    await expect(page).toHaveURL(/\/marketplace/);
  });

  test('folding /shop keeps the locale prefix', async ({ page }) => {
    // The public/_redirects 301 is unprefixed on purpose — a `/:lang/shop` rule
    // would also match /marketplace/shop, a listing whose slug is "shop". So
    // LocalizedRedirect in the router is the only thing carrying this case, and
    // a bare <Navigate> would bounce a German reader to the English page.
    await page.goto('/de/shop');
    await expect(page).toHaveURL(/\/de\/marketplace$/);
  });

  test('/places is retired to the Travelling intent', async ({ page }) => {
    await page.goto('/places');
    await expect(page).toHaveURL(/\/travel$/);
  });

  test('retiring /places keeps the locale prefix', async ({ page }) => {
    await page.goto('/de/places');
    await expect(page).toHaveURL(/\/de\/travel$/);
  });
});

test.describe('honest coverage', () => {
  test('/rights states its coverage rather than implying completeness', async ({ page }) => {
    await page.goto('/rights');
    // This asserted /250 of 250/ until 2026-08-07, which the page produced by
    // rendering `{countries.length} of {countries.length}` — the same number
    // twice. A tautology cannot fail, so the test was green whatever the data
    // did, and it certified the exact defect it was written to prevent.
    // 239 of 250 rows carry a legal status; the other 11 are uninhabited
    // territories with no ILGA entry, and this number moves if that changes.
    await expect(page.locator('main')).toContainText(/239 of 250/);
  });

  test('/rights reaches every country, not just the first twelve per tier', async ({ page }) => {
    await page.goto('/rights');
    // The world list was `.slice(0, 12)` per tier with no expander, so only
    // 103 of 250 countries had any path from this page and — the lists being
    // alphabetical — everything past B was unreachable.
    const world = page.locator('#world');
    await expect(world.getByRole('link', { name: 'Germany', exact: true })).toBeVisible();
    await expect(world.getByRole('link', { name: 'Thailand', exact: true })).toBeVisible();
  });

  test('/going-out names the event window it fell back to', async ({ page }) => {
    await page.goto('/going-out');
    // The ladder always reports which rung produced the list, so a thin week
    // reads as thin coverage rather than as a dead scene.
    await expect(page.locator('main')).toContainText(
      /Showing events (tonight|this weekend|in the next \d+ days|soonest anywhere)|No upcoming events/,
    );
  });
});

test.describe('crisis-adjacent surfaces stay calm', () => {
  for (const path of ['/rights', '/support']) {
    test(`${path} renders no scroll-progress animation`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      // EditorialDetailLayout's progress bar is a fixed 2px full-width motion
      // div; disableProgress must remove it entirely on these routes.
      await expect(page.locator('div.fixed.top-0.left-0.right-0')).toHaveCount(0);
    });
  }
});
