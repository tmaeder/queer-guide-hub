import { test, expect } from '@playwright/test';

// The /venues featured hero is preloaded by the edge (functions/_lib/
// venuesHeroPreload.ts). The edge picks the venue, preloads its photo, and names
// it in <meta name="qg-venues-hero">; VenuesHero opens on that venue.
//
// POST-DEPLOY VERIFICATION, not a PR gate: the `Critical paths` PR job serves
// the branch through `vite preview`, which runs no Pages Functions, so there is
// no preload there and every test below self-skips. The PR gate is
// src/components/venues/__tests__/venuesHeroPreload.test.tsx, which compares the
// preload against the rendered component.
//
// img.queer.guide refuses images to a localhost or pages.dev Referer, so the
// "one request" check only means something against https://queer.guide.

const META_RE = /<meta name="qg-venues-hero" content="([^"]+)">/;
const PRELOAD_RE =
  /<link rel="preload" as="image" fetchpriority="high" imagesrcset="([^"]+)" imagesizes="([^"]+)"/;

test.describe('/venues hero preload', () => {
  test('the document preloads the hero and names its venue', async ({ request }) => {
    const html = await (await request.get('/venues')).text();
    const meta = html.match(META_RE);
    test.skip(!meta, 'no edge preload on this origin (no Pages Functions)');
    const preload = html.match(PRELOAD_RE);
    expect(preload, 'a venue was named but no image preload was emitted').not.toBeNull();
    expect(preload![2]).toBe('(min-width: 768px) 60vw, 100vw');
    // Ahead of the stylesheet, so it is discovered first…
    expect(html.indexOf(preload![0])).toBeLessThan(html.indexOf('rel="stylesheet"'));
    // …but after the viewport meta. Before it, mobile Chrome evaluates
    // `100vw` against its 980px default and preloads a bigger candidate than
    // the <img> then asks for, so the hero downloads twice.
    const viewport = html.indexOf('name="viewport"');
    expect(viewport).toBeGreaterThan(-1);
    expect(html.indexOf(preload![0])).toBeGreaterThan(viewport);
  });

  test('a filtered listing hides the hero, so it gets no preload', async ({ request }) => {
    const plain = await (await request.get('/venues')).text();
    test.skip(!META_RE.test(plain), 'no edge preload on this origin (no Pages Functions)');
    // Positive control above: the plain hub does get one.
    const filtered = await (await request.get('/venues?category=bar')).text();
    expect(filtered).not.toMatch(META_RE);
    expect(filtered).not.toMatch(PRELOAD_RE);
  });

  test('the page opens on the preloaded venue and fetches its photo once', async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 1.75,
      // NOT isMobile. Playwright's headless shell does not apply the viewport
      // meta to the preload scanner under mobile emulation, so it preloads at
      // the 980px default (1200w) while the <img> asks for 800w — a test-browser
      // artifact: full Chrome (what Lighthouse runs) downloads 800w once with
      // the preload placed after the viewport meta. Without isMobile the layout
      // viewport is 412px on both sides, which is what this test is for: the
      // preload's srcset/sizes agree with the <img>'s. That the preload sits
      // after the viewport meta is asserted structurally in the first test.
      hasTouch: true,
      // No autoplay, so the first slide stays on screen while we read it.
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    // Count NETWORK fetches, not request events. Chrome raises a second
    // request event when the <img> takes the preloaded bytes back out of the
    // HTTP cache (fromDiskCache, 0 bytes) — that is the preload working, not a
    // second download. CDP is the only place that says which one it was:
    // img.queer.guide sends no Timing-Allow-Origin, so Resource Timing can't.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    const fetches = new Map<string, { url: string; cached: boolean }>();
    cdp.on('Network.requestWillBeSent', (e) => {
      if (e.type === 'Image') fetches.set(e.requestId, { url: e.request.url, cached: false });
    });
    cdp.on('Network.requestServedFromCache', (e) => {
      const f = fetches.get(e.requestId);
      if (f) f.cached = true;
    });
    cdp.on('Network.responseReceived', (e) => {
      const f = fetches.get(e.requestId);
      if (f && (e.response.fromDiskCache || e.response.fromPrefetchCache)) f.cached = true;
    });
    const response = await page.goto('/venues', { waitUntil: 'domcontentloaded' });
    const html = (await response?.text()) ?? '';
    const venueId = html.match(META_RE)?.[1];
    test.skip(!venueId, 'no edge preload on this origin (no Pages Functions)');
    const srcset = html.match(PRELOAD_RE)![1];
    const asset = srcset.match(/\/(https:\/\/[^ ]+) \d+w/)![1];

    const heroImg = page
      .locator('section[aria-roledescription="carousel"], section[aria-label]')
      .locator('a[href*="/venues/"] img')
      .first();
    await expect(heroImg).toBeVisible({ timeout: 30_000 });
    // The hero <img> asks for the same srcset the document preloaded…
    expect(await heroImg.getAttribute('srcset')).toBe(srcset);
    await expect
      .poll(() => heroImg.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0))
      .toBe(true);
    // …so the photo is downloaded once, not once for the preload and again
    // for the image.
    const forHero = [...fetches.values()].filter((f) => f.url.includes(asset));
    // Positive control: the hero was requested at all, so an empty list can't
    // pass the "once" check below.
    expect(forHero.length).toBeGreaterThanOrEqual(1);
    const downloads = forHero.filter((f) => !f.cached).map((f) => f.url);
    if (new URL(baseURL ?? 'https://queer.guide').hostname === 'queer.guide') {
      expect(downloads).toHaveLength(1);
    }
    await context.close();
  });
});
