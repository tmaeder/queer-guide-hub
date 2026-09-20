import { test, expect } from '@playwright/test';
import { GLOSSARY_LINK_ATTR, unlinkGlossary } from './support/glossaryProse';

// Prod guard for the sex & sexual-health glossary pass (#3807) and the anatomy
// de-gendering follow-up (#3810).
//
// WHY THIS EXISTS RATHER THAN ANOTHER SQL-TEXT TEST. Both passes already have
// guards — sexGlossaryPass.test.ts and glossaryAnatomyDegender.test.ts — but
// those parse the migration FILE. They prove the file says what it says. They
// cannot see whether the row reached prod, whether the category move took, or
// whether the page a reader gets still carries the old prose. #3810 exists only
// because a human fetched the rendered pages and compared them side by side;
// no file-parsing test could have found it.
//
// The headline defect this locks down: /tags/lubricant was ACTIVE and
// seo_indexable and published INDUSTRIAL LUBRICANT — "transmitting forces,
// transporting foreign particles ... the property of reducing friction is known
// as lubricity" — filed under Substances & Recovery. Wrong-SENSE class: the
// entity is plausible, the name agrees, and the row carries no wikidata_id, so
// neither tag-wiki-guard.ts arm nor tag_disowned_prose_signals() could ever see
// it. Only comparing the row against what the word means HERE finds it.
//
// Same discipline as tags-wrong-sense.spec.ts: crawler HTML (cheap, and the
// surface a wrong sense damages lastingly), and EVERY case pairs a positive
// fingerprint with its negatives — "does not mention lubricity" is vacuously
// true on a 404, and this pass was bitten by exactly that during development
// (an assertion against /tags/sex-worker passed while the page was serving the
// sign-in gate and contained neither the bad string nor the good one; only the
// paired "still contains its other sentences" control exposed it).

const BOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/** The tag's own prose block, excluding the nav/rails that follow it. */
function articleOf(html: string): string {
  const m = html.match(/<article[\s\S]*?<\/article>/i);
  // Glossary auto-links are removed before any phrase assertion runs — see
  // e2e/support/glossaryProse.ts for why a linked word is not a content defect.
  return m ? unlinkGlossary(m[0]) : '';
}

/**
 * A sensitive row serves the sign-in gate to anon/crawler traffic.
 *
 * Scoped to the TITLE, not the document. A first draft tested the whole HTML
 * and skipped 13 of 19 cases, because ordinary pages carry a "Sign in to view
 * N places" notice in a rail — the check matched its own escape hatch and the
 * spec silently stopped testing. Measured: /tags/lubricant contains the phrase
 * 0 times, /tags/sex-worker 3 times and carries it in <title>.
 */
function isSignInGate(html: string): boolean {
  return /<title>\s*Sign in to view/i.test(html);
}

interface Case {
  slug: string;
  was: string;
  /** Proof the page rendered its own content at all. */
  present: RegExp;
  /** Fragments of the defect that must be gone. */
  absent: RegExp[];
}

// ── #3807: the wrong-sense and namesake repairs on live, indexable rows ──────
const PASS_ONE: Case[] = [
  {
    slug: 'lubricant',
    was: 'industrial lubricant filed under Substances & Recovery',
    present: /during sex|condom-safe/i,
    absent: [/lubricity/i, /friction between surfaces/i, /transmitting forces/i],
  },
  {
    slug: 'praise-kink',
    was: '"Praise Kink is a term from a podcast episode"',
    present: /praise/i,
    absent: [/podcast episode/i],
  },
  {
    slug: 'primal-play',
    was: '"Primal Play is a form of self-expression"',
    present: /instinct|animal/i,
    absent: [/is a form of self-expression/i],
  },
  {
    slug: 'lgbti',
    was: 'an active row with 1,289 assignments and BOTH prose columns NULL',
    present: /lesbian, gay, bisexual, trans and intersex/i,
    absent: [],
  },
];

// ── #3810: prose that named a gender the body part does not imply ───────────
const PASS_TWO: Case[] = [
  {
    slug: 'erectile-dysfunction',
    was: '"a form of sexual dysfunction in males" (twice)',
    present: /erection/i,
    absent: [/sexual dysfunction in males/i, /most common sexual problem in males/i],
  },
  {
    slug: 'clitoris',
    was: '"a vital female sex organ"',
    present: /pleasure|erectile tissue/i,
    absent: [/vital female sex organ/i],
  },
  {
    slug: 'ovaries',
    was: '"a gonad in the female reproductive system"',
    present: /eggs|hormones/i,
    absent: [/gonad in the female reproductive system/i],
  },
  {
    slug: 'pregnancy',
    was: '"gestates inside a woman\'s uterus"',
    present: /uterus/i,
    absent: [/inside a woman'?s uterus/i],
  },
  {
    slug: 'foreskin',
    was: '"In male human anatomy, the foreskin..."',
    present: /glans/i,
    absent: [/in male human anatomy/i],
  },
  {
    slug: 'sperm',
    was: '"the male reproductive cell" plus red algae, fungi and ferns',
    present: /semen/i,
    absent: [/is the male reproductive cell/i, /red algae/i, /gymnosperms/i],
  },
  {
    slug: 'vagina',
    was: '"In mammals and other animals ... the female genital tract"',
    present: /cervix|vulva/i,
    absent: [/in mammals and other animals/i, /female genital tract/i],
  },
  {
    slug: 'perineum',
    was: '"The perineum in placental mammals ... in the male ... in the female"',
    present: /anus/i,
    absent: [/placental mammals/i],
  },
  {
    slug: 'fallopian-tubes',
    was: 'a filler closing line asserting LGBTQ+ relevance instead of stating a fact',
    present: /ovaries|uterus/i,
    absent: [/particularly relevant for individuals in the LGBTQ\+ community/i],
  },
];

/**
 * Read a tag's own prose, from whichever surface actually carries it.
 *
 * MOST OF THIS PASS IS DELIBERATELY UNPUBLISHED — the 46 revived and 55 created
 * rows are all `seo_indexable = false`, so `functions/_lib/detail.ts` renders a
 * shell with `robots: noindex` and NO <article> for them. Crawler HTML alone
 * therefore cannot see the prose these migrations wrote: a first draft of this
 * spec skipped 13 of 19 cases for that reason, which is a spec that passes
 * without testing.
 *
 * Those rows are still fully visible to a signed-out human in the SPA, and that
 * is the surface they exist on, so fall back to the rendered page. The crawler
 * GET stays first because it is ~0.4s against a browser's several seconds, and
 * for the indexable rows it is also the surface a wrong sense damages
 * lastingly.
 */
async function proseOf(
  request: import('@playwright/test').APIRequestContext,
  slug: string,
): Promise<{ text: string; surface: 'crawler' | 'meta' | 'gated' }> {
  const res = await request.get(`/tags/${slug}`, { headers: { 'User-Agent': BOT_UA } });
  expect(res.status(), `/tags/${slug} should resolve`).toBe(200);
  const html = await res.text();
  if (isSignInGate(html)) return { text: '', surface: 'gated' };

  const article = articleOf(html);
  if (article !== '') return { text: article, surface: 'crawler' };

  // NO SPA FALLBACK, DELIBERATELY — it was tried and removed. Two things make
  // the rendered page an unreliable surface for this assertion:
  //
  //  1. THE AGE GATE IS STICKY PER BROWSER CONTEXT. is_adult rows render an
  //     "Adult content gated / Confirm you are 18 or older" interstitial, and
  //     once a worker has loaded one, LATER pages in the same context inherit
  //     it. Measured on prod: /tags/ovaries is is_adult=false and is_sensitive
  //     =false, and still showed the gate after /tags/praise-kink had been
  //     visited. So SPA results depend on test ORDER, and the failure surfaces
  //     as "still publishes <the defect>" on a row whose data is correct —
  //     the most misleading shape a flake can take.
  //  2. Cold-route hydration runs 3.5-7s, well past Playwright's 5s default.
  //
  // For a DEINDEXED row the crawler emits no <article>, but it does emit the
  // meta description, which `tagDetail()` resolves description-first — and
  // `description` is the field these migrations repaired. That is a stable,
  // order-independent, ~0.4s surface. What it cannot see is `long_description`;
  // that field is covered by the migrations' own postconditions, which read the
  // table rather than the page, and by the indexable rows below where the
  // <article> renders the body directly.
  const meta = html.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? '';
  return { text: meta, surface: 'meta' };
}

function runCases(title: string, cases: Case[]) {
  test.describe(title, () => {
    for (const c of cases) {
      test(`/tags/${c.slug} no longer publishes ${c.was}`, async ({ request }) => {
        const { text, surface } = await proseOf(request, c.slug);

        // A sensitive row (is_sensitive / is_adult) serves the sign-in gate to
        // anon traffic on BOTH surfaces, so neither the bad string nor the good
        // one is present — asserting "the bad text is gone" there is a green
        // that means nothing. Skipping is the honest outcome; those rows are
        // covered by the migrations' own postconditions, which run against the
        // table rather than the page.
        test.skip(
          surface === 'gated',
          `/tags/${c.slug} is gated to signed-out traffic (sign-in or age) — prose not observable`,
        );

        expect(text, `/tags/${c.slug} lost even its own content (${surface})`).toMatch(c.present);
        for (const bad of c.absent) {
          expect(
            text,
            `/tags/${c.slug} still publishes ${c.was} on the ${surface} surface (matched ${bad})`,
          ).not.toMatch(bad);
        }
      });
    }
  });
}

runCases('@smoke sex glossary: wrong-sense and namesake repairs (#3807)', PASS_ONE);
runCases('sex glossary: anatomy prose that excluded part of the audience (#3810)', PASS_TWO);

// ── controls: rows the same selection regex matched and must NOT have changed ─
test.describe('sex glossary: correct-as-written rows survived', () => {
  // These matched the de-gendering regex and are RIGHT. A sweep that took them
  // too would satisfy every "the excluding prose is gone" assertion above, so
  // this is the half that catches over-reach.
  const CONTROLS: Array<{ slug: string; keep: RegExp; why: string }> = [
    {
      slug: 'penis',
      keep: /trans women, non-binary people and intersex people/i,
      why: 'the inclusive sentence #3807 added',
    },
    {
      slug: 'feminism',
      keep: /women'?s rights/i,
      why: "women's rights IS the subject",
    },
    {
      slug: 'breasts',
      keep: /a sexual focus on breasts/i,
      why: 'carries no gendered claim at all',
    },
  ];

  for (const c of CONTROLS) {
    test(`/tags/${c.slug} kept its prose — ${c.why}`, async ({ request }) => {
      const { text, surface } = await proseOf(request, c.slug);
      test.skip(surface === 'gated', `/tags/${c.slug} is sensitive-gated`);
      expect(text, `/tags/${c.slug} was swept and should not have been`).toMatch(c.keep);
    });
  }
});

// ── the 55 created rows are reachable but deliberately unpublished ───────────
test.describe('sex glossary: created rows are unpublished by design', () => {
  // POSITIVE CONTROL FIRST. "greysexual is absent from the sitemap" is equally
  // true if the sitemap broke, shrank, or 404'd. This proves the document is
  // real and lists tags before anything is asserted to be missing from it.
  test('the tag sitemap is populated and lists an indexable tag', async ({ request }) => {
    const res = await request.get('/sitemap-tags.xml', { headers: { 'User-Agent': BOT_UA } });
    expect(res.status()).toBe(200);
    const xml = await res.text();
    expect((xml.match(/<loc>/g) ?? []).length, 'sitemap should list many tags').toBeGreaterThan(500);
    expect(xml, 'an indexable tag must be present').toContain('/tags/lubricant<');
  });

  test('created rows render but are excluded from the sitemap and marked noindex', async ({
    request,
  }) => {
    const sm = await (
      await request.get('/sitemap-tags.xml', { headers: { 'User-Agent': BOT_UA } })
    ).text();

    for (const slug of ['greysexual', 'tampon', 'menstrual-cup', 'postcoital-dysphoria']) {
      const res = await request.get(`/tags/${slug}`, { headers: { 'User-Agent': BOT_UA } });
      expect(res.status(), `/tags/${slug} should exist`).toBe(200);
      const html = await res.text();
      expect(html, `/tags/${slug} should be noindex while unpublished`).toMatch(
        /<meta name="robots" content="[^"]*noindex/i,
      );
      expect(sm, `/tags/${slug} must not be in the sitemap while unpublished`).not.toContain(
        `/tags/${slug}<`,
      );
    }
  });

  test('a row left deprecated on purpose still 404s', async ({ request }) => {
    // `semen` stays deprecated: its slug is held as an alias of the active
    // `jizz`, so tag_reject_alias_shadow() refuses to revive it — and the
    // concept is reachable there. Proving it 404s proves the revive list was
    // not applied blindly.
    const res = await request.get('/tags/semen', { headers: { 'User-Agent': BOT_UA } });
    expect(res.status(), '/tags/semen should stay unresolvable').toBe(404);
  });
});

// ── Positive control for the glossary-link strip ──────────────────────────────
// unlinkGlossary() is a no-op the day the renderer renames its attribute, and a
// no-op here is invisible: the phrase assertions above would keep passing until
// the next word inside one of them became a glossary term, then go red for a
// content defect that is not there. That is not hypothetical here — this file's
// /tags/lgbti case went red on prod on 2026-09-19 for exactly that, when
// `intersex` inside "lesbian, gay, bisexual, trans and intersex" became a link.
test.describe('@smoke glossary-link strip control', () => {
  test('sex-glossary: the crawler HTML carries glossary links, and the strip removes them', async ({
    request,
  }) => {
    const res = await request.get('/tags/lgbti', { headers: { 'user-agent': BOT_UA } });
    expect(res.status(), '/tags/lgbti must be reachable').toBeLessThan(400);
    const raw = await res.text();
    expect(
      raw,
      'the renderer no longer emits ' + GLOSSARY_LINK_ATTR + ' — unlinkGlossary is now a silent no-op',
    ).toContain(GLOSSARY_LINK_ATTR);
    expect(unlinkGlossary(raw), 'unlinkGlossary left a glossary anchor behind').not.toContain(
      GLOSSARY_LINK_ATTR,
    );
  });
});
