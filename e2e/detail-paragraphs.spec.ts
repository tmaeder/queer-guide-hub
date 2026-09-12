/**
 * The crawler body of a detail page must keep its paragraphs.
 *
 * `paragraphsHtml` in `functions/_lib/detail.ts` renders the prose of every
 * crawler-facing detail page, and until #3625 it could not emit more than one
 * `<p>`: it called `collapseWs` (a bare `\s+ -> ' '`) BEFORE splitting, so every
 * newline was already a space and neither arm of the split could ever match.
 * Googlebot was served one undifferentiated block on venues, events, news,
 * personalities, cities, countries, hotels, villages, tags, milestones and
 * guides alike.
 *
 * `functions/_lib/detailParagraphs.test.ts` guards the pure function. It cannot
 * see a deploy that never shipped, an edge bundle serving a stale build, or a
 * future middleware change that re-flattens the body downstream — this file is
 * the only thing that watches the bytes a crawler actually receives.
 *
 * It deliberately depends on NOTHING but the base URL. The obvious design is to
 * read each row from Supabase and compute the expected paragraphs, but
 * `VITE_SUPABASE_ANON_KEY` is not passed to `e2e-nightly.yml`, so a spec that
 * needs it `test.skip`s in CI and guards nothing — the same shape as the a11y
 * route sweep that gated zero. Fingerprints are hardcoded instead.
 *
 * Each case names two strings that live in DIFFERENT paragraphs, and asserts
 * exactly that. Under the bug they land in one `<p>`, so every case fails. Both
 * halves are required to be PRESENT first, so a content rewrite fails loudly
 * with "update the fingerprint" instead of passing vacuously — an assertion
 * that only checks for absence is satisfied by an empty page.
 */
import { test, expect } from '@playwright/test';

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/** The `<p>` bodies of the crawler `<article>`, in document order. */
async function articleParagraphs(
  request: { get: (url: string, opts: object) => Promise<{ status(): number; text(): Promise<string> }> },
  path: string,
): Promise<string[]> {
  const res = await request.get(path, { headers: { 'User-Agent': BOT_UA } });
  expect(res.status(), `${path} should be served to a crawler`).toBe(200);
  const html = await res.text();
  const article = html.match(/<article[\s\S]*?<\/article>/)?.[0];
  expect(article, `${path} has no <article> — it is no longer crawler-rendered`).toBeTruthy();
  return [...(article as string).matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim(),
  );
}

const indexContaining = (paras: string[], needle: string) =>
  paras.findIndex((p) => p.includes(needle));

/**
 * One case per split arm, each on a different entity type, so a regression in
 * any single arm fails on its own rather than hiding behind the others.
 */
const SPLIT_CASES = [
  {
    path: '/villages/chueca',
    why: 'single newline after a full stop — 106 of 175 village histories separate paragraphs this way and NOT ONE contains a blank line',
    first: 'named after Spanish composer and author Federico Chueca.',
    second: 'It is located in the administrative ward',
  },
  {
    path: '/venue/omaha-public-library-benson-branch',
    why: 'CRLF row — `[ \\t]*` does not match `\\r`, so before the fix every lookbehind arm saw `\\r` and never fired on the 61 of 189 CRLF venue rows',
    first: 'Hours: Monday-Thursday 9am-8pm',
    second: 'Friday-Saturday 9am-5pm',
  },
  {
    path: '/tags/prep',
    why: 'blank line — the plain case, and the one with the most rows behind it',
    first: 'Pre-exposure prophylaxis is HIV medication',
    second: 'PrEP prevents HIV and no other sexually transmitted infection',
  },
  {
    path: '/city/key-west',
    why: 'single newline after a full stop on a city, the 858-row cohort',
    first: 'Key West (Spanish: Cayo Hueso',
    second: 'For thousands of years, Key West',
  },
  {
    path: '/venue/tramp-s',
    why: 'venue prose, where the second line is a bare fragment with no sentence of its own',
    first: 'LGBT-friendly pub in Berlin-Schöneberg, open day and night.',
    second: 'Smoking-Bar.',
  },
];

test.describe('@smoke crawler detail pages keep their paragraphs', () => {
  for (const c of SPLIT_CASES) {
    test(`${c.path} splits its prose`, async ({ request }) => {
      const paras = await articleParagraphs(request, c.path);

      const a = indexContaining(paras, c.first);
      const b = indexContaining(paras, c.second);
      expect(
        a,
        `"${c.first}" is gone from ${c.path} — the content changed, update the fingerprint`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        b,
        `"${c.second}" is gone from ${c.path} — the content changed, update the fingerprint`,
      ).toBeGreaterThanOrEqual(0);

      expect(
        a,
        `${c.path} served both halves in ONE <p> — paragraphsHtml is flattening again (${c.why})`,
      ).not.toBe(b);
    });
  }

  /**
   * The opposite failure. `paragraphsHtml` deliberately does NOT split on a bare
   * `\n` (22 broken sentences in a 1,182-row sample) nor at a typewriter double
   * space after a full stop (110 venues, 117 cities, 35 events of running text).
   * Without this, a "split more aggressively" regression passes every case above.
   */
  test('/city/hatboro keeps two sentences of one paragraph together', async ({ request }) => {
    const paras = await articleParagraphs(request, '/city/hatboro');
    const a = indexContaining(paras, 'The superintendent is Dr. Scott Eveslage.');
    const b = indexContaining(paras, 'The assistant superintendent is Dr. Ted Domers.');
    expect(a, 'fingerprint missing from /city/hatboro — update it').toBeGreaterThanOrEqual(0);
    expect(b, 'fingerprint missing from /city/hatboro — update it').toBeGreaterThanOrEqual(0);
    expect(a, 'two sentences of one paragraph were split into separate <p>').toBe(b);
  });

  /**
   * A table-driven file with an empty table creates zero tests and reports
   * success. Assert the coverage itself.
   */
  test('the fingerprint table still covers every split arm', () => {
    expect(SPLIT_CASES.length).toBeGreaterThanOrEqual(5);
    expect(new Set(SPLIT_CASES.map((c) => c.path.split('/')[1])).size).toBeGreaterThanOrEqual(4);
  });
});
