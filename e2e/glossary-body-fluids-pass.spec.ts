import { test, expect } from '@playwright/test';
import { anonHeaders, SUPABASE_REST_URL } from './support/anonKey';

// End-to-end guard for the four body-fluids glossary passes shipped in #3960 and
// #3961: piss play (99991790449537), fisting (99991790451897), the toilet role
// and scat merge (99991790497084), and the douching re-check (99991790498180).
//
// WHAT THIS ASSERTS IS THE INVARIANT, NOT THE REPAIR'S TRANSIENT STATE. A spec
// pinned to "this exact sentence is present" goes red the first time a human
// improves the prose; these cases pair a fingerprint of the SUBJECT being right
// with the defect text being gone, so a better rewrite still passes and a
// regression to the old sweep output does not.
//
// EACH ROW IS CHECKED ON THE SURFACE THAT ACTUALLY SERVES IT, which took
// measuring rather than assuming — and getting this wrong is how four rows first
// read as broken when they were fine:
//
//   * functions/_lib/detail.ts builds the crawler <article> as
//     long_description ?? description ?? short_description, and the meta
//     description as description ?? short_description ?? long_description. So a
//     `short_description` repair reaches NEITHER crawler field, and asserting a
//     summary fix against crawler HTML fails on correct data.
//   * A `publication_role = 'utility'` row is served `noindex,nofollow` with no
//     prose body at all — measured on /tags/douching and /tags/toilet. Those
//     rows' bodies are correct in the database and correctly absent from
//     crawler HTML, so the honest surface for them is the ANON PostgREST API,
//     which is what the /tags index and the inline definition card read
//     (fetchTagPreviews filters status='active' and nothing else).
//
// So: article-lane bodies are asserted over crawler HTML, and utility-lane rows
// over the anon API. Neither group is evidence about the other.
//
// EVERY ABSENCE IS PAIRED WITH A PRESENCE. "Does not say Garment covering the
// hand" also passes on a 404, on an empty body, and on a page that failed to
// render — the positive half is what makes the negative half mean anything. The
// controls at the end exist because a spec whose every assertion is an absence
// is vacuous in exactly the environment it ships to.

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

// The anon key and the REST origin both come from e2e/support/anonKey.ts, which
// resolves the key from the DEPLOYED BUNDLE rather than an environment variable
// no workflow sets — see that file for the measurement and the three traps it
// handles. A missing key FAILS there rather than skipping, which is the
// property this group depends on. This file carried its own copy until #3967
// promoted the logic; one implementation, so the two cannot drift.

/** The tag's own prose block, excluding the nav and rails that follow it. */
function articleOf(html: string): string {
  const m = html.match(/<article[\s\S]*?<\/article>/i);
  return m ? m[0] : '';
}

// DELIBERATELY NOT USING e2e/support/glossaryProse.ts's unlinkGlossary() here,
// and the reason is measured rather than assumed. That helper exists because a
// phrase assertion straddling a word which has become a glossary term goes red
// with the sentence still intact — a real failure mode, and four specs use it.
//
// It buys this file nothing, twice over. Measured on prod: `data-glossary-link`
// appears on NONE of the six pages asserted below (nor on /tags/consent,
// /tags/trauma or /tags/stealthing), so the strip would be a no-op on every one
// of them — and the helper's own docblock warns that a caller must then keep a
// positive control, which would be asserting something false about these pages.
// The first draft of this file did exactly that and the control correctly
// failed. Second, every fingerprint below is a SINGLE WORD, and a glossary
// anchor wraps a whole word (`<a ...>urine</a>`), so it cannot split one.
//
// Where the attribute does still appear (/tags/doxy-pep), the existing specs'
// controls cover it. This is not a claim that the auto-linker is broken; it is a
// statement that it does not touch these pages, so stripping it here would be
// ceremony with a false assertion attached.

interface ArticleCase {
  slug: string;
  /** Proof the page rendered the RIGHT subject. */
  present: RegExp;
  /** The defect text that must be gone. */
  absent: RegExp[];
  /** What it used to publish, for the failure message. */
  was: string;
}

// Article-lane, seo_indexable rows whose long_description these passes wrote.
const ARTICLE_CASES: ArticleCase[] = [
  {
    slug: 'golden-shower',
    was: 'nothing — the body was NULL and the page rendered two lines and stopped',
    present: /urinat|urine/i,
    // The retired "urine is sterile" line is the claim six of nine sources
    // contradict; publishing it again would be the regression that matters.
    absent: [/urine\s+is\s+sterile/i],
  },
  {
    slug: 'anal-slut',
    was: 'a summary naming no subject over a body that never mentioned the anus',
    present: /anal|anus/i,
    absent: [/a\s+term\s+associated\s+with\s+sexual\s+preference/i],
  },
  {
    slug: 'toilet-slave',
    was: 'a body that declined to say what the term means',
    present: /urine|faeces|receiving\s+role/i,
    absent: [/specifics\s+can\s+vary\s+widely/i],
  },
  {
    slug: 'gloves',
    was: 'a garment encyclopaedia about cold, heat, chemicals and abrasion',
    // Both sources that recommend oil-based lube also recommend latex gloves
    // and neither names the incompatibility; this is the fact that closes it.
    present: /nitrile|latex/i,
    absent: [/separate\s+sheaths/i, /against\s+cold,\s*heat/i],
  },
  {
    slug: 'fister',
    was: 'nothing — the body was NULL',
    present: /giving\s+partner|duck\s+bill|nails/i,
    absent: [],
  },
  {
    slug: 'scat-play',
    // The merge target. A merge whose target does not render is a redirect to
    // nothing, so the survivor is asserted to still carry its own body.
    was: 'n/a — this is the surviving row of the scat merge',
    present: /hepatitis\s+A|faecal-oral/i,
    absent: [],
  },
];

test.describe('glossary body-fluids passes — crawler HTML (article lane)', () => {
  for (const c of ARTICLE_CASES) {
    test(`/tags/${c.slug} publishes its own subject, not ${c.was}`, async ({ request }) => {
      const res = await request.get(`/tags/${c.slug}`, { headers: { 'User-Agent': BOT_UA } });
      expect(res.status(), `/tags/${c.slug} must resolve`).toBe(200);
      const html = await res.text();
      const article = articleOf(html);

      // POSITIVE CONTROL FIRST: an empty article makes every absence below
      // trivially true, so prove the page rendered prose before trusting them.
      expect(
        article.length,
        `/tags/${c.slug} rendered no <article> — every absence assertion below would be vacuous`,
      ).toBeGreaterThan(200);
      expect(article, `/tags/${c.slug} does not name its own subject`).toMatch(c.present);

      for (const bad of c.absent) {
        expect(article, `/tags/${c.slug} still publishes ${c.was}`).not.toMatch(bad);
      }
    });
  }

  test('a utility-lane row is deindexed and serves no body — the reason the API group exists', async ({
    request,
  }) => {
    // This is the measurement the spec's design rests on. If it ever changes,
    // the utility rows below want checking on the crawler surface too.
    const res = await request.get('/tags/douching', { headers: { 'User-Agent': BOT_UA } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html, '/tags/douching is no longer deindexed').toMatch(/noindex/i);
    // Its meta description is served from `description`, which these passes did
    // not touch — so this is a positive control that the page renders at all.
    expect(html).toMatch(/<meta name="description" content="[^"]{40,}/);
    expect(
      articleOf(html).length,
      'a utility row now emits a prose article — re-check the utility group on this surface',
    ).toBeLessThan(200);
  });
});

test.describe('glossary body-fluids passes — anon API (utility lane)', () => {
  async function tags(request: import('@playwright/test').APIRequestContext, query: string) {
    const res = await request.get(`${SUPABASE_REST_URL}/rest/v1/unified_tags?${query}`, {
      headers: await anonHeaders(request),
    });
    expect(res.status(), 'anon PostgREST read failed').toBe(200);
    return (await res.json()) as Array<Record<string, unknown>>;
  }

  test('anon can read the glossary at all — the control for this whole group', async ({
    request,
  }) => {
    const rows = await tags(request, 'slug=eq.fisting&select=slug,long_description');
    expect(rows.length, 'anon cannot read unified_tags — every assertion below is vacuous').toBe(1);
    expect(String(rows[0].long_description)).toMatch(/hepatitis C/i);
  });

  test('toilet publishes the kink role, and both identifier fields are cleared', async ({
    request,
  }) => {
    const rows = await tags(
      request,
      'slug=eq.toilet&select=short_description,long_description,wikidata_id,wikipedia_url',
    );
    expect(rows.length).toBe(1);
    const r = rows[0];
    // The role, not the fixture.
    expect(String(r.short_description)).toMatch(/receptacle/i);
    expect(String(r.long_description)).toMatch(/role/i);
    expect(String(r.short_description)).not.toMatch(/sanitary hardware/i);
    expect(String(r.long_description)).not.toMatch(/sanitary hardware|flush toilets|septic tank/i);
    // Nulling the QID alone leaves the cached title that regenerates the
    // plumbing prose on the next enrichment pass, so both must be gone.
    expect(r.wikidata_id, 'toilet still carries the plumbing QID').toBeNull();
    expect(r.wikipedia_url, 'toilet still carries the cached plumbing title').toBeNull();
  });

  test('douching carries the validated claims and not the one no source states', async ({
    request,
  }) => {
    const rows = await tags(request, 'slug=eq.douching&select=long_description');
    expect(rows.length).toBe(1);
    const body = String(rows[0].long_description);
    // Validated: barrier damage (6 of 6) and raised risk (5 of 6, 0 contradict).
    expect(body).toMatch(/strips mucus|damages the lining/i);
    expect(body).toMatch(/raises rather than lowers/i);
    // Removed: a mechanism no source in the set states.
    expect(body, 'the unreplicated absorption mechanism is published again').not.toMatch(
      /absorbs more/i,
    );
    // Added: the three things the sources are near-unanimous on.
    expect(body).toMatch(/half an hour/i);
    expect(body).toMatch(/two or three times a week/i);
    expect(body).toMatch(/will not run clear/i);
    // Refused: contested or single-source claims.
    expect(body, 'a contested magnitude figure was published').not.toMatch(/74\s?%/);
    expect(body, 'saline was published over plain water').not.toMatch(/saline/i);
    expect(body, 'a single-source temperature number was published').not.toMatch(
      /37\s?°?\s?C|body temperature/i,
    );
  });

  test('douche leads with the device and keeps the do-not-share rule', async ({ request }) => {
    const rows = await tags(request, 'slug=eq.douche&select=short_description,long_description');
    expect(rows.length).toBe(1);
    const body = String(rows[0].long_description);
    expect(body).toMatch(/bulb/i);
    expect(body, 'douche still leads its body with vaginal irrigation').not.toMatch(
      /typically refers to vaginal irrigation/i,
    );
    // The rule that was the reason the previous pass spared this body.
    expect(body).toMatch(/never shared between people/i);
    expect(body).toMatch(/never moved between the rectum and the vagina/i);
  });

  test('the two highest-usage rows in the family have a summary at all', async ({ request }) => {
    const rows = await tags(
      request,
      'slug=in.(anal,lube,watersports)&select=slug,short_description',
    );
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(
        String(r.short_description ?? '').trim().length,
        `${r.slug} has no summary — the /tags index and definition card fall back`,
      ).toBeGreaterThan(10);
    }
  });

  test('scat is merged into an ACTIVE scat-play with one category membership', async ({
    request,
  }) => {
    const [drop] = await tags(request, 'slug=eq.scat&select=status,merged_into_id');
    expect(drop.status, 'scat is not merged').toBe('merged');
    expect(drop.merged_into_id).not.toBeNull();
    const [keep] = await tags(request, 'slug=eq.scat-play&select=id,status');
    // A merge whose target is deprecated or itself merged is a redirect to a
    // page that does not render.
    expect(keep.status, 'the merge target is not active').toBe('active');
    expect(drop.merged_into_id, 'scat is merged into something other than scat-play').toBe(keep.id);
  });

  test('the four facet families stay UNMERGED — they are not glossary duplicates', async ({
    request,
  }) => {
    // mat-latex is one of a 22-member material-facet namespace; anal is 872 of
    // 872 marketplace listings; the lube family is 241 marketplace assignments;
    // sextoy and sex-toy do not share an entity type. Merging any of them
    // would consolidate facets, not deduplicate a glossary.
    const rows = await tags(
      request,
      'slug=in.(mat-latex,latex,anal,lube,lubricant,sextoy)&select=slug,status,merged_into_id',
    );
    expect(rows.length, 'a facet row disappeared').toBe(6);
    for (const r of rows) {
      expect(r.status, `${r.slug} is no longer active — was it merged?`).toBe('active');
      expect(r.merged_into_id, `${r.slug} was merged into another row`).toBeNull();
    }
  });

  test('the created rows exist and ship unpublished', async ({ request }) => {
    const rows = await tags(
      request,
      'slug=in.(shy-bladder,duck-bill)&select=slug,status,seo_indexable,category',
    );
    expect(rows.length, 'a created row is missing').toBe(2);
    for (const r of rows) {
      expect(r.status).toBe('active');
      // A newly created tag cannot be an article page: three editorial-readiness
      // fields default to pending, so the gate demotes it to utility.
      expect(r.seo_indexable, `${r.slug} was published without review`).toBe(false);
      expect(String(r.category ?? '').length, `${r.slug} has no category text`).toBeGreaterThan(0);
    }
  });
});

test.describe('glossary body-fluids passes — controls', () => {
  test('a nonsense slug 404s, so a 200 above means something', async ({ request }) => {
    const res = await request.get('/tags/nonsense-slug-that-cannot-exist-xyz', {
      headers: { 'User-Agent': BOT_UA },
    });
    expect(res.status()).toBe(404);
  });

  test('articleOf is scoped to the tag prose, not the whole page', async ({ request }) => {
    // Every per-case assertion above reads articleOf(). If that extraction ever
    // returned the whole document, the POSITIVE fingerprints would start matching
    // nav, rails and footer text, and the cases would pass on pages that publish
    // nothing. Pin the scope: the article must carry prose and must NOT carry the
    // site chrome that surrounds it.
    const res = await request.get('/tags/golden-shower', { headers: { 'User-Agent': BOT_UA } });
    const html = await res.text();
    const article = articleOf(html);
    expect(article.length, 'no article to scope').toBeGreaterThan(200);
    expect(article.length, 'articleOf returned the whole page').toBeLessThan(html.length);
    expect(article, 'articleOf leaked the crisis-support noscript block').not.toMatch(
      /Crisis support/i,
    );
    expect(article, 'articleOf leaked a Cloudflare challenge script').not.toMatch(
      /challenge-platform/i,
    );
  });
});
