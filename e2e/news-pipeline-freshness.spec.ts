import { test, expect } from '@playwright/test';

/**
 * News pipeline freshness, asserted against the configured baseURL (PRODUCTION).
 *
 * WHY THIS IS NOT COVERED BY home-news-topics.spec.ts. That spec proves the
 * rails carry ARTICLES; this one proves they carry RECENT ones. A pipeline that
 * stalled six weeks ago renders a completely healthy /news — same rails, same
 * counts, same chrome — because the corpus it already published is still there.
 * Staleness is invisible to every reader-facing assertion, which is exactly why
 * the 2026-09 outage ran for months while every dashboard read green.
 *
 * WHAT A FAILURE HERE MEANS. The publish chain is
 *   source-rss-news → normalize → sanitize → enrich → validate → dedup
 *   → quality → review-gate → commit → news_articles → sitemap
 * and this spec is the only end-to-end check that any of it still moves. Four
 * separate faults in that chain shipped while reporting success:
 *   - validate/dedup selectors keyed on the nullable `entity_type` (#3585)
 *   - news dedup decisions rejected 23514 on every row, forever (#3588)
 *   - validate's selector had no `disposition` filter (#3597)
 *   - a failed LLM enrichment was never retried
 * Every one of them left the reader-facing pages looking fine.
 *
 * WHY THE SITEMAP AND NOT THE PAGE. /news is client-rendered, so its raw HTML
 * carries zero article links and date labels would have to be scraped out of
 * rendered DOM. sitemap-news.xml is generated server-side from news_articles
 * and carries a machine-readable <lastmod> per URL — the same data, without the
 * brittleness. It is also what Google reads, so a stale sitemap is a real SEO
 * defect in its own right, not merely a proxy for one.
 *
 * THE BOUNDS ARE MEASURED, WITH HEADROOM — NOT SET AT THE BASELINE. Prod on
 * 2026-09-19: 28,385 URLs; max lastmod = that day; per-day counts over the
 * trailing five days were 175 / 137 / 74 / 154 / 131. Gating at the observed
 * floor is the cry-wolf shape this repo has removed from gates before, so each
 * assertion below sits well under what a healthy day produces and still fails
 * hard on a stall.
 */

/** Sitemap entries are NOT ordered by date — the first <loc> on prod was a
 *  2026-06-23 article. Every check below works over the whole set. */
const LASTMOD = /<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/g;

const DAY_MS = 86_400_000;
/** A quiet day, a timezone edge and a late cron all fit inside 2 days. */
const MAX_AGE_DAYS = 2;
/** Trailing-7d floor. Observed ~671 over that window, so this is ~6.7x headroom. */
const MIN_ARTICLES_7D = 100;
/** Non-vacuity floor: an empty or truncated sitemap must not satisfy the rest. */
const MIN_TOTAL_URLS = 1_000;

function dayKeys(xml: string): string[] {
  return [...xml.matchAll(LASTMOD)].map((m) => m[1]);
}

test.describe('news pipeline freshness', () => {
  test('the news sitemap is large, current, and still being added to', async ({ request }) => {
    const res = await request.get('/sitemap-news.xml');
    expect(res.status(), 'sitemap-news.xml must be served').toBe(200);
    expect(res.headers()['content-type'] ?? '').toContain('xml');

    const xml = await res.text();
    const days = dayKeys(xml);

    // (1) Non-vacuity. Asserting "the newest entry is recent" passes trivially
    // on a sitemap with one URL in it, so the size floor comes first.
    const urlCount = (xml.match(/<loc>/g) ?? []).length;
    expect(urlCount, 'sitemap URL count — a truncated sitemap would make the freshness checks vacuous')
      .toBeGreaterThan(MIN_TOTAL_URLS);
    expect(days.length, 'every <loc> should carry a <lastmod>').toBeGreaterThan(MIN_TOTAL_URLS);

    // (2) Freshness. This is the assertion that fails when the chain stalls.
    const newest = days.reduce((a, b) => (a > b ? a : b));
    const ageDays = (Date.now() - Date.parse(`${newest}T00:00:00Z`)) / DAY_MS;
    expect(
      ageDays,
      `newest news lastmod is ${newest} (${ageDays.toFixed(1)}d old) — the publish chain has stopped committing`,
    ).toBeLessThanOrEqual(MAX_AGE_DAYS);

    // (3) Volume. Freshness alone passes if exactly one article trickles
    // through, which is what a partially-stalled chain looks like: the drains
    // run, a handful of rows escape, and the backlog grows behind them.
    const cutoff = new Date(Date.now() - 7 * DAY_MS).toISOString().slice(0, 10);
    const recent = days.filter((d) => d >= cutoff).length;
    expect(
      recent,
      `only ${recent} articles published in the trailing 7 days (floor ${MIN_ARTICLES_7D}) — the chain is moving, but barely`,
    ).toBeGreaterThanOrEqual(MIN_ARTICLES_7D);
  });

  test('a freshly published article is actually reachable and has a body', async ({ request }) => {
    // A sitemap entry proves a ROW exists. It does not prove the page renders —
    // #3625 served every crawler detail page as one giant paragraph, and the
    // podcast-audio defect published MP3 URLs as og:image, both while the
    // sitemap looked perfect.
    const xml = await (await request.get('/sitemap-news.xml')).text();
    const newest = dayKeys(xml).reduce((a, b) => (a > b ? a : b));

    const entry = xml
      .split('<url>')
      .find((chunk) => chunk.includes(`<lastmod>${newest}</lastmod>`));
    expect(entry, `no <url> block carried the newest lastmod ${newest}`).toBeTruthy();
    const loc = entry!.match(/<loc>([^<]+)<\/loc>/)?.[1];
    expect(loc, 'newest sitemap entry must expose a <loc>').toBeTruthy();

    // Crawler UA: the bot path is server-rendered by functions/_lib/detail.ts,
    // which is where title/og/body injection actually happens.
    const page = await request.get(loc!, { headers: { 'User-Agent': 'Googlebot/2.1' } });
    expect(page.status(), `newest article ${loc} must render`).toBe(200);

    const html = await page.text();
    expect(html, 'crawler HTML must carry a title').toMatch(/<title>[^<]{10,}<\/title>/);
    expect(html, 'crawler HTML must carry og:title').toContain('og:title');
    // og:image must not be audio/video — the 2026-09-08 defect published 2,405
    // indexable articles whose og:image was an MP3.
    const ogImage = html.match(/property="og:image"\s+content="([^"]+)"/)?.[1] ?? '';
    expect(ogImage, `og:image points at media, not an image: ${ogImage}`)
      .not.toMatch(/\.(mp3|m4a|wav|mp4)(\?|$)/i);
  });
});
