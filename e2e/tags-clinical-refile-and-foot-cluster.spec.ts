import { test, expect } from '@playwright/test';
import { glossaryEntry } from './support/glossaryProse';
import { anonHeaders, SUPABASE_REST_URL } from './support/anonKey';

// Two glossary repairs, asserted on the surface a reader and a crawler actually
// get: 20261219100000 (foot cluster) and 20261220114500 (anorgasmia merge).
//
// WHAT THESE GUARD, and why each is a property rather than a value:
//
// (1) A CLINICAL CONDITION MUST NOT PUBLISH AS A FETISH. `orgasmic-dysfunction`
//     is seo_indexable and its own description cites ICD-11 HA02, and until
//     20261220114500 its crawler HTML literally read "Category: Fetishes"
//     (measured on prod 2026-09-04). Its deprecated twin `anorgasmia` was filed
//     under Sexual Health all along. Same shape as vaginismus vs
//     sexual-pain-penetration-disorder in the 2026-08-29 alias cleanup.
//
// (2) A MERGED TERM MUST RESOLVE, NOT 404. `resolve_tag_slug` consults
//     unified_tags and tag_slug_redirects but NOT tag_aliases, so the
//     pre-existing `anorgasmia` alias made the word findable in SEARCH while
//     /tags/anorgasmia answered a hard 404. "Anorgasmia" is the Wikipedia title
//     and the more searched word of the pair.
//
// (3) AN ATTRACTION AND A PRACTICE ARE DIFFERENT PAGES. `foot-fetish`
//     (Q463859, an attraction) and `foot-worship` (a practice) were both active
//     on the SAME Wikidata item, and foot-worship's identifiers, aliases and
//     prose were all foot-fetishism's.
//
// (4) UNPUBLISHED PROSE MUST BE GATED, NOT SERVED. foot-worship's prose was
//     rewritten, which cleared its review flag by design. A sensitive+unverified
//     tag is admitted to anon by `unified_tags_public_gated_read` only when
//     reviewed/locked, so the honest answer is a sign-in gate. Asserting the
//     PROSE here would be wrong — the point is that it is withheld.
//
// Discipline copied from tags-wrong-sense / tags-gated-sign-in: raw HTTP
// (~0.4s a GET, and signed-out by construction — the default project carries an
// admin storageState when creds are set, which is exactly the trap that broke
// earlier signed-out specs), and EVERY negative paired with a POSITIVE CONTROL,
// because "does not say Fetishes" is vacuously true of a 404 or an empty body.

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

test.describe('@safety glossary: clinical re-file and the foot cluster', () => {
  test('orgasmic-dysfunction is filed under Sexual Health, not Fetishes', async ({ request }) => {
    const { prose: article } = await glossaryEntry(request, 'orgasmic-dysfunction');
    // POSITIVE CONTROL: the clinical page really published prose. Without this,
    // every assertion below passes on an empty body or an error page.
    expect(article, 'clinical prose must be present').toMatch(/orgasm/i);

    // The defect: a clinical condition shelved as a fetish, on an indexable page.
    // The category is read from the registry, not scraped out of the <article>:
    // that line is crawler chrome, and a demoted tag emits no <article> to
    // carry it. The filing is the claim; the chrome was only ever its carrier.
    const headers = await anonHeaders(request);
    const catRes = await request.get(
      `${SUPABASE_REST_URL}/rest/v1/unified_tags?slug=eq.orgasmic-dysfunction&select=category`,
      { headers },
    );
    expect(catRes.ok(), 'could not read the tag category').toBe(true);
    const cat = ((await catRes.json()) as Array<{ category: string | null }>)[0]?.category ?? '';
    expect(cat, 'a clinical dysfunction must not publish under Fetishes').not.toMatch(/fetish/i);
    expect(cat).toMatch(/Sexual Health/i);
  });

  // The merged twin must lead somewhere. Asserted as a PROPERTY — "a reader who
  // types the more common word reaches the clinical page" — rather than as a
  // status code, so it holds whether the app 301s or renders the target
  // directly (Playwright's request context follows redirects either way).
  test('anorgasmia resolves to the clinical page instead of 404ing', async ({ request }) => {
    const res = await request.get('/tags/anorgasmia', { headers: { 'User-Agent': BOT_UA } });

    expect(res.status(), 'a merged term must not answer 404').not.toBe(404);
    const html = await res.text();

    // POSITIVE CONTROL: it landed on the real clinical page, not merely "not a
    // 404" — an empty 200 would satisfy the line above on its own.
    expect(html).toMatch(/orgasmic-dysfunction/i);
    const { prose: landed } = await glossaryEntry(request, 'orgasmic-dysfunction');
    expect(landed, 'must land on the clinical page').toMatch(/orgasm/i);
  });

  test('foot-fetish still publishes the attraction sense and stays indexable', async ({
    request,
  }) => {
    // POSITIVE CONTROL first — it is the row that legitimately owns Q463859.
    //
    // "It changed shelf, not content: it must not have been deindexed by the
    // re-file" is still the claim, and glossaryEntry() is what carries it now:
    // a tag that loses its <article> while the registry still calls it
    // publication_role='article' fails there. So the collateral damage a
    // category write can cause is still caught; what is tolerated is the
    // deliberate correctness-first demotion, a different mechanism with a
    // stated reason on the row. See e2e/support/glossaryProse.ts.
    const { prose } = await glossaryEntry(request, 'foot-fetish');
    expect(prose).toMatch(/foot/i);
  });

  // Both rows were created/rewritten with machine-written prose and therefore
  // held UNPUBLISHED, and until 2026-09-04 these two cases asserted the sign-in
  // gate. `20270107114500` published them after a human read, so the assertion
  // is inverted here rather than deleted: the behaviour changed deliberately,
  // and the pages still need pinning — now to the published state.
  //
  // Each case still pairs a POSITIVE fingerprint from the specific reviewed body
  // with the negatives, so a blank page, a gate or a 404 all fail. That matters
  // more after publishing than before: an empty `<article>` would satisfy "not
  // noindex" on its own.
  const PUBLISHED: Array<{ slug: string; fingerprint: RegExp }> = [
    // Distinguishes the practice from the attraction — the whole point of
    // 20261219100000, and the sentence a wrong-sense rewrite would lose first.
    { slug: 'foot-worship', fingerprint: /a practice rather than an attraction/i },
    // The risk framing, which is the part of this body worth not silently losing.
    { slug: 'footjob', fingerprint: /non-penetrative/i },
  ];

  for (const { slug, fingerprint } of PUBLISHED) {
    test(`${slug} serves its reviewed prose to a signed-out visitor`, async ({ request }) => {
      // POSITIVE CONTROL: the reviewed body is actually being served, so the
      // negatives below cannot pass on an empty or gated page. glossaryEntry
      // also carries the indexability guarantee that `robotsOf` used to assert
      // here — it fails on a tag that lost its <article> while the registry
      // still calls it an article, and tolerates only the deliberate
      // correctness-first demotion. See e2e/support/glossaryProse.ts.
      const { prose, html } = await glossaryEntry(request, slug);
      expect(prose, `${slug} must serve its reviewed body`).toMatch(fingerprint);
      // The gate is gone and the crawler is welcome.
      expect(html, 'a published term must not offer a sign-in gate').not.toMatch(
        /sign in to view/i,
      );
    });
  }
});
