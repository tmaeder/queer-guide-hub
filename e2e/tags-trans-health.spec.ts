import { test, expect } from '@playwright/test';

// Trans gear must not be published as another entity, or as fetish content.
//
// The namesake-chimera class from `tags-wrong-entity.spec.ts` was still live on the
// trans-gear vocabulary when the UCSF pass measured it on 2026-08-29. These were the
// PUBLISHED descriptions, not drafts: `tucking` = "Pre-industrial wool fabric making
// process", `packing` = "Preparing luggage for travel", `binding` = "A required course
// of action", `stealth` = "Stealth may refer to:" (a scraped Wikipedia disambiguation
// page). Repaired in 20261013110000 from the UCSF Guidelines for the Primary and
// Gender-Affirming Care of Transgender and Gender Nonbinary People.
//
// The second half is the one that mattered more. `hair-removal` was status=active and
// in `search_documents` filed under **Fetishes** with `is_adult=true` — a UCSF
// gender-affirming-care chapter published behind an age gate — and `stealth` and `gaff`
// carried the same gating. `is_adult` is DERIVED from category name by
// `unified_tags_recompute_is_adult()`, and re-filing alone does NOT clear it: the AFTER
// trigger demotes the old primary junction row but leaves it in place. So the age gate
// is asserted here rather than inferred from the migration having run.
//
// Crawler HTML for the prose sweep, same reasoning as the sibling spec: it is what a
// non-JS crawler indexes, and one GET costs ~0.4s against ~11s for an SPA boot. The age
// gate is checked in a real browser, because `TagDetailWithGate` is a client-side
// component the crawler path never renders.
//
// Every prose case pairs a NEGATIVE with a POSITIVE fingerprint. "Does not mention wool
// fabric" also passes on a 404, an empty body, or a page that failed to render.

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

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

const CHIMERAS: Case[] = [
  {
    slug: 'tucking',
    was: 'a pre-industrial wool fabric process',
    present: /crotch|gaff|inguinal/i,
    absent: [/wool/i, /fabric/i, /pre-industrial/i],
  },
  {
    slug: 'packing',
    was: 'preparing luggage for travel',
    present: /prosthesis|packer|underwear/i,
    absent: [/luggage/i, /\bsuitcase\b/i],
  },
  {
    slug: 'binding',
    was: '"a required course of action"',
    present: /chest|binder/i,
    absent: [/required course of action/i, /legally binding/i],
  },
  {
    slug: 'gaff',
    was: 'an empty stub in Fetishes',
    present: /tuck/i,
    absent: [/fishing/i, /\bhook\b/i],
  },
  {
    slug: 'stealth',
    was: 'a Wikipedia disambiguation stub ("Stealth may refer to:")',
    present: /disclos/i,
    absent: [/may refer to/i, /stealth aircraft/i, /radar/i],
  },
];

test.describe('@smoke trans gear is not another entity', () => {
  for (const c of CHIMERAS) {
    test(`/tags/${c.slug} is not ${c.was}`, async ({ request }) => {
      const res = await request.get(`/tags/${c.slug}`, { headers: { 'User-Agent': BOT_UA } });
      expect(res.status(), `/tags/${c.slug} should resolve`).toBe(200);
      const article = articleOf(await res.text());

      // Positive first: without it every assertion below is vacuously true.
      expect(article, `/tags/${c.slug} rendered no <article>`).not.toBe('');
      expect(article, `/tags/${c.slug} lost its own definition`).toMatch(c.present);

      for (const bad of c.absent) {
        expect(article, `/tags/${c.slug} still publishes ${c.was} (matched ${bad})`).not.toMatch(
          bad,
        );
      }
    });
  }
});

test.describe('@smoke gender-affirming care is not adult-gated', () => {
  // The headline fix. Each of these was `is_adult=true` because it sat in Fetishes or
  // Dynamics & Roles. Checked in a real browser: the gate is `TagDetailWithGate`, a
  // client component, so the crawler HTML cannot show it either way.
  for (const slug of ['hair-removal', 'gaff', 'stealth', 'tucking', 'binding']) {
    test(`/tags/${slug} renders for a signed-out reader with no age gate`, async ({ page }) => {
      await page.goto(`/tags/${slug}`);

      // Positive control: the page's own prose band. If #about never appears the
      // "no age gate" assertion below would pass on a blank page.
      const about = page.locator('#about');
      await expect(about, `/tags/${slug} did not render its About band`).toBeVisible({
        timeout: 25_000,
      });

      // The gate copy. `TagDetailWithGate` asks the reader to affirm their age before
      // showing anything, so its presence is the observable form of is_adult.
      await expect(
        page.getByRole('heading', { name: /adults only|age|18\+/i }),
        `/tags/${slug} is still behind the age gate`,
      ).toHaveCount(0);
    });
  }
});

test.describe('@smoke trans health vocabulary is published and sourced', () => {
  // The vocabulary was deprecated by an orphan sweep for zero entity usage, which took
  // it out of `search_documents` entirely and 404'd the pages. A 200 with real prose is
  // the proof the revive held — and it has to keep holding, because
  // `deprecate_unused_tags()` re-culls zero-usage tags nightly unless human_reviewed.
  const REVIVED: Array<[string, RegExp]> = [
    ['vaginoplasty', /penile inversion/i],
    ['phalloplasty', /flap/i],
    ['metoidioplasty', /clitoris/i],
    ['orchiectomy', /testicl/i],
    ['bottom-surgery', /genital surgery/i],
    ['hysterectomy', /uterus/i],
    ['silicone-injection', /embolism/i],
  ];

  for (const [slug, present] of REVIVED) {
    test(`/tags/${slug} is live and about gender-affirming care`, async ({ request }) => {
      const res = await request.get(`/tags/${slug}`, { headers: { 'User-Agent': BOT_UA } });
      expect(res.status(), `/tags/${slug} should resolve, not 404`).toBe(200);
      const article = articleOf(await res.text());
      expect(article, `/tags/${slug} rendered no <article>`).not.toBe('');
      expect(article, `/tags/${slug} lost its definition`).toMatch(present);
    });
  }

  test('vaginoplasty is about gender affirmation, not prolapse repair', async ({ request }) => {
    // The culled prose was NOT merely unused — it was a complete and accurate account of
    // the wrong subject. It described pelvic organ prolapse, congenital defects, injury
    // and removal of malignant growths, and never once mentioned gender affirmation.
    const res = await request.get('/tags/vaginoplasty', { headers: { 'User-Agent': BOT_UA } });
    const article = articleOf(await res.text());
    expect(article).toMatch(/gender-affirming|gender affirmation/i);
    expect(article, 'vaginoplasty still leads on the non-trans indications').not.toMatch(
      /pelvic organ prolapse/i,
    );
  });

  test('the clinical citation is published, and as guidance rather than as law', async ({
    request,
  }) => {
    // `tag_sources` publishes two kinds of citation. Rendering UCSF under "Source of
    // law" would tell a crawler a clinical guideline is a legal instrument, so the
    // crawler template emits a separate "Clinical guidance" section and a
    // `CreativeWork` node instead of `Legislation`.
    const res = await request.get('/tags/tucking', { headers: { 'User-Agent': BOT_UA } });
    const html = await res.text();

    expect(html, 'the Clinical guidance section is missing').toMatch(/Clinical guidance/i);
    expect(html, 'the UCSF citation is not published').toMatch(/transcare\.ucsf\.edu/i);

    const ld = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i);
    expect(ld, 'no JSON-LD on the page').toBeTruthy();
    const doc = JSON.parse((ld as RegExpMatchArray)[1]);
    const citations = Array.isArray(doc.citation) ? doc.citation : [doc.citation].filter(Boolean);
    const ucsf = citations.find((c: { url?: string }) =>
      /transcare\.ucsf\.edu/.test(c?.url ?? ''),
    );
    expect(ucsf, 'the UCSF citation is absent from JSON-LD').toBeTruthy();
    expect(ucsf['@type'], 'clinical guidance must not be emitted as Legislation').toBe(
      'CreativeWork',
    );
  });
});
