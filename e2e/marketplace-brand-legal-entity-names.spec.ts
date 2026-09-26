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
 * moves the URL. So `/marketplace/brands/hk-nalone-electronic-technology-co-ltd`
 * correctly renders "Nalone" and keeps its ugly path. An ugly URL on a correct
 * page beats a pretty URL that 404s. These tests assert exactly that pairing, so a
 * future "tidy-up" that moves the slugs breaks here rather than in Search Console.
 *
 * That paragraph used to end "and there is no brand slug-redirect table, which
 * would make it a hard 404". `marketplace_brand_slug_redirects` exists as of
 * `99991790101222` and is populated as of `99991790384358`, so a moved slug now
 * 301s instead — see REDIRECTED below. The pairing above still holds for a row
 * that was renamed IN PLACE, which is the whole RENAMED cohort.
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
  // NOTE: `1979-sas-teil-der-marc-dorcel-group` and `svakom-europe-bv` were in
  // this list until 20260920083621 MERGED them into `dorcel` and `svakom` — the
  // rename had split those brands across two advertised pages. They moved to
  // MERGED below, where the retired URL is asserted to be a dead end. This spec
  // catching its own staleness is the mechanism working, not a flake.
  { slug: 'biorius', title: 'Shunga Erotic Art', wasCalled: 'BIORIUS' },
  { slug: 'hk-nalone-electronic-technology-co-ltd', title: 'Nalone', wasCalled: 'HK Nalone' },
  { slug: 'mapa-gmbh', title: 'Billy Boy', wasCalled: 'MAPA GmbH' },
  { slug: 'sarl-rolling-skulls', title: 'CUT4MEN', wasCalled: 'SARL Rolling Skulls' },
  { slug: 'playful-toys-inc', title: 'B Swish', wasCalled: 'Playful Toys' },
  { slug: 'blanche-industries-gmbh', title: 'FRÖHLE', wasCalled: 'Blanche Industries' },
  { slug: 'salzgeber-co-medien-gmbh', title: 'Salzgeber', wasCalled: 'Medien GmbH' },
  { slug: 'mystim-gmbh', title: 'Mystim', wasCalled: 'Mystim GmbH' },
];

/**
 * Consolidated duplicates: each was the SAME brand as an existing approved row
 * under a second `brand_key`, so the rename gave two sitemapped pages one title.
 * Their listings were re-keyed onto the canonical row and their slug was NULLed —
 * `get_marketplace_brand()` has no status filter, so rejecting alone would have
 * left the page live over an empty grid.
 *
 * ── THIS COHORT USED TO ASSERT A DEAD END, AND THAT WAS THE DEFECT ──
 * It was `CONSOLIDATED`, and it required each retired slug to answer 200 with
 * "No maker here" — a soft 404 beside a live page carrying the same brand's
 * listings. Reading the two docblocks that produced it, neither actually argued
 * the dead end was BETTER: `detail.ts` excluded brands from the redirect lookup
 * "because there is no `marketplace_brand_slug_redirects` table", and the
 * assertion here existed to prove `brandDetail` RAN. Both were mechanism limits,
 * not policy — the same stale-comment shape that left 144 merged tags as soft
 * 404s for months. `99991790384358` fills the table, so the answer is now the 301
 * that eleven other detail kinds already emit.
 *
 * The first two entries were filed under RENAMED until 2026-09-25 and are why
 * this spec was red on prod: `20260919193550` renamed them in place, and a LATER
 * pass consolidated them away. A cohort list is a claim about the data and decays
 * like any other.
 *
 * `to` is the URL that MUST work. A redirect into a dead page is worse than the
 * 404 it replaces, so both halves are asserted.
 *
 * The other ten rows of the 21-row backfill are asserted by that migration's own
 * postconditions rather than by twenty more HTTP round trips here.
 */
const REDIRECTED = [
  { from: 'svakom-europe-bv', to: 'svakom', title: 'SVAKOM' },
  { from: '1979-sas-teil-der-marc-dorcel-group', to: 'dorcel', title: 'DORCEL' },
  { from: 'cssl-office-2', to: 'bathmate', title: 'Bathmate' },
  { from: 'themis-arunterst-tzung-ug', to: 'lovense', title: 'Lovense' },
  { from: 'kiiroo-b-v', to: 'kiiroo', title: 'Kiiroo' },
  { from: 'shots-bv', to: 'shots', title: 'Shots' },
  { from: 'shenzhen-j-l-technology-co-ltd', to: 'pretty-love', title: 'Pretty Love' },
  {
    from: 'super-gay-underwear-official-online-store',
    to: 'super-gay-underwear',
    title: 'Super Gay Underwear',
  },
  { from: 'secret-play-s-l', to: 'secret-play', title: 'Secret Play' },
  { from: 'kheper-games-inc', to: 'kheper-games', title: 'Kheper Games' },
  {
    from: 'creative-conceptions-kft',
    to: 'creative-conceptions',
    title: 'Creative Conceptions',
  },
];

/**
 * Retired with NO survivor — the dead end is the right answer here, and this is
 * the cohort that keeps the `missingBrandResult()` branch under test. Without it,
 * making the consolidated slugs 301 would leave nothing exercising the miss path,
 * and a regression that turned every unknown maker slug into a hard 404 (losing
 * the "All makers" escape hatch a human needs) would pass unnoticed.
 *
 * The first three are feed-ID artifacts with nothing to redirect TO.
 * `mr-s-leather-77da` is the deliberate REFUSAL: three same-name candidates, two
 * of them published, so resolving it automatically is the same-name collision
 * this codebase refuses to guess at. It must stay a dead end until a human picks.
 */
const RETIRED_NO_SURVIVOR = [
  '12807-203758186',
  '9781728209982',
  '10819-50013638-8',
  'mr-s-leather-77da',
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
    expect(
      locs.length,
      'brands sitemap ceiling — approved filter may have been dropped',
    ).toBeLessThan(1200);

    // A slug that 301s must not ALSO be advertised — a sitemap entry for a
    // redirect is a crawl budget spent to be told to go elsewhere. Its brand row
    // is rejected AND its slug is NULL, and only the second of those keeps it out
    // of here.
    for (const { from, to } of REDIRECTED) {
      expect(
        locs.some((u) => u.endsWith(`/marketplace/brands/${from}`)),
        `${from} redirects and must not be advertised`,
      ).toBe(false);
      expect(
        locs.some((u) => u.endsWith(`/marketplace/brands/${to}`)),
        `${to} is the surviving URL and MUST be advertised`,
      ).toBe(true);
    }

    // A dead end is advertised by nobody either.
    for (const from of RETIRED_NO_SURVIVOR) {
      expect(
        locs.some((u) => u.endsWith(`/marketplace/brands/${from}`)),
        `${from} is retired with no survivor and must not be advertised`,
      ).toBe(false);
    }

    // A renamed page keeps its slug, so it must still be advertised. This is the
    // assertion that fails if someone "tidies up" the slugs of the rows that were
    // renamed IN PLACE.
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

  for (const { from, to, title } of REDIRECTED) {
    test(`/${from} 301s to /${to}`, async ({ request }) => {
      // maxRedirects: 0 is load-bearing — the default follows the redirect, which
      // would make this assert 200 on the TARGET and pass just as happily against
      // the soft 404 this replaced.
      const res = await request.get(`/marketplace/brands/${from}`, {
        headers: { 'User-Agent': BOT_UA },
        maxRedirects: 0,
      });
      expect(res.status(), `/marketplace/brands/${from} must 301, not soft-404`).toBe(301);
      // Asserted on the PATH, not the full URL: `Location` is absolute
      // (`canonicalUrl`), so pinning the host would break on any preview origin.
      expect(res.headers()['location'] ?? '', `/marketplace/brands/${from} Location`).toContain(
        `/marketplace/brands/${to}`,
      );

      // The paired half. A 301 into a dead page is worse than the 404 it replaced,
      // so the target is fetched rather than assumed.
      const live = await crawlerHtml(request, `/marketplace/brands/${to}`);
      expect(titleOf(live), `/marketplace/brands/${to} title`).toBe(
        `${title} — Marketplace | Queer Guide`,
      );
      expect(live).toContain(`<h1>${title}</h1>`);
    });
  }

  for (const slug of RETIRED_NO_SURVIVOR) {
    test(`/${slug} stays a dead end — nothing to redirect to`, async ({ request }) => {
      const gone = await crawlerHtml(request, `/marketplace/brands/${slug}`);
      // Only `missingBrandResult()` emits this, so it proves brandDetail RAN and
      // took the miss branch — rather than the route having quietly stopped
      // resolving, which a noindex check alone cannot distinguish. It is also what
      // proves the redirect fall-through stayed NARROW: if brandDetail started
      // returning null for every unresolvable slug, this would become a hard 404
      // and a human would lose the "All makers" escape hatch.
      expect(titleOf(gone), `/marketplace/brands/${slug} should be a dead end`).toBe(
        'No maker here | Queer Guide',
      );
      expect(gone, `${slug} must not publish a Brand entity`).not.toContain('"@type":"Brand"');
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
      ...REDIRECTED.map((r) => r.to),
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

/**
 * The rename split 13 brands across two maker pages each, and two follow-up
 * migrations merged them. Both are asserted here because the DEFECT is only
 * visible on the published surface: two advertised URLs whose `<title>` names
 * the same brand.
 *
 *   20260920083621 — 8 pairs `marketplace_normalize_brand()` can see. Six differ
 *                    only in CASE, which is why migration 2's `group by
 *                    display_name` (string equality) missed them.
 *   20260920084019 — 5 pairs it CANNOT see: it lowercases but does not strip
 *                    punctuation, while the slug function does. `b-Vibe`/`B Vibe`,
 *                    `OUCH`/`Ouch!`, `Rocks-Off`/`Rocks off`.
 *
 * Each retired URL is paired with the surviving one, which must render the brand
 * AND still publish a Brand entity — "the duplicate is gone" is equally true of a
 * merge that deleted the brand outright.
 */
const MERGED = [
  // canonical-key merge: the legal-entity URL dies, the clean one lives
  { retired: 'alura-group-bv', survivor: 'autoblow', title: 'Autoblow' },
  { retired: 'crazy-bull-hair-products-ltd', survivor: 'crazy-bull', title: 'Crazy Bull' },
  { retired: '1979-sas-teil-der-marc-dorcel-group', survivor: 'dorcel', title: 'DORCEL' },
  { retired: 'advena-ltd', survivor: 'pasante', title: 'Pasante' },
  { retired: 'pjur-group-luxembourg-s-a', survivor: 'pjur', title: 'pjur' },
  { retired: 'svakom-europe-bv', survivor: 'svakom', title: 'SVAKOM' },
  // Shape B: the clean slug was on the row being retired, so it MOVED to the
  // survivor and the collision artifact is what 404s.
  { retired: 'fort-troff-c6b6', survivor: 'fort-troff', title: 'Fort Troff' },
  { retired: 'mr-riegillio-988d', survivor: 'mr-riegillio', title: 'MR. Riegillio' },
  // slug-base merge
  { retired: 'b-vibe-e3a1', survivor: 'b-vibe', title: 'b-Vibe' },
  { retired: 'mr-s-leather-77da', survivor: 'mr-s-leather', title: 'MR S LEATHER' },
  { retired: 'ouch-7434', survivor: 'ouch', title: 'OUCH' },
  { retired: 'rocks-off-2', survivor: 'rocks-off', title: 'Rocks-Off' },
  { retired: 'strap-on-me-7b42', survivor: 'strap-on-me', title: 'Strap-On-Me' },
];

test.describe('@smoke one brand, one advertised maker page', () => {
  test('no merged-away URL is still advertised, and every survivor is', async ({ request }) => {
    const res = await request.get('/sitemap-brands.xml');
    expect(res.status()).toBe(200);
    const locs = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(
      locs.length,
      'sitemap floor — every check below passes against an empty sitemap',
    ).toBeGreaterThan(700);

    for (const { retired, survivor } of MERGED) {
      expect(
        locs.some((u) => u.endsWith(`/marketplace/brands/${retired}`)),
        `${retired} was merged away and must not be advertised`,
      ).toBe(false);
      expect(
        locs.some((u) => u.endsWith(`/marketplace/brands/${survivor}`)),
        `${survivor} is the surviving URL and MUST be advertised`,
      ).toBe(true);
    }
  });

  for (const { retired, survivor, title } of MERGED) {
    test(`/${retired} merged into /${survivor} ("${title}")`, async ({ request }) => {
      const gone = await crawlerHtml(request, `/marketplace/brands/${retired}`);
      // Only missingBrandResult() emits this, so it proves brandDetail RAN and
      // took the miss branch rather than the route having stopped resolving.
      expect(titleOf(gone), `/marketplace/brands/${retired} should be a dead end`).toBe(
        'No maker here | Queer Guide',
      );
      expect(gone, `${retired} must not still publish a Brand entity`).not.toContain(
        '"@type":"Brand"',
      );

      const live = await crawlerHtml(request, `/marketplace/brands/${survivor}`);
      expect(titleOf(live), `/marketplace/brands/${survivor} title`).toBe(
        `${title} — Marketplace | Queer Guide`,
      );
      expect(live).toContain(`<h1>${title}</h1>`);
      expect(live, `${survivor} lost its Brand entity`).toContain('"@type":"Brand"');
    });
  }

  test('the two queer-owned stories survived the merge', async ({ request }) => {
    // `forttroff` and `mr riegillio` were the editorially rich rows and were the
    // ones RETIRED, so their hand-written story and `ownership_tags` had to be
    // carried onto the survivor. On a queer marketplace that marker is the most
    // important claim a brand row carries, and a merge that silently dropped it
    // would look identical to this one from every count in the migration.
    for (const { survivor, phrase } of [
      { survivor: 'fort-troff', phrase: 'gay-owned' },
      { survivor: 'mr-riegillio', phrase: 'queer' },
    ]) {
      const html = await crawlerHtml(request, `/marketplace/brands/${survivor}`);
      expect(
        html.toLowerCase(),
        `/marketplace/brands/${survivor} lost the story carried off the retired row`,
      ).toContain(phrase);
    }
  });
});
