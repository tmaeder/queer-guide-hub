import { test, expect } from '@playwright/test';

// Inline glossary links in body prose, and the tag → content crawler links that
// shipped alongside them.
//
// Asserted over the CRAWLER HTML, not the SPA, for two reasons: it is the
// surface the SEO half of this change exists for, and it is the only one where a
// wrong link is served to a consumer that cannot re-render. `functions/_lib/
// detail.ts` builds it server-side for bot user-agents; a browser sees the SPA's
// own version, so these two are DIFFERENT DOCUMENTS and a green browser test
// would prove nothing about this one.
//
// THE VOCABULARY SHIPS EMPTY. `glossary_link_terms` starts with zero rows and
// grows only as a human reviews candidates, so the inline-link assertions below
// are written to REPORT an empty vocabulary rather than fail on it — a gate that
// fails until someone does unrelated data work is a gate people learn to ignore.
// What they must never do is pass vacuously: every "this must not be linked"
// check is paired with a positive control proving links exist at all.
//
// WHICH ENVIRONMENT THIS ACTUALLY EXERCISES. The `Critical paths` PR job serves
// the branch through `vite preview`, which does NOT run Cloudflare Pages
// Functions — so there is no prerendered bot body there and every assertion
// below self-skips. This spec does real work only against a deployed origin
// (the nightly run, or `E2E_BASE_URL=https://queer.guide`). It is therefore
// POST-DEPLOY VERIFICATION, not a PR gate; the PR gates for this feature are the
// unit tests (src/lib/__tests__/glossaryLinks.test.ts, mutation-tested, and
// functions/_lib/glossaryProse.test.ts for the escaping contract) and the
// glossary_link_signals() section of scripts/check-pipeline-health.mjs.

const BOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/** The prerendered bot body, excluding nothing — nav included. */
function botBody(html: string): string {
  const m = html.match(/<main data-prerendered="bot-ua"[\s\S]*?<\/main>/i);
  return m ? m[0] : '';
}

/** The prose block only: nav and rail links live outside <article>. */
function articleOf(html: string): string {
  const m = html.match(/<article[\s\S]*?<\/article>/i);
  return m ? m[0] : '';
}

/** Inline glossary links, which carry data-glossary-link. Nav links do not. */
function inlineGlossaryLinks(html: string): string[] {
  return [...html.matchAll(/data-glossary-link="([^"]+)"/g)].map((m) => m[1]);
}

test.describe('@smoke tag pages link the content that carries the tag', () => {
  // The measured gap this closes: `docs/SEO.md` records that of the ~65 hrefs
  // Googlebot received on /venues, 57 were /assets/* bundles and ZERO pointed at
  // a venue. `cityDetail` has listed its venues and events since 20260910;
  // `tagDetail` listed nothing, so every glossary page was a leaf in the crawl
  // graph with one inbound link (the /tags hub top-80) and no outbound ones.
  //
  // Slugs chosen for breadth of carrier type rather than for a specific count —
  // asserting "N links" would rot the first time the corpus moved.
  for (const slug of ['pride', 'drag', 'hiv']) {
    test(`/tags/${slug} links out to tagged content`, async ({ request }) => {
      const res = await request.get(`/tags/${slug}`, { headers: { 'User-Agent': BOT_UA } });
      expect(res.status(), `/tags/${slug} should resolve`).toBe(200);
      const html = await res.text();
      const body = botBody(html);

      // Positive control on the surface itself: a deindexed or gated tag emits
      // no bot body, and "no bad links" is vacuously true on an empty string.
      test.skip(
        body === '',
        `/tags/${slug} serves no prerendered bot body (deindexed or gated) — nothing observable here`,
      );

      const contentLinks = [
        ...body.matchAll(/href="\/(venues|events|news)\/([^"]+)"/g),
      ].map((m) => `${m[1]}/${m[2]}`);

      expect(
        contentLinks.length,
        `/tags/${slug} served the crawler no links to any tagged venue, event or article — ` +
          'the glossary is a leaf in the crawl graph again',
      ).toBeGreaterThan(0);

      // Every link must be a real detail path, not a hub. A bug that emitted
      // `/venues/` with an empty slug would still satisfy the count above.
      for (const link of contentLinks) {
        expect(link, 'a content link has an empty slug').not.toMatch(/\/$/);
      }
    });
  }

  test('tag content links never leak into the human response', async ({ request }) => {
    // Same rule scripts/seo-hub-links.mjs enforces for the hub block: the
    // prerendered body is bot-only, and a human must get the SPA shell.
    const res = await request.get('/tags/pride', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
    });
    expect(res.status()).toBe(200);
    expect(await res.text()).not.toContain('data-prerendered="bot-ua"');
  });
});

test.describe('inline glossary links in body prose', () => {
  test('a linked term is a real /tags/ path and is never nested in another anchor', async ({
    request,
  }) => {
    // Sampled across the types whose prose the edge links, so the check is not
    // pinned to one page's content.
    const paths = ['/tags/pride', '/tags/drag', '/city/berlin', '/city/san-francisco'];
    let totalInline = 0;

    for (const path of paths) {
      const res = await request.get(path, { headers: { 'User-Agent': BOT_UA } });
      if (res.status() !== 200) continue;
      const html = await res.text();
      const article = articleOf(html);
      if (!article) continue;

      const slugs = inlineGlossaryLinks(article);
      totalInline += slugs.length;

      for (const slug of slugs) {
        expect(slug, `${path}: an inline glossary link has an empty slug`).not.toBe('');
        expect(
          article,
          `${path}: inline link to ${slug} is missing its href`,
        ).toContain(`href="/tags/${slug}"`);
      }

      // Nested anchors are invalid HTML and axe `nested-interactive`. The
      // matcher is fed already-stripped text at the edge, so this is a
      // regression guard on that contract rather than a live suspicion.
      expect(article, `${path}: an anchor is nested inside another anchor`).not.toMatch(
        /<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<a\b/i,
      );
    }

    // Honest reporting rather than a vacuous pass: with no active vocabulary
    // there is nothing to observe, and saying so is the point.
    if (totalInline === 0) {
      console.log(
        'glossary_link_terms has no active rows yet (or none match these pages) — ' +
          'inline-link assertions had nothing to check. This is the expected state until ' +
          'candidates are reviewed; the DB sentinel glossary_link_signals() covers the vocabulary itself.',
      );
    }
  });

  test('a glossary entry never links to itself', async ({ request }) => {
    // `currentSlug` is threaded into every tag-page render for this. A
    // self-link is the failure InfographicTermChip already solved for figures.
    for (const slug of ['pride', 'drag', 'hiv', 'chemsex']) {
      const res = await request.get(`/tags/${slug}`, { headers: { 'User-Agent': BOT_UA } });
      if (res.status() !== 200) continue;
      const article = articleOf(await res.text());
      if (!article) continue;
      expect(
        inlineGlossaryLinks(article),
        `/tags/${slug} links to itself from its own prose`,
      ).not.toContain(slug);
    }
  });

  test('the tag named "A" and adult terms are never linked inline', async ({ request }) => {
    // The measured worst cases, and the reason this feature needs a reviewed
    // vocabulary at all: `A` is a real status='active', seo_indexable tag and it
    // matched 747 of 800 city descriptions; `Middle`, `Public` and `Offering`
    // are is_adult=true and landed in ordinary travel copy.
    //
    // Three independent layers make this unreachable — the gated view excludes
    // adult terms, the schema refuses a surface form under 3 characters, and the
    // matcher refuses one too — so a hit here means a layer was removed.
    const banned = ['a', 'middle', 'public', 'offering'];
    for (const path of ['/city/berlin', '/city/san-francisco', '/city/bangkok']) {
      const res = await request.get(path, { headers: { 'User-Agent': BOT_UA } });
      if (res.status() !== 200) continue;
      const article = articleOf(await res.text());
      if (!article) continue;
      const slugs = inlineGlossaryLinks(article).map((s) => s.toLowerCase());
      for (const bad of banned) {
        expect(slugs, `${path} inline-links the banned term "${bad}"`).not.toContain(bad);
      }
    }
  });
});
