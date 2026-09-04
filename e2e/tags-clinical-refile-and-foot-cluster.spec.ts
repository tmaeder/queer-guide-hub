import { test, expect } from '@playwright/test';

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

/** The crawler-visible prerender block; '' when the edge injected none. */
function prerendered(html: string): string {
  const m = html.match(/<main data-prerendered="bot-ua">([\s\S]*?)<\/main>/i);
  return m ? m[1] : '';
}

/** Tag-page prose block with markup stripped, entities decoded, space-collapsed. */
function articleText(html: string): string {
  const m = html.match(/<article[\s\S]*?<\/article>/i);
  if (!m) return '';
  return (
    m[0]
      .replace(/<[^>]+>/g, ' ')
      // `&amp;` is decoded LAST, not first. Decoding it first turns
      // `&amp;quot;` into `&quot;` and the next rule then turns that into `"`,
      // so text that legitimately contained the literal string `&quot;` comes
      // out as a quote character — double-unescaping. CodeQL's js/double-escaping
      // caught this on the first version of this file, which had the `&amp;`
      // rule at the top.
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function robotsOf(html: string): string {
  const m = html.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i);
  return m ? m[1].toLowerCase() : '';
}

test.describe('@safety glossary: clinical re-file and the foot cluster', () => {
  test('orgasmic-dysfunction is filed under Sexual Health, not Fetishes', async ({ request }) => {
    const res = await request.get('/tags/orgasmic-dysfunction', {
      headers: { 'User-Agent': BOT_UA },
    });
    expect(res.status()).toBe(200);
    const html = await res.text();
    const article = articleText(html);

    // POSITIVE CONTROL: the clinical page really rendered. Without this, every
    // assertion below passes on an empty body or an error page.
    expect(prerendered(html), 'edge must prerender for a crawler').not.toBe('');
    expect(article, 'clinical prose must be present').toMatch(/orgasm/i);

    // The defect: a clinical condition shelved as a fetish, on an indexable page.
    expect(article, 'a clinical dysfunction must not publish under Fetishes')
      .not.toMatch(/Category:\s*Fetish/i);
    expect(article).toMatch(/Category:\s*Sexual Health/i);
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
    expect(articleText(html), 'must land on the clinical page').toMatch(/orgasm/i);
    expect(html).toMatch(/orgasmic-dysfunction/i);
  });

  test('foot-fetish still publishes the attraction sense and stays indexable', async ({ request }) => {
    const res = await request.get('/tags/foot-fetish', { headers: { 'User-Agent': BOT_UA } });
    expect(res.status()).toBe(200);
    const html = await res.text();

    // POSITIVE CONTROL first — it is the row that legitimately owns Q463859.
    expect(prerendered(html)).not.toBe('');
    expect(articleText(html)).toMatch(/foot/i);

    // It changed shelf, not content: it must not have been deindexed by the
    // re-file, which is the collateral damage a category write can cause.
    expect(robotsOf(html), 'foot-fetish must stay indexable').not.toMatch(/noindex/);
  });

  // foot-worship's prose was rewritten, so its review flag was cleared by
  // design. The correct anon answer is a sign-in gate — NOT the new prose, and
  // NOT a 404 (a real term must not read as a typo).
  for (const slug of ['foot-worship', 'footjob']) {
    test(`${slug} answers a sign-in gate rather than a 404`, async ({ request }) => {
      const res = await request.get(`/tags/${slug}`, { headers: { 'User-Agent': BOT_UA } });
      const html = await res.text();

      expect(res.status(), 'a real term must not answer 404').toBe(200);
      // POSITIVE CONTROL: the gate itself rendered, so the negatives below are
      // not passing on a blank page.
      expect(html, 'the sign-in gate must render').toMatch(/sign in/i);
      // Withheld prose must genuinely be withheld from the crawler.
      expect(prerendered(html), 'unreviewed prose must not be prerendered').toBe('');
      expect(robotsOf(html), 'a gated term must not be indexable').toMatch(/noindex/);
    });
  }
});
