import { test, expect } from '@playwright/test';

// Glossary entries must not publish the GENERIC sense of an ordinary English
// word, and must not publish placeholder prose.
//
// Sibling class to tags-wrong-entity.spec.ts, one failure mode over: there the
// tag adopted a DIFFERENT entity (Cassia fistula on golden-shower); here the
// entity class is plausible and the title agrees — it is simply the dictionary
// sense of the word on a kink/venue vocabulary page. "Vacuum Pump" (Fetishes)
// published Otto von Guericke's 1650 invention; "Furniture" (Gear) published
// IKEA prose; "Clothing-Optional" (a venue policy) published nude bike rides.
// Measured 2026-08-29 at ~20% of a random prose sample. Hand-retracted in
// 20261012090500; the recurring detector is tag-enrichment-sweep mode='prose'
// and the producer is sealed by the 'generic-sense' gate in tag-wiki-guard.
//
// Same discipline as the sibling spec: crawler HTML (the surface a wrong sense
// damages lastingly, and ~0.4s per GET), every case pairs a POSITIVE
// fingerprint with the negative ones — "does not mention Otto von Guericke"
// is vacuously true on a 404.

const BOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/** The tag's own prose block, excluding the nav/rails that follow it. */
function articleOf(html: string): string {
  const m = html.match(/<article[\s\S]*?<\/article>/i);
  return m ? m[0] : '';
}

interface Case {
  slug: string;
  /** Proof the page rendered at all — retracted rows legitimately have no
   *  prose (a blank is honest and deindexed until the fill re-earns it), so
   *  for most cases this is just the term itself in the article block. */
  present: RegExp;
  /** Fragments of the generic sense that must be gone. */
  absent: RegExp[];
  was: string;
}

const CASES: Case[] = [
  {
    slug: 'vacuum-pump',
    was: 'the industrial vacuum pump (Otto von Guericke, 1650)',
    present: /vacuum/i,
    absent: [/Otto von Guericke/i, /suction pump/i, /gas molecules/i, /Toys tag/],
  },
  {
    slug: 'furniture',
    was: 'household furniture',
    present: /furniture/i,
    absent: [/households, offices/i, /seating, eating/i, /Updated June 20, 2023/i],
  },
  {
    slug: 'clothing-optional',
    was: 'clothing-optional bike rides',
    present: /clothing/i,
    absent: [/bike ride/i, /cycling event/i, /topfreedom/i],
  },
  {
    // The one case where correct prose was KEPT: only the metal-casting
    // long_description and the manufacturing-process QID were cleared, so the
    // positive fingerprint is the surviving kink definition, not just the name.
    slug: 'casting',
    was: 'metal casting (liquid material poured into a mold)',
    present: /plaster|immobili[sz]/i,
    absent: [/poured into a mold/i, /manufacturing process/i, /solidified/i],
  },
];

test.describe('@smoke glossary entries do not publish the generic sense', () => {
  for (const c of CASES) {
    test(`/tags/${c.slug} is not ${c.was}`, async ({ request }) => {
      const res = await request.get(`/tags/${c.slug}`, {
        headers: { 'User-Agent': BOT_UA },
      });
      expect(res.status(), `/tags/${c.slug} should resolve`).toBe(200);
      const article = articleOf(await res.text());

      // A DEINDEXED tag emits no <article> at all (`seo_indexable=false` →
      // functions/_lib/detail.ts renders the shell with robots noindex), so
      // this surface cannot see its prose — and the prose is still in the
      // database. Skipping is the honest outcome: asserting "the wrong text
      // is absent" against an empty string is a green that means nothing, and
      // failing would report a defect the page does not have. The DB-side
      // sentinels (`refusal_prose_active`, and the mode='prose' subject judge)
      // are what cover a deindexed row. Measured 2026-08-29: vacuum-pump is
      // exactly this shape — adult AND deindexed, so it is invisible to the
      // crawler and age-gated in the SPA.
      test.skip(
        article === '',
        `/tags/${c.slug} is deindexed — prose not observable on the crawler surface; covered by the DB sentinel`,
      );

      expect(article, `/tags/${c.slug} lost even its own name`).toMatch(c.present);

      for (const bad of c.absent) {
        expect(
          article,
          `/tags/${c.slug} still publishes ${c.was} (matched ${bad})`,
        ).not.toMatch(bad);
      }
    });
  }

  // NO TEST HERE FOR THE "No information available" STAMP, deliberately.
  //
  // 20261012090000 nulls 175 of them, and the obvious e2e for it cannot work
  // on this surface: `tagDetail()` renders long_description → description →
  // short_description, and every carrier measured on 2026-08-29 has a real
  // `description`, so the stamp never reaches the page. Probed live on
  // /tags/squat-cobbler — body, meta description and JSON-LD all carry the
  // real definition and the string is absent from the document entirely,
  // WHILE the column still holds it. A test here would have been green
  // against an unfixed corpus, which is worse than no test.
  //
  // The stamp's actual reader surface is the SEARCH SNIPPET —
  // `search_documents_index_tags` indexes `coalesce(short_description,
  // description)` — and search specs in this repo are documented flaky.
  // So the coverage for this class is the DB sentinel `refusal_prose_active`
  // in tag_hygiene_stats(), a zero-invariant gated by
  // scripts/check-tag-hygiene.mjs in CI.
});

test.describe('glossary synonyms display', () => {
  // POSITIVE CONTROL, and it must run first: the negative test below passes
  // just as happily if the synonym band stopped rendering entirely, or if the
  // alias query broke. This proves an APPROVED alias still reaches the reader.
  test('approved aliases still publish as synonyms', async ({ page }) => {
    await page.goto('/tags/chosen-family');
    await expect(page.locator('h1')).toContainText(/chosen family/i);
    // Body text, not getByText: the chip label also appears in the tag's own
    // prose, and a strict locator throws on the second match rather than
    // reporting the thing under test.
    await expect(page.locator('body')).toContainText('Found family');
  });

  test('unreviewed machine aliases do not publish as synonyms', async ({ page }) => {
    // SPA surface — aliases never reach the crawler HTML. "Neptunic" carries
    // "IMO 8805614" (a SHIP registration, the wrong entity's sitelink) as an
    // auto multilingual alias; verified still present in tag_aliases on
    // 2026-08-29, so this asserts the approved-only display gate, not an
    // absence in the data.
    await page.goto('/tags/neptunic');
    // The h1 settling is the render gate: the alias band mounts with the rest
    // of the page, so asserting absence after it is not a half-rendered read.
    // Verified live 2026-08-29: with the gate the band renders NOTHING here
    // (the sole alias is unreviewed), while chosen-family above still shows
    // its approved ones — the pair is what makes this absence meaningful.
    await expect(page.locator('h1')).toContainText(/neptunic/i);
    await expect(page.locator('body')).not.toContainText('IMO 8805614');
  });
});
