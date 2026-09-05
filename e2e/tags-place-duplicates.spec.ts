import { test, expect } from '@playwright/test';

// A glossary tag that names a city or country must not compete with that place's own page.
//
// `/tags/brighton` and `/city/brighton` were both indexable and both about Brighton — except
// the tag page published verbatim encyclopaedic geography ("Brighton is a seaside resort in
// the unitary authority area and city of Brighton and Hove…") with no queer content at all,
// duplicating Wikipedia and the city page simultaneously. Measured 2026-09-04: 322 Destination
// tags, 157 of which name a live city or country.
//
// THE MECHANISM THIS FILE PROTECTS, because it is not obvious and it self-reverses.
// `enforce_tag_thin_page_gate()` deindexes any tag with no description and stamps
// `seo_deindex_reason='thin'`; `run_tag_thin_page_reindex()` re-indexes a row when prose
// arrives, but ONLY if the reason is 'thin'. Measured: 224 of the 322 were deindexed, ALL of
// them for 'thin', and zero for any other reason — so the entire cohort was held out of the
// index purely by being empty, while `tag-enrichment-sweep` runs nightly selecting exactly
// `description is null`. The first sweep to reach them would have written Wikipedia geography
// and re-indexed all 224. Migration 20261221100000 restamps the reason to 'place-duplicate',
// which is not auto-reversible, so a future description can no longer re-index them.
//
// This spec therefore asserts the DISPOSITION, not the emptiness. A test that only checked
// "these pages are noindex" would have passed for the whole period the bug was live, because
// they were already noindex for the fragile reason.
//
// Asserted over the CRAWLER HTML (`functions/_lib/detail.ts`) — one plain GET per case, and it
// is the surface where duplicate content actually costs something. A deindexed tag renders the
// shell with `robots noindex` and NO <article>, so the two are independently observable.
//
// NIGHTLY ONLY. Not in e2e-pr.yml's explicit spec list, deliberately: it reads PROD, and the
// migration that makes it green is applied by CI on merge. On `pull_request` it would be the
// documented deadlock where a prod-reading gate blocks the very PR that fixes prod.

const BOT_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

function hasRobotsNoindex(html: string): boolean {
  return /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html);
}

/** Tag pages that duplicate a geo page. Each names the geo route that owns the subject. */
const DUPLICATES: Array<{ slug: string; geo: string; bucket: string }> = [
  { slug: 'brighton', geo: '/city/brighton', bucket: 'C one real city' },
  { slug: 'chicago', geo: '/city/chicago', bucket: 'C one real city' },
  { slug: 'philadelphia', geo: '/city/philadelphia', bucket: 'C one real city' },
  { slug: 'germany', geo: '/country/germany', bucket: 'A country' },
  { slug: 'japan', geo: '/country/japan', bucket: 'A country' },
  { slug: 'australia', geo: '/country/australia', bucket: 'A country' },
];

// The controls are the whole value of this file. "Place tags are deindexed" also passes on a
// corpus where the sweep deindexed everything, or where the classifier over-matched and took
// the region and travel vocabulary with it. Each of these was measured indexable on
// 2026-09-04 and each encodes a DECISION the classification made.
const MUST_STAY_INDEXABLE: Array<{ slug: string; why: string }> = [
  {
    slug: 'california',
    why: 'bucket E — a US state. The only thing it name-matches is a tmp- slug shell city, '
      + 'so there is no geo entity for it to duplicate. Region tags are the one Destination '
      + 'class that groups content no geo page groups.',
  },
  {
    slug: 'pennsylvania',
    why: 'bucket E — same shape as california.',
  },
  {
    slug: 'san-francisco',
    why: 'bucket D — matches San Francisco US (665 venues) AND San Francisco AR (0). '
      + 'Ambiguous same-name matches are deliberately excluded pending review; deindexing '
      + 'them was NOT authorised by the audit.',
  },
  {
    slug: 'travel',
    why: 'bucket F — a real travel concept with no geo match at all. These are the tags the '
      + 'description backfill SHOULD fill; suppressing the whole category would have hit them.',
  },
];

test.describe('place-named glossary tags do not compete with the geo page', () => {
  for (const c of DUPLICATES) {
    test(`/tags/${c.slug} is deindexed and ${c.geo} owns the subject`, async ({ request }) => {
      const res = await request.get(`/tags/${c.slug}`, { headers: { 'User-Agent': BOT_UA } });
      expect(res.status(), `/tags/${c.slug} should resolve`).toBe(200);
      const html = await res.text();

      expect(
        hasRobotsNoindex(html),
        `/tags/${c.slug} (${c.bucket}) is indexable and duplicates ${c.geo}`,
      ).toBe(true);

      // A deindexed tag renders the shell without its prose block (same behaviour
      // tags-wrong-entity.spec.ts relies on when it skips on an empty <article>).
      // Independent of the meta tag, so a template change that drops the robots meta
      // cannot silently pass this.
      //
      // Only observable from a REAL HTTP client. Browsers treat User-Agent as a forbidden
      // header name and drop it from fetch() silently, so this branch cannot be checked
      // from a browser console — you get the SPA shell and <article> is absent either way.
      // Playwright's `request` fixture is a real client and does send it.
      expect(
        /<article[\s\S]*?<\/article>/i.test(html),
        `/tags/${c.slug} still renders its prose block despite being deindexed`,
      ).toBe(false);

      // POSITIVE CONTROL. Without it, every assertion above also passes when the geo page
      // does not exist — in which case deindexing the tag deleted the only page about the
      // subject rather than de-duplicating two.
      const geo = await request.get(c.geo, { headers: { 'User-Agent': BOT_UA } });
      expect(geo.status(), `${c.geo} must exist to justify deindexing /tags/${c.slug}`).toBe(200);
      const geoHtml = await geo.text();
      expect(
        hasRobotsNoindex(geoHtml),
        `${c.geo} is itself noindex — the subject now has no indexable page at all`,
      ).toBe(false);
    });
  }

  for (const c of MUST_STAY_INDEXABLE) {
    test(`/tags/${c.slug} stays indexable`, async ({ request }) => {
      const res = await request.get(`/tags/${c.slug}`, { headers: { 'User-Agent': BOT_UA } });
      expect(res.status(), `/tags/${c.slug} should resolve`).toBe(200);
      expect(
        hasRobotsNoindex(await res.text()),
        `/tags/${c.slug} was deindexed but should not have been: ${c.why}`,
      ).toBe(false);
    });
  }

  test('the tag sitemap excludes the place duplicates and still lists real terms', async ({
    request,
  }) => {
    const res = await request.get('/sitemap-tags.xml');
    expect(res.status()).toBe(200);
    const xml = await res.text();
    const slugs = new Set(
      [...xml.matchAll(/<loc>[^<]*\/tags\/([^<?#]+)<\/loc>/g)].map((m) => m[1]),
    );

    // Arming check. An empty or truncated sitemap would satisfy every "not present"
    // assertion below; this is what makes their absence mean something.
    expect(slugs.size, 'tag sitemap looks empty or unparsed').toBeGreaterThan(1000);

    for (const c of DUPLICATES) {
      expect(slugs.has(c.slug), `sitemap still advertises /tags/${c.slug}`).toBe(false);
    }
    for (const c of MUST_STAY_INDEXABLE) {
      expect(slugs.has(c.slug), `sitemap dropped /tags/${c.slug}: ${c.why}`).toBe(true);
    }
  });
});
