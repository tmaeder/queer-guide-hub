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
  // San Francisco sits after Cloudflare Pages' 100-rule `_redirects` boundary
  // and pins the middleware fallback. Brighton pins a same-name resolution.
  { slug: 'san-francisco', geo: '/city/san-francisco', bucket: 'late city rule' },
  { slug: 'brighton', geo: '/city/brighton', bucket: 'same-name city resolution' },
  { slug: 'travel', geo: '/travel', bucket: 'first-class product surface' },
];

// These rows have no canonical first-class state/region target. They therefore remain usable
// as facets but are deliberately non-publishing utility vocabulary. The reviewed article
// control below prevents a globally empty/truncated sitemap from satisfying every absence.
const PLACE_LIKE_UTILITIES: Array<{ slug: string; why: string }> = [
  {
    slug: 'california',
    why: 'a US-state facet with no reviewed canonical entity target',
  },
  {
    slug: 'pennsylvania',
    why: 'a US-state facet with no reviewed canonical entity target',
  },
];

const PUBLISHED_CONTROL = 'bisexual';

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

  for (const c of PLACE_LIKE_UTILITIES) {
    test(`/tags/${c.slug} remains a non-publishing utility`, async ({ request }) => {
      const res = await request.get(`/tags/${c.slug}`, { headers: { 'User-Agent': BOT_UA } });
      expect(res.status(), `/tags/${c.slug} should resolve`).toBe(200);
      expect(
        hasRobotsNoindex(await res.text()),
        `/tags/${c.slug} became a thin article despite its utility disposition: ${c.why}`,
      ).toBe(true);
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
    for (const c of PLACE_LIKE_UTILITIES) {
      expect(slugs.has(c.slug), `sitemap advertises utility /tags/${c.slug}: ${c.why}`).toBe(false);
    }
    expect(slugs.has(PUBLISHED_CONTROL), 'sitemap dropped the reviewed article control').toBe(true);
  });
});
