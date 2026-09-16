import { test, expect } from '@playwright/test';

// A glossary tag that names a city, country or district must not compete with that place's
// own page.
//
// `/tags/chicago` and `/city/chicago` were both indexable and both about Chicago — except the
// tag page published verbatim encyclopaedic geography ("Chicago is the most populous city in
// the U.S. state of Illinois…") with no queer content at all, duplicating Wikipedia and the
// city page simultaneously. Measured 2026-09-04: 322 Destination tags, 157 of which name a
// live city or country.
//
// THE MECHANISM THIS FILE PROTECTS, because it is not obvious and it self-reverses.
// `enforce_tag_thin_page_gate()` deindexes any tag with no description and stamps
// `seo_deindex_reason='thin'`; `run_tag_thin_page_reindex()` re-indexes a row when prose
// arrives, but ONLY if the reason is 'thin'. Measured: 224 of the 322 were deindexed, ALL of
// them for 'thin', and zero for any other reason — so the entire cohort was held out of the
// index purely by being empty, while `tag-enrichment-sweep` runs nightly selecting exactly
// `description is null`. The first sweep to reach them would have written Wikipedia geography
// and re-indexed all 224. Migration 20270501180000 restamps the reason to 'place-duplicate',
// which is not auto-reversible, so a future description can no longer re-index them.
//
// This spec therefore asserts the DISPOSITION, not the emptiness. A test that only checked
// "these pages are noindex" would have passed for the whole period the bug was live, because
// they were already noindex for the fragile reason.
//
// Deindexing is the data-level safety net. The public URL contract is stronger: these duplicate
// tag routes permanently redirect to the canonical geo entity, so readers, crawlers and link
// equity all arrive at the one page that owns the subject.
//
// NIGHTLY ONLY. Not in e2e-pr.yml's explicit spec list, deliberately: it reads PROD, and the
// migration that makes it green is applied by CI on merge. On `pull_request` it would be the
// documented deadlock where a prod-reading gate blocks the very PR that fixes prod.

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

function hasRobotsNoindex(html: string): boolean {
  return /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html);
}

/** Tag routes that duplicate a geo page. Each names the canonical route that owns the subject. */
const DUPLICATES: Array<{ slug: string; geo: string; bucket: string }> = [
  { slug: 'chicago', geo: '/city/chicago', bucket: 'C one real city' },
  { slug: 'philadelphia', geo: '/city/philadelphia', bucket: 'C one real city' },
  { slug: 'germany', geo: '/country/germany', bucket: 'A country' },
  { slug: 'japan', geo: '/country/japan', bucket: 'A country' },
  { slug: 'australia', geo: '/country/australia', bucket: 'A country' },
  { slug: 'friedrichshain', geo: '/villages/friedrichshain', bucket: 'Berlin district' },
];

// The controls are the whole value of this file. "Place tags are deindexed" also passes on a
// corpus where the sweep deindexed everything, or where the classifier over-matched and took
// the region and travel vocabulary with it. Each of these was measured indexable on
// 2026-09-04 and each encodes a DECISION the classification made.
const MUST_STAY_INDEXABLE: Array<{ slug: string; why: string }> = [
  {
    slug: 'california',
    why:
      'bucket E — a US state. The only thing it name-matches is a tmp- slug shell city, ' +
      'so there is no geo entity for it to duplicate. Region tags are the one Destination ' +
      'class that groups content no geo page groups.',
  },
  {
    slug: 'pennsylvania',
    why: 'bucket E — same shape as california.',
  },
  {
    slug: 'san-francisco',
    why:
      'bucket D — matches San Francisco US (665 venues) AND San Francisco AR (0). ' +
      'Ambiguous same-name matches are deliberately excluded pending review; deindexing ' +
      'them was NOT authorised by the audit.',
  },
  {
    slug: 'brighton',
    why:
      'bucket D — matches Brighton GB (182 venues) AND Brighton CA (1). Listed as a ' +
      'bucket-C duplicate in the first draft of this spec and caught by prod: the ' +
      'migration correctly refused it, the spec was wrong. A second ambiguous control ' +
      'alongside san-francisco, because the two differ in shape — SF has a 665-vs-0 split ' +
      'that a content-mass rule resolves easily, Brighton is 182-vs-1 and still excluded, ' +
      'so this pins that the exclusion is on AMBIGUITY, not on the size of the gap.',
  },
  {
    slug: 'travel',
    why:
      'bucket F — a real travel concept with no geo match at all. These are the tags the ' +
      'description backfill SHOULD fill; suppressing the whole category would have hit them.',
  },
];

test.describe('place-named glossary tags redirect to the canonical geo page', () => {
  for (const c of DUPLICATES) {
    test(`/tags/${c.slug} permanently redirects to ${c.geo}`, async ({ request }) => {
      const res = await request.get(`/tags/${c.slug}`, {
        headers: { 'User-Agent': BOT_UA },
        maxRedirects: 0,
      });
      expect(res.status(), `/tags/${c.slug} (${c.bucket}) must be a permanent redirect`).toBe(301);
      expect(res.headers().location).toBe(c.geo);

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
