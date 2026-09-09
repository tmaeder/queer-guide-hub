import { test, expect } from '@playwright/test';

// The queer-theory vocabulary must be READABLE, and the wrong-entity links this
// pass cleared must stay cleared.
//
// Background: most of this vocabulary existed with prose and was hidden. Two
// zero-usage sweeps deprecated glossary terms for carrying no ENTITY
// assignments — defensible for scrape residue, wrong for a glossary, since no
// venue is ever tagged "homonationalism". `search_documents_index_tags` filters
// `deprecated_at is null`, so the rows were out of search and their pages
// soft-404'd. Revived and created by 20360401100100.
//
// Same discipline as tags-wrong-sense.spec.ts, which this is modelled on:
// crawler HTML (the surface that a soft-404 or a wrong link damages lastingly),
// and EVERY case pairs a positive fingerprint with its negatives — "does not
// mention queer theory" is vacuously true on a 404 or an empty <article>.

const BOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

function articleOf(html: string): string {
  const m = html.match(/<article[\s\S]*?<\/article>/i);
  return m ? m[0] : '';
}

interface Case {
  slug: string;
  /** Proof the page rendered its own subject, not just any 200. Checked against
   *  the <article>, which is the body a crawler indexes. */
  present: RegExp;
  /** A fact that makes the entry a definition rather than a stub — the coiner,
   *  the year, the mechanism.
   *
   *  Checked against the WHOLE DOCUMENT, not the <article>, and that distinction
   *  is load-bearing. `tagDetail()` renders long_description → description →
   *  short_description into the body, so a row with a long_description shows
   *  that one there and its `description` reaches the crawler only through
   *  <meta name="description">. Asserting the coiner inside <article> failed on
   *  9 correct pages: /tags/crip-theory names Kafer, Clare and Schalk in its
   *  body while "McRuer" and "Sandahl" sit in the meta description. Both are on
   *  the page; only one is in that element.
   *
   *  Every regex below was read off the LIVE prose, not written from the
   *  Wikipedia article — guessing the wording is what produced the first
   *  version's false failures. */
  fact: RegExp;
}

const CASES: Case[] = [
  { slug: 'queer-theory', present: /queer theory/i, fact: /post-structuralis|de Lauretis|1990/i },
  { slug: 'quare-theory', present: /quare/i, fact: /Johnson|2001|grandmother/i },
  { slug: 'queer-of-color-critique', present: /queer of colo(u)?r/i, fact: /Ferguson|capitalism|liberalis/i },
  { slug: 'queer-archaeology', present: /archaeolog/i, fact: /Dowson|2000/i },
  { slug: 'queer-theology', present: /theolog/i, fact: /Althaus-Reid|Goss|sacred texts/i },
  { slug: 'neuroqueer-theory', present: /neuroqueer/i, fact: /Walker|neurodiversity|normalcy/i },
  { slug: 'crip-theory', present: /crip/i, fact: /McRuer|Sandahl|able-bodied/i },
  { slug: 'critical-disability-theory', present: /disabilit/i, fact: /social model|medical model|ableism/i },
  { slug: 'compulsory-heterosexuality', present: /compulsory heterosexualit/i, fact: /Rich|1980|institution/i },
  { slug: 'human-sexuality', present: /sexualit/i, fact: /Kinsey|Hirschfeld|Ellis|Hooker/i },
  { slug: 'transgender-studies', present: /transgender/i, fact: /Stryker|1990s|on their own terms/i },
  // Revived, not created. Their prose predates this pass, so these facts are
  // quoted from what the rows actually hold.
  { slug: 'homonormativity', present: /homonormativ/i, fact: /adoption of heterosexual norms|privileging/i },
  { slug: 'homonationalism', present: /homonationalis/i, fact: /nationalist agendas|strategic acceptance/i },
  { slug: 'cisnormativity', present: /cisnormativ/i, fact: /ought to be, cisgender|cissexual assumption/i },
  // NOT fact-checked: `gender-performativity`. Its stored description is the
  // SOCIAL CONSTRUCTION OF GENDER text ("The social construction of gender is a
  // theory in the humanities and social sciences…") — a pre-existing
  // subject mismatch on the row, not something this pass introduced and not
  // something to encode an expectation around. Its subject rendering is still
  // asserted below; the prose defect is recorded rather than asserted away.
  { slug: 'gender-performativity', present: /performativ/i, fact: /gender/i },
];

test.describe('@smoke the queer-theory glossary is readable', () => {
  for (const c of CASES) {
    test(`/tags/${c.slug} renders a definition`, async ({ request }) => {
      const res = await request.get(`/tags/${c.slug}`, { headers: { 'User-Agent': BOT_UA } });
      // A deprecated tag 404s outright. That is the exact regression this pass
      // fixed, so unlike the wrong-sense spec there is no skip here: an empty
      // <article> IS the failure — it is what detail.ts emits for
      // `seo_indexable = false`, and eight revived rows shipped in that state
      // because the revive never set the flag (repaired in 20361001100100).
      expect(res.status(), `/tags/${c.slug} should resolve`).toBe(200);

      const html = await res.text();
      const article = articleOf(html);
      expect(article, `/tags/${c.slug} rendered no <article> — deprecated or deindexed again`)
        .not.toBe('');
      expect(article, `/tags/${c.slug} lost its own subject`).toMatch(c.present);
      expect(html, `/tags/${c.slug} has no substantive definition anywhere on the page`)
        .toMatch(c.fact);
    });
  }
});

test.describe('wrong-entity links stay cleared', () => {
  // POSITIVE CONTROL FIRST. Every assertion below is "the page does not link
  // Q658022", which passes just as happily if the Wikidata band stopped
  // rendering, if the page 404s, or if the corpus lost its identifiers. This
  // proves the band still reaches a reader with a CORRECT identifier on it.
  test('a correct Wikidata identifier still publishes', async ({ request }) => {
    const res = await request.get('/tags/queer-theory', { headers: { 'User-Agent': BOT_UA } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html, 'queer-theory should carry its own QID Q658022').toMatch(/Q658022/);
  });

  // `queerness` held Q658022 ("queer theory") — a live, indexable page with
  // usage_count 55 pointing at a different concept. Cleared to NULL rather
  // than repointed: the weekly tag_wikidata_hierarchy and tag_medical_codes
  // syncs rebuild from this column, so a plausible-but-wrong id regenerates
  // wrong data forever while a null one regenerates nothing.
  test('queerness no longer claims to be queer theory', async ({ request }) => {
    const res = await request.get('/tags/queerness', { headers: { 'User-Agent': BOT_UA } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html, 'queerness page did not render').toMatch(/queer/i);
    expect(html, 'queerness still links Q658022 (queer theory)').not.toMatch(/Q658022/);
  });

  // disidentification held Q5252408 = "deidentification", a psychological
  // process. Muñoz's concept has no Wikipedia article at all — the title
  // redirects to a data-privacy topic — so the honest state is no identifier.
  test('disidentification no longer links the psychology concept', async ({ request }) => {
    const res = await request.get('/tags/disidentification', { headers: { 'User-Agent': BOT_UA } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html, 'disidentification page did not render').toMatch(/disidentif/i);
    expect(html, 'disidentification still links Q5252408 (deidentification)')
      .not.toMatch(/Q5252408/);
  });
});

test.describe('the scholars are visible', () => {
  // Sedgwick and Warner existed as draft rows with an EMPTY bio — invisible to
  // the crawler, the sitemap, search and the SPA alike. Warner is the reason
  // /tags/heteronormativity has a definition at all.
  const PEOPLE = [
    { slug: 'eve-kosofsky-sedgwick', fact: /Epistemology of the Closet/i },
    { slug: 'michael-warner', fact: /heteronormativ/i },
    { slug: 'jose-esteban-munoz', fact: /Disidentification/i },
    { slug: 'gayle-rubin', fact: /rubin|sex|gender/i },
  ];

  for (const p of PEOPLE) {
    test(`/personalities/${p.slug} is public and has a bio`, async ({ request }) => {
      const res = await request.get(`/personalities/${p.slug}`, {
        headers: { 'User-Agent': BOT_UA },
      });
      // functions/_lib/detail.ts filters visibility=eq.public for crawlers, so
      // a draft row is indistinguishable from a missing one here — which is
      // precisely the state this pass corrected.
      expect(res.status(), `/personalities/${p.slug} should resolve`).toBe(200);
      const article = articleOf(await res.text());
      expect(article, `/personalities/${p.slug} rendered no <article> — still draft?`).not.toBe('');
      expect(article, `/personalities/${p.slug} has no substantive bio`).toMatch(p.fact);
    });
  }
});
