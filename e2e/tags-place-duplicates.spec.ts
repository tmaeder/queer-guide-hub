import { test, expect, type APIRequestContext } from '@playwright/test';
import { anonHeaders, SUPABASE_REST_URL } from './support/anonKey';

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

/**
 * Read through the ANON PostgREST role, because that is the role a visitor's browser uses.
 * A privileged read can see rows and columns a reader never will.
 */
async function anonGet(
  request: APIRequestContext,
  path: string,
): Promise<Array<Record<string, unknown>>> {
  const res = await request.get(`${SUPABASE_REST_URL}/rest/v1/${path}`, {
    headers: await anonHeaders(request),
  });
  expect(res.ok(), `anon read failed for ${path}: ${res.status()}`).toBeTruthy();
  return (await res.json()) as Array<Record<string, unknown>>;
}

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
];

// The controls are the whole value of this file. "Place tags are deindexed" also passes on a
// corpus where the sweep deindexed everything, or where the classifier over-matched and took
// the region and travel vocabulary with it. Each of these encodes a DECISION the
// classification made.
//
// THESE CONTROLS NO LONGER ASSERT INDEXABILITY, AND THE REASON IS THE POINT.
//
// They used to: each was measured indexable on 2026-09-04 and asserted `noindex` absent.
// That went red, and the DATA was right — a later, deliberate editorial programme on
// 2026-09-20 made `publication_role` the thing that governs tag indexability, and parked
// all three as `utility`. The decision is recorded per row in
// `unified_tags.publication_role_review_note`:
//
//   california     utility  "place-like facet; no reviewed canonical entity target"
//   pennsylvania   utility  "place-like facet; no reviewed canonical entity target"
//   travel         utility  "place-like facet; no reviewed canonical entity target"
//   chicago        entity_redirect  "reviewed canonical entity conversion"
//
// and 20260920182442_separate_tags_from_entities.sql states the intent in one line: "Keep
// filter vocabulary usable without publishing people, places, venues, organisations or
// events as glossary articles." Corpus-wide that is 6,648 active `utility` tags deindexed
// against 1,196 `article` ones indexed — which is exactly the number of `<loc>` entries in
// sitemap-tags.xml, so the two agree.
//
// So indexability was only ever a PROXY for the thing this file controls for: that the
// place-duplicate classifier did not sweep the region and travel vocabulary in with the
// real geo duplicates. That proxy is now owned by a different programme and moves for
// reasons this file has no opinion about. The controls assert the thing itself instead —
// these tags are NOT classified as geo duplicates and do NOT redirect to a geo page —
// which is durable, and which still fails loudly if the classifier over-matches.
//
// Deliberately NOT reversed here: whether a 226-use region tag or `bdsm` (also `utility`,
// "correctness-first: authoritative source missing") ought to be published is an editorial
// and SEO decision with a reviewed note behind it, not a test repair.
const MUST_NOT_BE_GEO_DUPLICATES: Array<{ slug: string; why: string }> = [
  {
    slug: 'california',
    why:
      'bucket E — a US state. The only thing it name-matches is a tmp- slug shell city, ' +
      'so there is no geo entity for it to duplicate, and the programme said so: ' +
      '"no reviewed canonical entity target". It must never acquire a geo redirect.',
  },
  {
    slug: 'pennsylvania',
    why: 'bucket E — same shape as california.',
  },
  {
    slug: 'travel',
    why:
      'bucket F — a real travel concept with no geo match at all. If this ever redirects ' +
      'to a geo page the classifier has started matching concepts, not places.',
  },
];

/**
 * Tags that ARE published as glossary articles. The arming control for the sitemap: a
 * truncated or empty sitemap satisfies every "not present" assertion, and so does one that
 * lost the whole `article` cohort. Each measured 200, in-sitemap and index-able.
 */
const PUBLISHED_ARTICLE_TAGS = ['bipoc', 'bisexual', 'dildo'];

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

  for (const c of MUST_NOT_BE_GEO_DUPLICATES) {
    test(`/tags/${c.slug} is not treated as a geo duplicate`, async ({ request }) => {
      // The URL contract is what a geo duplicate gets: a permanent redirect onto the
      // canonical geo page. These must keep serving their own page instead.
      const res = await request.get(`/tags/${c.slug}`, {
        headers: { 'User-Agent': BOT_UA },
        maxRedirects: 0,
      });
      expect(res.status(), `/tags/${c.slug} should serve its own page, not redirect: ${c.why}`)
        .toBe(200);
      expect(
        res.headers().location,
        `/tags/${c.slug} redirects to ${res.headers().location} — the classifier has ` +
          `matched it to a geo entity: ${c.why}`,
      ).toBeUndefined();

      // And the disposition behind it, read through the ANON role because that is what a
      // visitor's browser uses. `entity_redirect` is the role the duplicates carry; these
      // may be `utility` or `article` — that is the other programme's call — but never a
      // geo redirect.
      const rows = await anonGet(request, `unified_tags?select=slug,publication_role&slug=eq.${c.slug}`);
      expect(rows, `no anon-readable tag row for ${c.slug}`).toHaveLength(1);
      expect(
        rows[0].publication_role,
        `/tags/${c.slug} is classified entity_redirect, i.e. as a duplicate of a geo page: ${c.why}`,
      ).not.toBe('entity_redirect');
    });
  }

  test('the duplicates really do carry the entity_redirect disposition', async ({ request }) => {
    // POSITIVE CONTROL for the assertion above. "not entity_redirect" is trivially true of
    // a corpus where nothing is, or where the column was dropped and reads null for every
    // row — in which case the three tests above prove nothing at all.
    const rows = await anonGet(
      request,
      `unified_tags?select=slug,publication_role&slug=in.(${DUPLICATES.map((d) => d.slug).join(',')})`,
    );
    expect(rows.length, 'no anon-readable rows for the known geo duplicates').toBeGreaterThan(0);
    const redirects = rows.filter((r) => r.publication_role === 'entity_redirect');
    expect(
      redirects.length,
      'not one known geo duplicate carries entity_redirect — the disposition is gone, so ' +
        'the "must not be a geo duplicate" controls are vacuous',
    ).toBeGreaterThan(0);
  });

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

    // The `utility` cohort is legitimately absent — the 2026-09-20 programme deindexed it
    // by design, and sitemap-tags.xml carries exactly the 1,196 `article` rows. So the
    // arming control is that the PUBLISHED vocabulary is still there: size alone would be
    // satisfied by a sitemap that kept 1,196 entries and lost this cohort.
    for (const slug of PUBLISHED_ARTICLE_TAGS) {
      expect(
        slugs.has(slug),
        `sitemap dropped /tags/${slug}, a published article tag — the article cohort is ` +
          `missing, so every "not present" assertion above is meaningless`,
      ).toBe(true);
    }
  });
});
