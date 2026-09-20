import { test, expect } from '@playwright/test';

/**
 * Maker pages must not be titled after a factory, a compliance firm or a shop's
 * own store chrome.
 *
 * Since #3839 every approved brand row is advertised in `sitemap-brands.xml` and
 * `brandDetail` in `functions/_lib/detail.ts` renders `display_name` into the
 * `<title>`, the `<h1>` and the Brand JSON-LD — so `marketplace_brands.
 * display_name` became a public page title Google is invited to crawl. 49 of
 * those titles were the feed's `vendor` field holding something that is not a
 * brand. Measured on prod 2026-09-19:
 *
 *   * `/marketplace/brands/biorius` published a maker page for BIORIUS, a
 *     cosmetics regulatory-compliance firm that sells nothing. All 26 of its
 *     listings are titled `Shunga Erotic Art - …`; it appears because GPSR
 *     requires an EU "responsible person" and ohmyfantasy.com maps that party
 *     into `vendor`.
 *   * `/marketplace/brands/hk-nalone-electronic-technology-co-ltd` published a
 *     Chinese factory's legal name over 30 listings titled `Nalone - …`.
 *   * `/marketplace/brands/1979-sas-teil-der-marc-dorcel-group` published a
 *     French holding company over 5 listings titled `DORCEL - …`.
 *   * `/marketplace/brands/super-gay-underwear-official-online-store` published
 *     a title containing TWO pipes, because the brand string carried the shop's
 *     `| Official Online Store` and `|` is also this site's own title separator.
 *
 * ── WHY THE SLUGS STILL LOOK WRONG, AND WHY THAT IS THE POINT ──
 * `20260919193550` renamed `display_name` ONLY. `brand_key` is GENERATED over
 * `marketplace_listings.brand` and `slug` derives from `brand_key`, so a re-key
 * moves the URL — and there is no brand slug-redirect table, which would make it
 * a hard 404 on a URL this very sitemap advertises. So
 * `/marketplace/brands/hk-nalone-electronic-technology-co-ltd` correctly renders
 * "Nalone" and keeps its ugly path. An ugly URL on a correct page beats a pretty
 * URL that 404s. These tests assert exactly that pairing, so a future "tidy-up"
 * that moves the slugs breaks here rather than in Search Console.
 *
 * ── EVERY ABSENCE CHECK CARRIES A PRESENCE CONTROL ──
 * Same discipline as `marketplace-makers-crawler.spec.ts`. "No maker page is
 * titled BIORIUS" passes just as happily when the route stopped resolving, when
 * the brand RPC returns nothing for anyone, or when the sitemap went empty — so
 * the sitemap is bounded from BOTH sides, the renamed pages must render their new
 * title positively, and the rows a human deliberately did NOT rename must still
 * be there. Without that last group a corpus-wide wipe would look like success.
 *
 * Prod-shaped on purpose: these names are only correct because prod's data says
 * so, and the PR job's local `vite preview` runs no Pages Functions, so there is
 * no head to inject there.
 */

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/**
 * Renamed by `20260919193550`. The slug is deliberately unchanged, so each entry
 * pins "old URL, new title" — the whole shape of the fix.
 */
const RENAMED = [
  { slug: 'biorius', title: 'Shunga Erotic Art', wasCalled: 'BIORIUS' },
  { slug: 'hk-nalone-electronic-technology-co-ltd', title: 'Nalone', wasCalled: 'HK Nalone' },
  { slug: '1979-sas-teil-der-marc-dorcel-group', title: 'DORCEL', wasCalled: '1979 SAS' },
  { slug: 'mapa-gmbh', title: 'Billy Boy', wasCalled: 'MAPA GmbH' },
  { slug: 'sarl-rolling-skulls', title: 'CUT4MEN', wasCalled: 'SARL Rolling Skulls' },
  { slug: 'playful-toys-inc', title: 'B Swish', wasCalled: 'Playful Toys' },
  { slug: 'blanche-industries-gmbh', title: 'FRÖHLE', wasCalled: 'Blanche Industries' },
  { slug: 'salzgeber-co-medien-gmbh', title: 'Salzgeber', wasCalled: 'Medien GmbH' },
  { slug: 'svakom-europe-bv', title: 'SVAKOM', wasCalled: 'Svakom Europe BV' },
  { slug: 'mystim-gmbh', title: 'Mystim', wasCalled: 'Mystim GmbH' },
];

/**
 * Retired by `20260919194058`. Each was the SAME brand as an existing approved
 * row under a second `brand_key`, so the rename gave two sitemapped pages one
 * title. Their listings were re-keyed onto the canonical row and their slug was
 * NULLed — `get_marketplace_brand()` has no status filter, so rejecting alone
 * would have left the page live over an empty grid.
 *
 * `survivor` is the URL that MUST still work. Retirement without it is just
 * deletion, and this is the pair that proves nothing was lost.
 */
const CONSOLIDATED = [
  { retired: 'cssl-office-2', survivor: 'bathmate', title: 'Bathmate' },
  { retired: 'themis-arunterst-tzung-ug', survivor: 'lovense', title: 'Lovense' },
  { retired: 'kiiroo-b-v', survivor: 'kiiroo', title: 'Kiiroo' },
  { retired: 'shots-bv', survivor: 'shots', title: 'Shots' },
  { retired: 'shenzhen-j-l-technology-co-ltd', survivor: 'pretty-love', title: 'Pretty Love' },
  {
    retired: 'super-gay-underwear-official-online-store',
    survivor: 'super-gay-underwear',
    title: 'Super Gay Underwear',
  },
  { retired: 'secret-play-s-l', survivor: 'secret-play', title: 'Secret Play' },
  { retired: 'kheper-games-inc', survivor: 'kheper-games', title: 'Kheper Games' },
  {
    retired: 'creative-conceptions-kft',
    survivor: 'creative-conceptions',
    title: 'Creative Conceptions',
  },
];

/**
 * Rows a human read and deliberately LEFT ALONE, one per reason. These are the
 * control group: a sweep that renamed more than the reviewed 49 — or a corpus
 * wipe — fails here while every "the bad name is gone" assertion still passes.
 */
const DELIBERATELY_UNCHANGED = [
  { slug: 'spectrum-boutique', title: 'Spectrum Boutique' }, // multi-brand retailer; nothing to rename to
  { slug: 'atixo-gmbh', title: 'Atixo GmbH' }, // 2 real brands (Grey Velvet / Saresia)
  { slug: 'lubry-gmbh', title: 'Lubry GmbH' }, // 9 real brands
  { slug: 'vinergy-gmbh', title: 'Vinergy GmbH' }, // 2 real brands (Mister Size / Secura)
  { slug: 'westridge-laboratories-inc', title: 'Westridge Laboratories Inc' }, // brand is "ID"; under-reach
  { slug: 'rebelz-games', title: 'Rebelz Games' }, // title prefix "JOKE ITEMS" is a category
];

/** Strings that must not be a maker page title anywhere in the sitemap. */
const BANNED_TITLE_SUBSTRINGS = [
  'BIORIUS',
  'Official Online Store',
  'Co., Ltd',
  'Electronic Technology',
  'Pharmaceutica',
  'Werbefotogafie',
];

function titleOf(html: string): string {
  return html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '';
}

async function crawlerHtml(request: import('@playwright/test').APIRequestContext, path: string) {
  const res = await request.get(path, { headers: { 'User-Agent': BOT_UA } });
  expect(res.status(), `${path} should resolve`).toBe(200);
  return res.text();
}

test.describe('@smoke maker page titles are brands, not legal entities', () => {
  test('the brands sitemap is bounded from BOTH sides', async ({ request }) => {
    const res = await request.get('/sitemap-brands.xml');
    expect(res.status()).toBe(200);
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

    // A floor, because every "the bad name is gone" assertion below is also
    // satisfied by an empty sitemap. A ceiling, because the approved-only filter
    // is what keeps ~4,200 unreviewed rows out of it (the table holds ~5,142).
    expect(locs.length, 'brands sitemap floor').toBeGreaterThan(700);
    expect(locs.length, 'brands sitemap ceiling — approved filter may have been dropped').toBeLessThan(1200);

    // Every consolidated artifact slug must be gone: its brand row is rejected
    // AND its slug is NULL, and only the second of those keeps it out of here.
    for (const { retired, survivor } of CONSOLIDATED) {
      expect(
        locs.some((u) => u.endsWith(`/marketplace/brands/${retired}`)),
        `${retired} was consolidated away and must not be advertised`,
      ).toBe(false);
      expect(
        locs.some((u) => u.endsWith(`/marketplace/brands/${survivor}`)),
        `${survivor} is the surviving URL and MUST be advertised`,
      ).toBe(true);
    }

    // A renamed page keeps its slug, so it must still be advertised. This is the
    // assertion that fails if someone "tidies up" the slugs without a redirect
    // table.
    for (const { slug } of RENAMED) {
      expect(
        locs.some((u) => u.endsWith(`/marketplace/brands/${slug}`)),
        `${slug} was renamed, not retired — its URL must not move`,
      ).toBe(true);
    }
  });

  for (const { slug, title, wasCalled } of RENAMED) {
    test(`/${slug} is titled "${title}", not ${wasCalled}`, async ({ request }) => {
      const html = await crawlerHtml(request, `/marketplace/brands/${slug}`);

      expect(titleOf(html), `/marketplace/brands/${slug} title`).toBe(
        `${title} — Marketplace | Queer Guide`,
      );
      // The `<h1>` is a separate write in brandDetail, so a fix that only moved
      // the title would leave the legal entity as the page's heading.
      expect(html, `/marketplace/brands/${slug} h1`).toContain(`<h1>${title}</h1>`);
      // And the structured data, which is what actually reaches the knowledge graph.
      expect(html, `/marketplace/brands/${slug} JSON-LD`).toContain('"@type":"Brand"');
    });
  }

  for (const { retired, survivor, title } of CONSOLIDATED) {
    test(`/${retired} is retired and /${survivor} carries its listings`, async ({ request }) => {
      const gone = await crawlerHtml(request, `/marketplace/brands/${retired}`);
      // Only `missingBrandResult()` emits this, so it proves brandDetail RAN and
      // took the miss branch — rather than the route having quietly stopped
      // resolving, which a noindex check alone cannot distinguish.
      expect(titleOf(gone), `/marketplace/brands/${retired} should be a dead end`).toBe(
        'No maker here | Queer Guide',
      );
      expect(gone, `${retired} must not still publish a Brand entity`).not.toContain(
        '"@type":"Brand"',
      );

      // The paired half: the brand itself is still published, at ONE URL.
      const live = await crawlerHtml(request, `/marketplace/brands/${survivor}`);
      expect(titleOf(live), `/marketplace/brands/${survivor} title`).toBe(
        `${title} — Marketplace | Queer Guide`,
      );
      expect(live).toContain(`<h1>${title}</h1>`);
    });
  }

  for (const { slug, title } of DELIBERATELY_UNCHANGED) {
    test(`/${slug} is deliberately NOT renamed — the control`, async ({ request }) => {
      const html = await crawlerHtml(request, `/marketplace/brands/${slug}`);
      // These still read as a distributor or a legal entity, on purpose: each
      // spans several real brands, or its suffix is part of the real name, or the
      // only recoverable brand would be worse than what is there. If this ever
      // starts failing, either someone widened the sweep past the hand review or
      // the corpus was wiped — and both must be loud.
      expect(titleOf(html), `/marketplace/brands/${slug} was changed without review`).toBe(
        `${title} — Marketplace | Queer Guide`,
      );
    });
  }

  test('no advertised maker page is titled after a legal entity', async ({ request }) => {
    // Sampled rather than exhaustive: 862 crawler fetches would make this the
    // slowest spec in the suite. The sample is the renamed cohort plus the pages
    // most likely to regress, and the per-page tests above carry the detail.
    const sample = [
      ...RENAMED.map((r) => r.slug),
      ...CONSOLIDATED.map((c) => c.survivor),
      'shunga-erotic-art',
      'lovense',
    ];
    const seen = new Set<string>();
    for (const slug of sample) {
      if (seen.has(slug)) continue;
      seen.add(slug);
      const res = await request.get(`/marketplace/brands/${slug}`, {
        headers: { 'User-Agent': BOT_UA },
      });
      if (res.status() !== 200) continue;
      const title = titleOf(await res.text());
      for (const banned of BANNED_TITLE_SUBSTRINGS) {
        expect(title, `/marketplace/brands/${slug} still publishes "${banned}"`).not.toContain(
          banned,
        );
      }
      // The double-pipe defect: the brand string carried the site's own separator.
      expect(
        (title.match(/\|/g) ?? []).length,
        `/marketplace/brands/${slug} has more than one title separator`,
      ).toBeLessThanOrEqual(1);
    }
    // Control: the loop above passes trivially if every fetch 404s.
    expect(seen.size, 'sample collapsed').toBeGreaterThan(15);
  });
});
