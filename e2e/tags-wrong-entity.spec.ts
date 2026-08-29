import { test, expect } from '@playwright/test';

// Glossary entries must not publish another entity's encyclopaedia stub.
//
// `tag-enrichment-sweep` resolved a tag's Wikidata identity by fetching the Wikipedia
// summary of its RAW NAME. The REST summary endpoint follows redirects and only skips a
// disambiguation *page*, so every ambiguous term adopted whatever article owns its base
// title: `Golden shower` → `Cassia_fistula`, `Anal` → `Analyst` (a journal), `Brats` →
// the Bratsberg Line, `Simp` → Simple English Wikipedia. The prose was then generated
// from that entity, so a kink glossary entry rendered a botany stub. Measured
// 2026-08-29: 1,535 of 4,772 linked tags. Repaired in 20261008100000; the producer is
// gated by `_shared/tag-wiki-guard.ts` and the DB regression is watched by
// `tag_wikidata_repair_regressions()` in check-pipeline-health.
//
// Asserted over the CRAWLER HTML (`functions/_lib/detail.ts`), not the SPA, for two
// reasons. It is what a non-JS crawler indexes — the surface where a wrong stub does
// lasting damage — and one plain GET per case costs ~0.4s against ~11s for an SPA boot,
// so the whole sweep runs in seconds instead of minutes under sibling-session load.
//
// Every case pairs a NEGATIVE with a POSITIVE fingerprint. "Does not mention Cassia
// fistula" also passes on a 404, on an empty body, and on a page that failed to render
// — the positive half is what makes the negative half mean anything.

const BOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/** The tag's own prose block, excluding the nav/rails that follow it. */
function articleOf(html: string): string {
  const m = html.match(/<article[\s\S]*?<\/article>/i);
  return m ? m[0] : '';
}

interface Case {
  slug: string;
  /** Text proving the page rendered the RIGHT subject. */
  present: RegExp;
  /** Fragments of the wrong entity that must be gone. */
  absent: RegExp[];
  /** What the tag had been mistaken for, for the failure message. */
  was: string;
}

const CASES: Case[] = [
  { slug: 'golden-shower', was: 'Cassia fistula, a flowering plant',
    present: /urinat/i, absent: [/cassia\s+fistula/i, /flowering\s+plant/i, /Fabaceae/i] },
  { slug: 'anal', was: 'The Analyst, a peer-reviewed journal',
    present: /anus|rectum/i, absent: [/peer-reviewed/i, /\bThe Analyst\b/] },
  { slug: 'kilts', was: 'Kielce, a city in Poland',
    present: /kilt/i, absent: [/Kielce/i, /Voivodeship/i] },
  { slug: 'devourer', was: 'Galactus, a Marvel character',
    present: /oral|consum/i, absent: [/Galactus/i, /Marvel/i] },
  { slug: 'brats', was: 'the Bratsberg Line, a Norwegian railway',
    present: /defiant|dominant/i, absent: [/Bratsberg/i, /railway/i] },
  { slug: 'simp', was: 'Simple English Wikipedia',
    present: /sympath/i, absent: [/Simple English Wikipedia/i, /Basic English/i] },
  { slug: 'luna', was: 'the given name Luna / the Latin word for Moon',
    present: /alpha|primal/i, absent: [/given name/i, /Latin word for Moon/i] },
  { slug: 'otters', was: 'Lutrinae, the semiaquatic mammals',
    present: /bear|slimmer|body hair/i, absent: [/Lutrinae/i, /carnivorous mammals/i] },
  { slug: 'bussy', was: 'Bussy, a commune in Cher, France',
    present: /slang|queer/i, absent: [/commune/i, /Centre-Val de Loire/i] },
  { slug: 'autonomy', was: 'Autonomy Corporation, a British software company',
    present: /decisions about their own|consent|bodies/i,
    absent: [/Autonomy Corporation/i, /software company/i] },
];

test.describe('@smoke glossary entries do not publish another entity', () => {
  for (const c of CASES) {
    test(`/tags/${c.slug} is not ${c.was}`, async ({ request }) => {
      const res = await request.get(`/tags/${c.slug}`, {
        headers: { 'User-Agent': BOT_UA },
      });
      expect(res.status(), `/tags/${c.slug} should resolve`).toBe(200);
      const article = articleOf(await res.text());

      // A DEINDEXED tag emits no <article> at all (`seo_indexable=false` →
      // this file renders the shell with robots noindex), so the crawler
      // surface cannot see its prose either way. Skipping is the honest
      // outcome — the negative assertions below would pass against an empty
      // string, and the positive one would fail on a page that is fine.
      //
      // This is not hypothetical and it is why the guard was added: measured
      // 2026-08-29, bussy / devourer / luna all carry CORRECT repaired prose
      // in the database and `tag_wikidata_repair_regressions()` is empty, yet
      // all three had been deindexed (thin-page sweep, before the repaired
      // prose landed) and so failed this spec on `rendered no <article>` —
      // a red that reported the sitemap state, not the defect this file is
      // about. The DB sentinel in check-pipeline-health.mjs is what covers a
      // deindexed row; the nightly reindex restores the page once prose exists.
      test.skip(
        article === '',
        `/tags/${c.slug} is deindexed — identity not observable on the crawler surface; covered by tag_wikidata_repair_regressions()`,
      );

      // Positive first: without it every assertion below is vacuously true.
      expect(article, `/tags/${c.slug} lost its own definition`).toMatch(c.present);

      for (const bad of c.absent) {
        expect(
          article,
          `/tags/${c.slug} still publishes ${c.was} (matched ${bad})`,
        ).not.toMatch(bad);
      }

      // The Wikipedia link is rendered straight from `wikipedia_url`, which pointed at
      // the redirect target. Its absence is the observable proof the identifier itself
      // was cleared, not just the prose rewritten — the exact half the 2026-08 health
      // pass missed, which left six wrong QIDs regenerating clinical codes weekly.
      expect(
        article,
        `/tags/${c.slug} still links out to the wrong Wikipedia article`,
      ).not.toMatch(/wikipedia\.org/i);
    });
  }

  test('a correctly linked tag keeps its Wikipedia link', async ({ request }) => {
    // Control. Without it, "no wikipedia.org link" would also pass if the repair had
    // stripped every link on every tag, or if the crawler template stopped emitting
    // them at all. `drag-queen` → Q337084, whose P31 is `occupation`: a link the guard
    // in tag-wiki-guard.ts adopts, verified against live Wikidata.
    const res = await request.get('/tags/drag-queen', { headers: { 'User-Agent': BOT_UA } });
    expect(res.status()).toBe(200);
    const article = articleOf(await res.text());
    expect(article).toMatch(/drag/i);
    expect(article, 'the crawler template no longer emits Wikipedia links at all').toMatch(
      /wikipedia\.org/i,
    );
  });
});

test.describe('glossary reader surface', () => {
  test('the About band on /tags/autonomy is about bodily autonomy, not a software company', async ({
    page,
  }) => {
    // One real browser case: the crawler HTML and the SPA read DIFFERENT columns
    // (`functions/_lib/detail.ts` takes long_description first, TagDetail.tsx renders
    // description then long_description), so a green crawler sweep does not prove the
    // reader-facing band is clean.
    //
    // `autonomy` rather than `golden-shower` because the SPA wraps every is_adult tag
    // in TagDetailWithGate, so #about does not exist for an anonymous visitor and the
    // case would fail for a reason that has nothing to do with this repair.
    await page.goto('/tags/autonomy');
    const about = page.locator('#about');
    await expect(about).toBeVisible({ timeout: 20_000 });
    await expect(about).toContainText(/decisions about their own/i);
    await expect(about).not.toContainText(/Autonomy Corporation/i);
    await expect(about).not.toContainText(/software company/i);
  });
});
