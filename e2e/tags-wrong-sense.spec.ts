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
// 20261009090500; the recurring detector is tag-enrichment-sweep mode='prose'
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

      expect(article, `/tags/${c.slug} rendered no <article>`).not.toBe('');
      expect(article, `/tags/${c.slug} lost even its own name`).toMatch(c.present);

      for (const bad of c.absent) {
        expect(
          article,
          `/tags/${c.slug} still publishes ${c.was} (matched ${bad})`,
        ).not.toMatch(bad);
      }
    });
  }

  test('placeholder prose is retracted, not published', async ({ request }) => {
    // 20261009090000 nulled 175 "No information available" stamps; a blank is
    // measurable and the thin-page machinery deindexes it, a stamp reads as
    // content. lash-bearer was one of the 109 active carriers.
    const res = await request.get('/tags/lash-bearer', { headers: { 'User-Agent': BOT_UA } });
    expect(res.status()).toBe(200);
    const article = articleOf(await res.text());
    expect(article, '/tags/lash-bearer rendered no <article>').not.toBe('');
    expect(article).toMatch(/lash/i);
    expect(article, 'the placeholder stamp is back').not.toMatch(/No information available/i);
  });
});

test.describe('glossary synonyms display', () => {
  test('unreviewed machine aliases do not publish as synonyms', async ({ page }) => {
    // SPA surface — aliases never reach the crawler HTML. "Neptunic" carried
    // "IMO 8805614" (a SHIP registration, the wrong entity's sitelink) as an
    // auto multilingual alias; the display gate is approved-only since
    // 2026-08-29, so this holds even before the data purge lands.
    await page.goto('/tags/neptunic');
    await expect(page.locator('h1')).toContainText(/neptunic/i);
    await expect(page.locator('body')).not.toContainText('IMO 8805614');
  });
});
