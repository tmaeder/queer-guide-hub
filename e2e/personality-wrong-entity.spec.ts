import { test, expect } from '@playwright/test';

// A personality page must not publish a different named person's biography.
//
// `personality-link-adult-profiles` queued 1,513 proposals to attach a porn-site
// profile to a personality. 401 of the target rows carried a real `Q…`
// wikidata_qid; 125 of those resolve to something that is not that person — 50
// to a non-human (Austin the city, Colt's Manufacturing, an Offspring album), 72
// to a DIFFERENT real named person. `personality-refresh` then rebuilt
// description, birth_date, death_date and external_ids from that identifier, so
// the wrong person's life ended up on an adult-performer record.
//
// Three were PUBLIC and INDEXABLE. This is what prod served Googlebot on
// 2026-09-19, before 99991789833562:
//
//   /personalities/lee-smith
//     <title>            Lee Smith — Adult performer | Queer Guide
//     <meta description> New Zealand Māori language and gay rights advocate
//     body               1950-12-05 – 2019-10-15 … a gay adult performer
//
// A named Māori language and gay rights advocate's own description and death
// date, republished under "Adult performer" — and the meta description is the
// line Google shows in its result. Same shape for a trade unionist and a
// Filipino theatre director.
//
// WHY A 404 IS A PASS HERE, which is the part to read before "fixing" this file.
// Clearing the identifier makes `trg_personalities_outing_guard` withdraw the
// row: `wikidata_qid` stops matching `^Q[0-9]+$`, the row loses its publication
// warrant and is demoted to draft, and a draft personality is not served to
// crawlers whatever `seo_indexable` says. Measured after the repair: all three
// answer 404, where minutes earlier they had served the wrong person's
// biography. So the honest assertion is that the wrong TEXT is never served —
// under any status — not that the page still renders.
//
// That would be vacuous on its own: "no wrong text" also passes on a 404, on an
// empty body, and on a site that is down. The positive half therefore moves to a
// SERVED CONTROL on a different URL — Jack Wrangler, whose identifier (Q947588)
// was verified correct and is deliberately untouched. It must return 200, carry
// his name, and still have a real meta description. That one case proves the
// crawler path works and that the repair did not simply blank every description
// in the table, which is the mirror failure and the more destructive one.
//
// HONEST LIMIT OF THIS FILE TODAY. Mutation-tested after the repair landed:
// breaking the CONTROL is caught, but deleting the status classification or the
// wrong-text patterns SURVIVES — because the three pages now 404 and there is no
// body for those assertions to bite on. They are regression guards, not live
// checks, and they are proven capable rather than assumed: run against the
// pre-repair corpus on 2026-09-19 this same file failed 4 of 5, each on the
// exact fragment it names. So a green run here means "nothing wrong is being
// served"; it is the CONTROL that distinguishes that from "nothing is served at
// all". If one of these rows is ever republished, the absence assertions start
// doing real work again.

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const BASE = process.env.E2E_BASE_URL ?? 'https://queer.guide';

interface Case {
  slug: string;
  /** Fragments of the wrong person that must never be served. */
  absent: RegExp[];
  /** Who the row had been conflated with, for the failure message. */
  was: string;
}

const REPAIRED: Case[] = [
  {
    slug: 'lee-smith',
    was: 'Q112628161 — a New Zealand Māori language and gay rights advocate',
    absent: [/M[āa]ori language/i, /gay rights advocate/i, /2019-10-15/],
  },
  {
    slug: 'mike-stone',
    was: 'Q120416052 — Milan "Mike" Stone, an American labor union leader',
    absent: [/labor union leader/i, /Milan/i, /1927-06-11/],
  },
  {
    slug: 'bobby-garcia',
    was: 'Q135321627 — a Filipino theatre director (1969–2024)',
    absent: [/Filipino theatre/i, /2024-12-17/],
  },
];

async function crawl(request: import('@playwright/test').APIRequestContext, slug: string) {
  // Cache-busted: an edge-cached copy of the pre-repair page would make this
  // pass or fail for reasons that have nothing to do with the data.
  const res = await request.get(`${BASE}/personalities/${slug}?cb=${Date.now()}`, {
    headers: { 'User-Agent': BOT_UA },
  });
  const html = await res.text();
  const meta = html.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? '';
  return { status: res.status(), html, meta };
}

test.describe('personality pages do not publish another person as an adult performer', () => {
  // The positive half, first and on its own URL. Every assertion below is
  // satisfied by a dead site; this one is not.
  test('CONTROL: an untouched personality is still served with its description', async ({
    request,
  }) => {
    const { status, html, meta } = await crawl(request, 'jack-wrangler');
    expect(status, 'the crawler path must be alive').toBe(200);
    expect(html, 'control page must render its subject').toMatch(/Jack Wrangler/i);
    expect(
      meta.trim().length,
      'control still needs a description — a repair that blanked the whole table must fail here',
    ).toBeGreaterThan(20);
  });

  for (const c of REPAIRED) {
    test(`/personalities/${c.slug} never serves ${c.was}`, async ({ request }) => {
      const { status, html, meta } = await crawl(request, c.slug);

      // 200 (repaired and still published) and 404 (withdrawn by the outing
      // guard) are both correct outcomes. A 5xx is not, and would otherwise slip
      // through as "the wrong text wasn't there".
      expect([200, 404], `unexpected status ${status} for ${c.slug}`).toContain(status);

      for (const re of c.absent) {
        expect(html, `${c.slug} still serves ${c.was} (matched ${re})`).not.toMatch(re);
        expect(meta, `meta description of ${c.slug} still carries ${c.was}`).not.toMatch(re);
      }

      // If it is still published it must at least be the right subject.
      if (status === 200) {
        expect(html).toMatch(new RegExp(c.slug.split('-')[0], 'i'));
      }
    });
  }

  test('the four extract-sourced biographies are not served either', async ({ request }) => {
    // These four kept a description through the first repair because it came
    // from the Wikipedia extract rather than the Wikidata description, so the
    // content guard had no evidence against it. Cleared by
    // 99991789840157. All four are draft, so the expected status is 404.
    const cases: Array<[string, RegExp]> = [
      ['jason-collins', /professional basketball player|Stanford Cardinal/i],
      ['scott-miller', /ambassador to Switzerland/i],
      ['mike-stone', /labor union leader/i],
      ['cameron-davis', /Outstanding Teen/i],
    ];
    for (const [slug, re] of cases) {
      const { status, html, meta } = await crawl(request, slug);
      expect([200, 404], `unexpected status ${status} for ${slug}`).toContain(status);
      expect(html, `${slug} still serves the wrong person's biography`).not.toMatch(re);
      expect(meta, `${slug} meta still carries the wrong person's biography`).not.toMatch(re);
    }
  });
});
