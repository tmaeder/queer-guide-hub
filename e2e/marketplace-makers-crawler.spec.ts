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

function metaContent(html: string, property: string): string {
  const re = new RegExp(`<meta\\s+property="${property}"\\s+content="([^"]*)"`, 'i');
  return html.match(re)?.[1] ?? '';
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
        metaContent(html, 'og:url'),
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
  });
});
