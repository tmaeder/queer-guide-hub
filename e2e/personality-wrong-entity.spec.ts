import { test, expect } from '@playwright/test';

// A personality page must not publish a different named person's biography.
//
// `personality-link-adult-profiles` queued 1,513 proposals to attach a porn-site
// profile to a personality. 401 of the target rows carried a real `Q…`
// wikidata_qid, and 125 of those resolve to something that is not that person —
// 50 to a non-human (Austin the city, Colt's Manufacturing, an Offspring album),
// 72 to a DIFFERENT real named person. `personality-refresh` then rebuilt
// description, birth_date, death_date and external_ids from that identifier, so
// the wrong person's life ended up on an adult-performer record.
//
// Three of them were PUBLIC and INDEXABLE, and this is what prod served to
// Googlebot on 2026-09-19, before 99991789824947:
//
//   /personalities/lee-smith
//     <title>            Lee Smith — Adult performer | Queer Guide
//     <meta description> New Zealand Māori language and gay rights advocate
//     body               1950-12-05 – 2019-10-15 … is a notable figure in the
//                        LGBTQ+ community as a gay adult performer
//
// That is a named Māori language and gay rights advocate's own description and
// death date, republished under "Adult performer". The meta description is the
// line Google shows in its result. Same shape for a trade unionist and a
// Filipino theatre director.
//
// Asserted over the CRAWLER HTML (`functions/_lib/detail.ts`) rather than the
// SPA: it is what a non-JS crawler indexes, which is the surface where this does
// lasting damage, and one plain GET costs ~0.4s against ~11s for an SPA boot.
//
// Every case pairs a NEGATIVE with a POSITIVE fingerprint. "Does not mention the
// union leader" also passes on a 404, on an empty body, and on a page that
// failed to render — the positive half is what makes the negative half mean
// anything. A second, corpus-level positive control asserts that an unrelated
// personality page still carries a description at all, so a sweep that blanked
// every description in the table would fail here rather than read as a clean
// repair.

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const BASE = process.env.E2E_BASE_URL ?? 'https://queer.guide';

interface Case {
  slug: string;
  /** Proves the page rendered the RIGHT subject. */
  present: RegExp;
  /** Fragments of the wrong person that must be gone. */
  absent: RegExp[];
  /** Who the row had been conflated with, for the failure message. */
  was: string;
}

const CASES: Case[] = [
  {
    slug: 'lee-smith',
    was: 'Q112628161 — a New Zealand Māori language and gay rights advocate',
    present: /Lee Smith/i,
    absent: [/M[āa]ori language/i, /gay rights advocate/i, /2019-10-15/],
  },
  {
    slug: 'mike-stone',
    was: 'Q120416052 — Milan "Mike" Stone, an American labor union leader',
    present: /Mike Stone/i,
    absent: [/labor union leader/i, /Milan/i, /1927-06-11/],
  },
  {
    slug: 'bobby-garcia',
    was: 'Q135321627 — a Filipino theatre director (1969–2024)',
    present: /Bobby Garcia/i,
    absent: [/Filipino theatre/i, /2024-12-17/],
  },
];

async function crawl(request: import('@playwright/test').APIRequestContext, path: string) {
  const res = await request.get(`${BASE}${path}`, {
    headers: { 'User-Agent': BOT_UA },
  });
  return { status: res.status(), html: await res.text() };
}

test.describe('personality pages do not publish another person as an adult performer', () => {
  for (const c of CASES) {
    test(`/personalities/${c.slug} is not ${c.was}`, async ({ request }) => {
      const { status, html } = await crawl(request, `/personalities/${c.slug}`);

      // POSITIVE half first: without it every assertion below passes on a 404.
      expect(status, `/personalities/${c.slug} must still render`).toBe(200);
      expect(html, 'page must still be the right subject').toMatch(c.present);

      for (const re of c.absent) {
        expect(
          html,
          `/personalities/${c.slug} still publishes ${c.was} (matched ${re})`,
        ).not.toMatch(re);
      }
    });
  }

  test('the meta description specifically is clean', async ({ request }) => {
    // The body and the <head> are built separately in functions/_lib/detail.ts,
    // so a repair that fixed the rendered prose and left the meta tag standing
    // would still be the line Google shows. Checked on its own for that reason.
    for (const c of CASES) {
      const { html } = await crawl(request, `/personalities/${c.slug}`);
      const meta = html.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? '';
      for (const re of c.absent) {
        expect(meta, `meta description of ${c.slug} still carries ${c.was}`).not.toMatch(re);
      }
    }
  });

  test('CONTROL: an unaffected personality still has a description', async ({ request }) => {
    // Guards the mirror failure. Every assertion above is satisfied by a table
    // whose descriptions were all blanked; this one is not. Jack Wrangler's
    // identifier (Q947588) was verified correct and is deliberately untouched.
    const { status, html } = await crawl(request, '/personalities/jack-wrangler');
    expect(status).toBe(200);
    expect(html).toMatch(/Jack Wrangler/i);
    const meta = html.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? '';
    expect(meta.trim().length, 'control page must still carry a description').toBeGreaterThan(20);
  });
});
