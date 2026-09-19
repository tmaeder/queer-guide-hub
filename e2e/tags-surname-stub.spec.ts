import { test, expect } from '@playwright/test';

// A glossary entry must not publish an English Wikipedia SURNAME STUB, and a
// summary must not name a different subject than the entry.
//
// Third sibling of tags-wrong-entity.spec.ts and tags-wrong-sense.spec.ts.
// There the tag adopted a different entity, or the generic dictionary sense of
// its own word. Here the producer resolved a GERMAN OCCUPATION NOUN against
// English Wikipedia by NAME and was answered with a surname disambiguation
// list: Kuenstler (artist), Maler (painter), Taenzer (dancer), Zeichner
// (illustrator), Sprecher (speaker), Lehrer (teacher), Faerber (dyer), Kerle
// (guys). short_description was NULL and long_description empty on all eight,
// so the stub WAS the page. Repaired in 99960101100100.
//
// TWO SURFACES, and they need opposite assertions — which is the whole reason
// this file exists rather than another CASES row in the sibling spec:
//
//   * The eight stubs are now DEINDEXED. Per tags-wrong-sense.spec.ts, a
//     deindexed tag emits NO <article>, so "the surname list is absent from
//     the article" is vacuously true and would be green against an unfixed
//     corpus. What IS observable, and is the fix's own mechanism, is that the
//     thin-page gate's decision reaches the crawler as robots noindex — the
//     migration never wrote seo_indexable, the gate did.
//
//   * `queening` stays INDEXABLE, so it carries the full paired shape: the
//     correct prose must be present and the wrong summary gone.
//
// The CONTROL matters more than usual here. "No surname list anywhere on
// /tags/*" also passes if the route broke, if every tag deindexed, or if the
// crawler renderer stopped emitting prose at all — so a known-good row from
// the same 2026-08-30 cohort must still render, indexable, with its own text.

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const SURNAME_STUB = [/is a surname/i, /Notable people with the (surname|given name|name)/i];

/** The tag's own prose block, excluding the nav/rails that follow it. */
function articleOf(html: string): string {
  const m = html.match(/<article[\s\S]*?<\/article>/i);
  return m ? m[0] : '';
}

function isNoindex(html: string): boolean {
  return /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html);
}

test.describe('@smoke glossary entries do not publish a surname stub', () => {
  // The eight German occupation/common nouns. Deindexed by the thin-page gate
  // once their stub prose was nulled, so the assertion is the gate's own stamp
  // plus a document-wide absence of the stub.
  for (const slug of [
    'farber',
    'kerle',
    'kuenstler',
    'lehrer',
    'maler',
    'sprecher',
    'tanzer',
    'zeichner',
  ]) {
    test(`/tags/${slug} publishes no surname list and is deindexed`, async ({ request }) => {
      const res = await request.get(`/tags/${slug}`, {
        headers: { 'User-Agent': BOT_UA },
      });
      // The row is still ACTIVE — nulling prose deindexes, it never deletes.
      expect(res.status(), `/tags/${slug} should still resolve`).toBe(200);
      const html = await res.text();

      // The mechanism. trg_tag_thin_page_gate sets seo_indexable=false and
      // stamps seo_deindex_reason='thin' by itself once tag_has_prose() goes
      // false; 99960101100100 deliberately never wrote the column. If this
      // fails, either the gate stopped firing or something re-published the
      // row with prose nobody reviewed.
      expect(
        isNoindex(html),
        `/tags/${slug} is indexable again — the thin-page gate did not hold`,
      ).toBe(true);

      // Document-wide, not article-scoped: a deindexed page has no <article>,
      // so scoping here is what would make it vacuous.
      for (const bad of SURNAME_STUB) {
        expect(
          html,
          `/tags/${slug} still publishes a surname disambiguation list (matched ${bad})`,
        ).not.toMatch(bad);
      }
    });
  }

  // POSITIVE CONTROL for the whole describe block. Without it, every
  // assertion above is satisfied by a site that stopped serving tag prose.
  test('a good row from the same cohort still renders and stays indexable', async ({ request }) => {
    const res = await request.get('/tags/safe-call', {
      headers: { 'User-Agent': BOT_UA },
    });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(isNoindex(html), '/tags/safe-call was deindexed — the repair over-reached').toBe(false);
    expect(articleOf(html), '/tags/safe-call renders no prose').toMatch(/safe call|check[- ]in/i);
  });
});

test.describe('a glossary summary names its own subject', () => {
  // `queening` carried a correct description AND a correct 400-char body while
  // its one-line summary read "Drag culture performance art". That line is the
  // page lead and, because search_documents_index_tags emits
  // coalesce(short_description, description), it was also what site search
  // returned. The summary was NULLED rather than rewritten, so the indexer's
  // existing coalesce falls through to the row's own correct description —
  // which is why the POSITIVE fingerprint below is the facesitting definition
  // and not merely the word "queening".
  test('/tags/queening is facesitting, not drag performance', async ({ request }) => {
    const res = await request.get('/tags/queening', {
      headers: { 'User-Agent': BOT_UA },
    });
    expect(res.status()).toBe(200);
    const html = await res.text();

    // Still indexable — this row was never thin, only mislabelled.
    expect(
      isNoindex(html),
      '/tags/queening was deindexed; the summary fix should not have changed its prose gate',
    ).toBe(false);

    const article = articleOf(html);
    expect(article, '/tags/queening renders no prose').toMatch(/facesitting|sitting on a partner/i);
    expect(html, '/tags/queening still publishes the drag summary').not.toMatch(
      /Drag culture performance art/i,
    );
  });
});
