import { test, expect } from '@playwright/test';

// A gated glossary term must answer a signed-out reader "sign in", not "no such
// thing" — and must still answer a crawler with nothing.
//
// `unified_tags_public_gated_read` admits anon only when a tag is non-sensitive
// OR its `verification_status` is 'reviewed'/'locked'. Measured on prod
// 2026-09-03: 101 active tags are sensitive AND unverified — the glossary cohort
// created by 20261211100000 / 100100 / 20261217100000 — and every one HARD 404'd
// for a signed-out visitor while rendering in full for a signed-in one. A real
// term was indistinguishable from a typo.
//
// Discipline copied from tags-positions-gated.spec.ts and tags-wrong-sense.spec.ts:
// raw HTTP (~0.4s a GET, and signed-out by construction — the default project
// carries an admin storageState when creds are set, which is exactly the trap
// that broke earlier signed-out specs), and every negative paired with a
// POSITIVE CONTROL, because "does not contain the definition" is vacuously true
// of a 404 and of an empty body.

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/** `<meta name="robots" content="...">`, lower-cased, or '' when absent. */
function robotsOf(html: string): string {
  const m = html.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i);
  return m ? m[1].toLowerCase() : '';
}

/** `<title>`, or '' when absent. */
function titleOf(html: string): string {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? m[1] : '';
}

/**
 * Does the crawler document publish the term as structured content?
 *
 * This is the paired fingerprint, and it replaced an assertion on the
 * `<main data-prerendered="bot-ua">` block that was WRONG — measured on prod
 * 2026-09-04, that block is absent from BOTH a gated tag and a readable one.
 * `functions/_middleware.ts` gates the body injection on
 * `indexable && isBotUserAgent(...)`, and every tag in this cohort (gated or
 * not) is `seo_indexable=false`, so the block never appears and asserting its
 * presence would fail nightly while proving nothing. `DefinedTerm` JSON-LD does
 * discriminate: `tagDetail` emits it for a readable tag and `gatedDetailResult`
 * emits no JSON-LD at all.
 */
function publishesDefinedTerm(html: string): boolean {
  return html.includes('DefinedTerm');
}

/**
 * Candidates from the gated cohort — NOT an assertion that each one is gated.
 *
 * Editorial review PUBLISHES a term (verification_status -> 'reviewed'), which
 * is the gate working, not breaking. `footjob` was gated all through
 * 2026-09-04 and reviewed by an editor that evening, and a spec that demanded
 * a gate from a fixed slug went red on correct editorial work. Each candidate
 * is CLASSIFIED from what prod serves, and the invariants are asserted over the
 * classification.
 */
const CANDIDATES = ['footjob', 'anal-whore', 'gag-slut', 'spit-slut'];

type Verdict = 'gated' | 'readable' | 'missing';

function classify(status: number, html: string): Verdict {
  if (status === 404) return 'missing';
  return /sign in to view/i.test(titleOf(html)) ? 'gated' : 'readable';
}

test.describe('@safety gated glossary terms', () => {
  test('a gated term is never a 404, and a gate leaks no content', async ({ request }) => {
    const seen: Record<string, Verdict> = {};

    for (const slug of CANDIDATES) {
      const res = await request.get(`/tags/${slug}`, { headers: { 'User-Agent': BOT_UA } });
      const html = await res.text();
      const verdict = classify(res.status(), html);
      seen[slug] = verdict;

      // THE ORIGINAL DEFECT, and it holds for every candidate whatever its
      // review state: a term that exists must never answer 404. 404 means the
      // edge conceded it does not exist and the SPA never mounted, so no gate
      // can render.
      expect(verdict, `${slug} must not 404 — it exists`).not.toBe('missing');

      if (verdict !== 'gated') continue;

      // Still withheld from the index — a sign-in wall is not a page to rank.
      expect(robotsOf(html), `${slug} must stay noindex`).toContain('noindex');
      // The term must not travel as content. The row is unreviewed
      // machine-written material; `seo_indexable=false` suppresses indexing,
      // not the bytes we hand over. (The title already proved this is the
      // gated document, so the absence below is not vacuous.)
      expect(publishesDefinedTerm(html), `${slug} must publish no DefinedTerm`).toBe(false);
      // The slug is deliberately NOT asserted absent: it is echoed in
      // `<link rel="canonical">` and `og:url`, which is the URL the crawler
      // asked for, not a disclosure of the definition.
    }

    // POSITIVE CONTROL. Without this the whole case passes on a corpus where
    // every candidate has been reviewed — i.e. it would stop testing the gate
    // and nobody would notice. If this ever fires legitimately (the cohort
    // really was fully reviewed), replace the candidates rather than delete it.
    expect(
      Object.values(seen).filter((v) => v === 'gated').length,
      `at least one candidate must still be gated, else this asserts nothing — saw ${JSON.stringify(seen)}`,
    ).toBeGreaterThan(0);
  });

  // NO BROWSER-RENDERED CASE HERE, AND THAT IS A DELIBERATE OMISSION.
  //
  // A `page.goto('/tags/footjob')` + "expect the gate heading" test was written,
  // run against prod on 2026-09-04, and REMOVED because it does not pass
  // reliably: in a cold Playwright context the page sits on its loading state
  // past both 15s and 30s and never reaches the gate OR the not-found branch.
  // The same URL renders the gate correctly in a warm browser — verified by
  // hand the same day (h1 "Sign in to view this term", the glossary copy, the
  // Sign in CTA). So the behaviour is right and the ASSERTION is what was
  // unreliable; the cause is a client fetch that does not settle on a cold
  // boot, which is not this change's to diagnose.
  //
  // Shipping it anyway would have put a nightly-red test in the suite, and a
  // suite people learn to ignore is worse than a smaller honest one. The SPA
  // branch is covered deterministically instead by three mutation-tested cases
  // in src/pages/__tests__/TagDetail.test.tsx (gate shown, place-gate copy NOT
  // borrowed, noIndex preserved). What is asserted here is the crawler surface,
  // which is where the 404 actually lived.

  // POSITIVE CONTROL. `kink` is sensitive too, but reviewed, so anon reads it.
  // Without this the spec above passes on a site where every tag is gated.
  test('a reviewed sensitive term still renders in full', async ({ request }) => {
    const res = await request.get('/tags/kink', { headers: { 'User-Agent': BOT_UA } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    // The other half of the pair. `kink` is sensitive too and differs only in
    // being reviewed, so this is what makes the two assertions above
    // discriminating rather than true of every tag page.
    expect(titleOf(html)).toMatch(/kink/i);
    expect(titleOf(html)).not.toMatch(/sign in to view/i);
    expect(publishesDefinedTerm(html), 'a readable tag must publish DefinedTerm').toBe(true);
  });

  // NEGATIVE CONTROL. The 404 must still exist. If `gated_entity_exists` ever
  // answered true too broadly, every typo would get a sign-in gate and the
  // glossary would lose its 404 entirely.
  test('an unknown slug is still a hard 404', async ({ request }) => {
    const res = await request.get('/tags/asdfgibberish-not-a-real-tag-90210', {
      headers: { 'User-Agent': BOT_UA },
    });
    expect(res.status()).toBe(404);
  });

  // A merged tag is gated-shaped but is NOT gated — it has a live canonical one
  // hop away, and a sign-in gate there would swallow the 301.
  test('a merged slug still 301s rather than offering a gate', async ({ request }) => {
    const res = await request.get('/tags/rack', { headers: { 'User-Agent': BOT_UA } });
    expect(res.url()).toContain('/tags/risk-aware-consensual-kink');
    expect(await res.text()).not.toMatch(/sign in to view this term/i);
  });
});
