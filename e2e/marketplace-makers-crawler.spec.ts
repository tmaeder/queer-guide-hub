import { test, expect } from '@playwright/test';

/**
 * Maker pages must have a crawler head of their own.
 *
 * `/marketplace/brands/:slug` had NO edge head injection: the route family was
 * never added to `DETAIL_ROUTE_RE` in `functions/_lib/detail.ts`, so every
 * maker URL — live and retired alike — answered a bot with the generic SPA
 * shell. Measured on prod 2026-09-19 with a Googlebot UA:
 *
 *   * /marketplace/brands/cherrykitten (a LIVE maker) and
 *     /marketplace/brands/12807-203758186 (a feed-ID artifact retired by
 *     `99100101143000`) returned byte-identical HTML apart from the CSP nonce.
 *   * Both carried `<title>Queer Guide — LGBTQ+ Safe Spaces…</title>` and an
 *     `og:url` pointing at the homepage.
 *   * The string `robots` appeared ZERO times on the retired one — a soft 404,
 *     which is worse for the index than a real 404 because it looks alive.
 *
 * `e2e/marketplace-makers-directory.spec.ts` asserts the same retirement and is
 * correct — but it drives a real browser, so it reads the DOM after `useMeta`
 * has run. The crawler surface and the SPA surface are two different documents
 * and only the SPA one was covered. This file is the other half.
 *
 * EVERY ABSENCE CHECK CARRIES A PRESENCE CONTROL, the same discipline as the
 * directory spec. "The retired maker is noindexed" passes just as well when the
 * whole route stopped resolving, when the brand RPC returns nothing for
 * everyone, or when someone noindexed `/marketplace/brands/*` wholesale — so
 * each retired case is paired with a live maker that must render its own title
 * and must NOT be noindexed.
 *
 * Prod-shaped on purpose (see the directory spec's header): the retired URLs
 * are only retired because prod's data says so, and the PR job's local
 * `vite preview` runs no Pages Functions at all, so there is no head to inject
 * there.
 */

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/** Feed-ID artifacts retired by `99100101143000`; their slugs were NULLed. */
const RETIRED_MAKERS = ['12807-203758186', '19868-001638740', '9781728209982'];

/** Real makers. Every absence assertion is paired against one of these. */
const LIVE_MAKERS = [
  { slug: 'cherrykitten', name: 'cherrykitten' },
  { slug: 'tomboyx', name: 'TomboyX' },
];

const ROBOTS_NOINDEX = /<meta\s+name="robots"\s+content="noindex,nofollow">/i;

function titleOf(html: string): string {
  return html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '';
}

/**
 * The LAST `og:<property>`, which is the one that counts.
 *
 * `functions/_middleware.ts` APPENDS its og/twitter tags to `<head>` rather
 * than replacing them ("duplicates from the source HTML are tolerated;
 * crawlers honor the *last* tag"), so every page carries at least two: the
 * static one baked into index.html and the injected one. Measured on prod
 * 2026-09-19, /tags/darkroom returns `og:url` twice — first
 * `https://queer.guide/` from the shell, then
 * `https://queer.guide/tags/darkroom` from the middleware.
 *
 * A first draft of this helper took the FIRST match and so read the homepage
 * URL on every page. It would have failed against a perfectly correct deploy
 * and been indistinguishable from the defect this file exists to catch. Found
 * by curling a page whose injection already works, not by reading the
 * middleware.
 */
function lastMetaContent(html: string, property: string): string {
  const re = new RegExp(`<meta\\s+property="${property}"\\s+content="([^"]*)"`, 'gi');
  const all = [...html.matchAll(re)];
  return all.length ? (all[all.length - 1][1] ?? '') : '';
}

async function crawlerHtml(request: import('@playwright/test').APIRequestContext, path: string) {
  const res = await request.get(path, { headers: { 'User-Agent': BOT_UA } });
  expect(res.status(), `${path} should resolve`).toBe(200);
  return res.text();
}

test.describe('@smoke maker pages have their own crawler head', () => {
  for (const slug of RETIRED_MAKERS) {
    test(`retired maker /${slug} is noindexed on the crawler surface`, async ({ request }) => {
      const html = await crawlerHtml(request, `/marketplace/brands/${slug}`);

      expect(html, `/marketplace/brands/${slug} is a soft 404 — no robots tag`).toMatch(
        ROBOTS_NOINDEX,
      );

      // The positive half. `noindex` alone would also pass if the whole route
      // had been deindexed, or if some unrelated branch of the middleware
      // emitted it. This title can only come from `missingBrandResult()`, so it
      // proves brandDetail ran AND took the miss branch.
      expect(titleOf(html), `/marketplace/brands/${slug} did not reach brandDetail`).toBe(
        'No maker here | Queer Guide',
      );

      // A retired maker must not publish the artifact's own name as a brand.
      expect(html, `/marketplace/brands/${slug} still names the feed ID`).not.toContain(
        `"@type":"Brand"`,
      );
    });
  }

  for (const { slug, name } of LIVE_MAKERS) {
    test(`live maker /${slug} renders its own head — the control`, async ({ request }) => {
      const html = await crawlerHtml(request, `/marketplace/brands/${slug}`);

      // The original defect, stated positively: the page had the site-wide
      // title and the homepage og:url.
      expect(titleOf(html), `/marketplace/brands/${slug} served the generic shell title`).toBe(
        `${name} — Marketplace | Queer Guide`,
      );
      expect(
        lastMetaContent(html, 'og:url'),
        `/marketplace/brands/${slug} canonicalises somewhere else`,
      ).toBe(`https://queer.guide/marketplace/brands/${slug}`);

      // A live maker must NOT be noindexed. Without this the retirement cases
      // above would all still pass if someone noindexed the whole route.
      expect(html, `/marketplace/brands/${slug} is noindexed`).not.toMatch(ROBOTS_NOINDEX);

      // Structured data proves the body branch ran, not just the head: the
      // JSON-LD and the injected <h1> are only emitted for a resolved brand.
      expect(html, `/marketplace/brands/${slug} emitted no Brand JSON-LD`).toContain(
        `"@type":"Brand"`,
      );
      expect(html, `/marketplace/brands/${slug} has no <h1> for a non-JS crawler`).toMatch(
        new RegExp(`<h1>${name}</h1>`, 'i'),
      );
    });
  }

  test('the maker index itself is untouched by the new detail route', async ({ request }) => {
    // `/marketplace/brands` must NOT match DETAIL_ROUTE_RE. If the slug group
    // ever went optional, the index would be treated as a detail route, miss,
    // and come back noindexed — silently deleting the whole directory from
    // search while every per-maker test above still passed.
    const html = await crawlerHtml(request, '/marketplace/brands');
    expect(html, '/marketplace/brands got swallowed by the detail route').not.toMatch(
      ROBOTS_NOINDEX,
    );
    expect(titleOf(html), '/marketplace/brands rendered a maker page').not.toBe(
      'No maker here | Queer Guide',
    );

    // The index had NO STATIC_ROUTE_META entry until 2026-09-19, so resolveMeta
    // — an exact match — fell through to DEFAULT_META and it served the
    // site-wide homepage title, competing with `/` on its own URL.
    expect(titleOf(html), '/marketplace/brands is back on the generic homepage title').not.toMatch(
      /LGBTQ\+ Safe Spaces, Events/i,
    );
  });
});

/**
 * Discovery. The heads above make a maker page worth crawling; these make it
 * FINDABLE. Kept in this file rather than a new one because the two halves fail
 * together: a sitemap that advertises pages with no head is the soft-404 farm
 * this whole effort removed, and a head nothing links to is an orphan.
 */
test.describe('@smoke maker pages are discoverable', () => {
  const RETIRED_IN_SITEMAP = RETIRED_MAKERS;

  test('sitemap-brands.xml lists the makers, and only the real ones', async ({ request }) => {
    const res = await request.get('/sitemap-brands.xml', { headers: { 'User-Agent': BOT_UA } });
    expect(res.status(), '/sitemap-brands.xml should resolve').toBe(200);
    const xml = await res.text();
    expect(res.headers()['content-type'] ?? '', 'not served as XML').toMatch(/xml/i);

    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

    // FLOOR. `sitemap-blog.xml` served a valid, EMPTY urlset at HTTP 200 for its
    // entire life because its floor was 0 — a 200 and well-formed XML prove
    // nothing on their own. 871 approved brands carry a slug (2026-09-19).
    expect(locs.length, 'sitemap-brands.xml collapsed').toBeGreaterThan(500);

    // CEILING, and it guards a different failure than the floor. The generator
    // filters `status=eq.approved`, but `fetchRows` reads with the SERVICE ROLE
    // and bypasses RLS, so dropping that filter would expose the whole ~5,142-row
    // table — the count would JUMP, which no floor can catch. It would also look
    // correct to anyone checking through the anon key, where RLS hides the
    // difference.
    expect(locs.length, 'the approved-only filter looks dropped — service role sees every row')
      .toBeLessThan(2000);

    for (const loc of locs.slice(0, 50)) {
      expect(loc, 'a non-maker URL leaked into the makers sitemap').toMatch(
        /^https:\/\/queer\.guide\/marketplace\/brands\/[^/]+$/,
      );
    }

    // Retired feed-ID artifacts were retired by NULLing their slug, so the
    // filter that keeps them out is `slug=not.is.null` — NOT the status filter,
    // which is a separate fact about the same rows.
    for (const slug of RETIRED_IN_SITEMAP) {
      expect(xml, `retired maker ${slug} is advertised in the sitemap`).not.toContain(
        `/marketplace/brands/${slug}<`,
      );
    }
  });

  test('the sitemap index links it, and a sampled URL really has a head', async ({ request }) => {
    const idx = await request.get('/sitemap.xml', { headers: { 'User-Agent': BOT_UA } });
    expect(idx.status()).toBe(200);
    expect(await idx.text(), 'sitemap-brands.xml is not linked from the index').toContain(
      'https://queer.guide/sitemap-brands.xml',
    );

    // The pairing that matters: take a URL the sitemap actually advertises and
    // prove it is not a soft 404. Asserting the sitemap alone would pass just as
    // well against the pre-2026-09-19 state, where every one of these URLs
    // returned the generic shell.
    const xml = await (
      await request.get('/sitemap-brands.xml', { headers: { 'User-Agent': BOT_UA } })
    ).text();
    const first = xml.match(/<loc>([^<]+)<\/loc>/)?.[1];
    expect(first, 'sitemap had no URL to sample').toBeTruthy();

    const page = await request.get(first as string, { headers: { 'User-Agent': BOT_UA } });
    expect(page.status(), `${first} is advertised but does not resolve`).toBe(200);
    const html = await page.text();
    expect(titleOf(html), `${first} is advertised but serves the generic shell`).toMatch(
      /— Marketplace \| Queer Guide$/,
    );
    expect(html, `${first} is advertised but noindexed`).not.toMatch(ROBOTS_NOINDEX);
  });

  test('the makers index is in the static sitemap', async ({ request }) => {
    // sitemap-static.xml is derived from Object.keys(STATIC_ROUTE_META), so this
    // is the observable consequence of the meta entry existing at all — and the
    // control for it, since the title assertion above would also pass if someone
    // hardcoded a title somewhere else.
    const res = await request.get('/sitemap-static.xml', { headers: { 'User-Agent': BOT_UA } });
    expect(res.status()).toBe(200);
    expect(await res.text(), '/marketplace/brands missing from sitemap-static.xml').toContain(
      'https://queer.guide/marketplace/brands<',
    );
  });
});
