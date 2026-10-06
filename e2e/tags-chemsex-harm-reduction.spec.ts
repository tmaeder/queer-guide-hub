import { test, expect } from '@playwright/test';
import { GLOSSARY_LINK_ATTR, glossaryEntry, unlinkGlossary } from './support/glossaryProse';
import { anonHeaders, SUPABASE_REST_URL } from './support/anonKey';

// The chemsex / harm-reduction corner of the glossary, verified on the surface a
// non-JS crawler actually indexes.
//
// Source of the content: the AIDS Action Europe chemsex training manual (Poulios,
// 2023) and the Chemsex First Aid action sheet (Stuart & Labayen De Inza, 2018),
// applied by `*_chemsex_harm_reduction_source_pass.sql`.
//
// TWO SURFACES, DIFFERENT COLUMNS — this is the trap the spec exists to catch.
// `functions/_lib/detail.ts` builds its <article> as
//   long_description ?? description ?? short_description
// while the SPA's TagDetail renders `description` first. So a prose fix written only
// to `description` is visible to a reader and invisible to Google on any tag that has
// a long body — and ghb, mephedrone and chemsex all have one. The crawler cases below
// are therefore the load-bearing half; the single browser case at the bottom covers
// the reader-facing column the crawler never reads.
//
// Every case pairs a POSITIVE fingerprint with the NEGATIVE it is really about. A
// bare "does not say X" also passes on a 404, on an empty body, and on a page that
// failed to render.

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

// `articleOf` moved to e2e/support/glossaryProse.ts, which `glossaryEntry`
// wraps: the prose a slug publishes now comes from the crawler <article> only
// while the tag is publication_role='article'.

interface Case {
  slug: string;
  /** Proof the page rendered its own subject. */
  present: RegExp;
  /** What must not be there. Empty for pages that are new rather than corrected. */
  absent?: RegExp[];
  why: string;
}

/** Tags this pass created or revived. Each must exist and define itself. */
const NEW_OR_REVIVED: Case[] = [
  {
    slug: 'gbl',
    present: /not interchangeable|stronger|fatal/i,
    why: 'GBL needs its own page: it is the form most G is sold in and is not dose-equivalent to GHB',
  },
  {
    slug: 'g-hole',
    present: /breath|unconscious|wake/i,
    why: 'the G overdose state — most G deaths happen here',
  },
  { slug: 'comedown', present: /pleasure|exhaust|flat|anxiety/i, why: 'the days after a session' },
  { slug: 'booty-bumping', present: /rectal|rectum/i, why: 'a named route of administration' },
  {
    slug: 'priapism',
    present: /erection/i,
    why: 'chems plus erection drugs, a two-hour hospital clock',
  },
  {
    slug: 'spiking',
    present: /without them knowing|consent|assault/i,
    why: 'dosing someone without consent',
  },
  {
    slug: 'cocaethylene',
    present: /cocaine|alcohol|liver/i,
    why: 'why cocaine plus alcohol is worse than either',
  },
  { slug: 'crystal-dick', present: /meth|erection|blood flow/i, why: 'the community term' },
  {
    slug: 'ketamine-bladder',
    present: /bladder|urinary|urgency/i,
    why: "ketamine's signature long-term harm",
  },
  {
    slug: 'cathinones',
    present: /rolling series of near-identical powders/i,
    why: 'the class term both sources use; mephedrone, 3-MMC and 4-CMC hang off it',
  },
  {
    slug: 'k-hole',
    present: /cannot consent to anything/i,
    why: 'the ketamine counterpart to the G-hole; a clinical definition leaves out the consent half',
  },
  {
    slug: 'drug-induced-psychosis',
    present: /lower the stimulation|missed sleep|insects under the skin/i,
    why: 'two pages of the First Aid sheet are about this, and the crawler body was a generic stub',
  },
  {
    slug: 'chillout-room',
    present: /nothing is expected of anyone/i,
    why: 'a named harm-reduction measure, not a general amenity',
  },
];

test.describe('chemsex glossary — crawler surface', () => {
  for (const c of NEW_OR_REVIVED) {
    test(`/tags/${c.slug} exists and defines itself`, async ({ request }) => {
      const { prose } = await glossaryEntry(request, c.slug);
      expect(prose, `/tags/${c.slug} has no definition — ${c.why}`).toMatch(c.present);
    });
  }

  test('/tags/ghb states that GBL is not dose-interchangeable', async ({ request }) => {
    // The single most repeated warning in both sources, and the one the page did not
    // carry: it introduced GBL only as a precursor "which the body converts into it".
    const { prose } = await glossaryEntry(request, 'ghb');
    expect(prose, 'the GHB page lost its own definition').toMatch(/depressant/i);
    expect(prose, 'the GBL potency warning is missing from the published body').toMatch(
      /not interchangeable/i,
    );
  });

  test('/tags/mephedrone carries the cathinone cardiac warning', async ({ request }) => {
    // The long body was a Wikipedia stub ending "It is a group of stereoisomers" —
    // accurate, and containing no harm-reduction content at all.
    const { prose } = await glossaryEntry(request, 'mephedrone');
    expect(prose).toMatch(/cathinone/i);
    expect(prose, 'the cardiac warning never reached the published body').toMatch(
      /constrict blood vessels|heart attack/i,
    );
  });

  test('/tags/party-and-play resolves to the chemsex entry rather than 404ing', async ({
    request,
  }) => {
    // Chemsex and Party & Play were the same concept as two tags, in two categories,
    // disagreeing on is_sensitive. Merged — and a merged slug must redirect, not
    // soft-404. This repo has had merged tags return HTTP 200 on a not-found body
    // before, so the status alone proves nothing: the body has to be the chemsex page.
    const res = await request.get('/tags/party-and-play', { headers: { 'User-Agent': BOT_UA } });
    expect(res.status(), '/tags/party-and-play should still resolve').toBe(200);
    // Measured on prod: a real 301 to /tags/chemsex, which `request.get` follows.
    expect(res.url(), 'the merged slug did not redirect to the canonical tag').toMatch(
      /\/tags\/chemsex$/,
    );
    // Asserted over the <article>, never the raw HTML: a bare /404|not found/ scan of a
    // whole SPA document hits asset names and inline boot-guard script, which is exactly
    // how the first version of this test failed against a perfectly healthy page.
    const { prose } = await glossaryEntry(request, 'chemsex');
    expect(prose, 'the merged slug does not serve the chemsex entry').toMatch(
      /chemsex|sex with drugs|sex on drugs/i,
    );
  });

  test('a tag untouched by this pass still renders', async ({ request }) => {
    // Control. Without it, every "200 + matches /x/" above would also pass if the
    // crawler template had started serving one generic body for every slug.
    const { prose } = await glossaryEntry(request, 'poppers');
    expect(prose).toMatch(/nitrite|inhal/i);
    // And it must NOT match the fingerprints of the pages above — proof the
    // publisher serves per-slug content rather than one shared body.
    expect(prose).not.toMatch(/not interchangeable/i);
  });
});

test.describe('chemsex glossary — reader surface', () => {
  test('the chemsex summary no longer calls GHB a stimulant', async ({ request }) => {
    // The error lived in `description`. The crawler's <article> never reaches that column
    // on a tag with a long body — but its <meta name="description"> does: detail.ts builds
    // the summary as `description ?? short_description ?? long_description`, mirroring the
    // SPA's useMeta precedence exactly. So this asserts the reader-facing column on a
    // surface that is always reachable.
    //
    // It is NOT a browser test, and that is deliberate rather than convenient: /tags/chemsex
    // is is_sensitive, so the SPA wraps it and #about does not exist for an anonymous
    // visitor. A browser assertion here fails for gating reasons that have nothing to do
    // with the prose — which is exactly how the first version of this test failed.
    const res = await request.get('/tags/chemsex', { headers: { 'User-Agent': BOT_UA } });
    expect(res.status()).toBe(200);
    const meta = (await res.text()).match(/<meta name="description" content="([^"]*)"/i)?.[1];
    expect(meta, '/tags/chemsex emitted no meta description').toBeTruthy();

    // GHB is a CNS depressant. The distinction is the whole basis of chemsex first aid:
    // too much G stops someone breathing, too much meth is a heart and temperature
    // emergency, and the two need opposite responses.
    expect(meta, 'GHB is still grouped with the stimulants').not.toMatch(
      /stimulants like methamphetamine, mephedrone or GHB/i,
    );
    expect(meta, 'the stimulant/depressant split is not stated').toMatch(/depressant/i);
  });

  test('a non-gated entry from this pass renders in a real browser', async ({ page }) => {
    // One browser case so the suite is not purely HTTP. `priapism` is filed Sexual Health
    // and is not sensitive, so it renders for an anonymous visitor with no gate in the way.
    await page.goto('/tags/priapism');
    await expect(page.locator('h1')).toContainText(/priapism/i, { timeout: 20_000 });
    await expect(page.locator('body')).toContainText(/erection/i);
  });
});

// ── Positive control for the glossary-link strip ──────────────────────────────
// unlinkGlossary() is a no-op the day the renderer renames its attribute, and a
// no-op here is invisible: the phrase assertions above would keep passing until
// the next word inside one of them became a glossary term, then go red for a
// content defect that is not there. So assert the strip had something to do.
//
// IT NO LONGER PICKS A PAGE. It used to assert against /tags/k-hole, and that
// stopped working for a reason that is not a renderer bug: the link vocabulary
// is the view `glossary_link_terms_public`, which gates on `seo_indexable`, and
// the correctness-first demotion took it from thousands of terms to **36**
// (measured on prod 2026-10-05). With a vocabulary that small, whether any
// given page happens to contain a linkable term is luck, so an assertion tied
// to one slug reports the vocabulary's size as a renderer failure.
//
// The two things actually worth catching are asserted directly instead: the
// vocabulary going empty (links off entirely), and unlinkGlossary failing to
// strip an anchor built from a term the vocabulary really contains.
test.describe('@smoke glossary-link strip control', () => {
  test('chemsex: the link vocabulary is live, and the strip removes its anchors', async ({
    request,
  }) => {
    const headers = await anonHeaders(request);
    const res = await request.get(
      `${SUPABASE_REST_URL}/rest/v1/glossary_link_terms_public?select=slug,surface_form&limit=1`,
      { headers },
    );
    expect(res.ok(), 'could not read the glossary link vocabulary').toBe(true);
    const terms = (await res.json()) as Array<{ slug: string; surface_form: string }>;
    expect(
      terms.length,
      'the glossary link vocabulary is EMPTY — no inline link can render anywhere, ' +
        'and unlinkGlossary is a silent no-op',
    ).toBeGreaterThan(0);

    const anchor =
      `<p>see <a href="/tags/${terms[0].slug}" ${GLOSSARY_LINK_ATTR}="${terms[0].slug}">` +
      `${terms[0].surface_form}</a> for more</p>`;
    const stripped = unlinkGlossary(anchor);
    expect(stripped, 'unlinkGlossary left a glossary anchor behind').not.toContain(
      GLOSSARY_LINK_ATTR,
    );
    expect(stripped, 'unlinkGlossary ate the linked text as well as the anchor').toContain(
      terms[0].surface_form,
    );
  });
});
