/**
 * Merged tags must 301, not soft-404.
 *
 * The bug these lock down: `/tags/<merged-slug>` answered HTTP 200 with
 * `<title>Rack | Queer Guide</title>` while the SPA rendered its "No such term"
 * empty state underneath — a crawler indexed a plausible-looking blank page and
 * a human following an old link hit a dead end one hop from the concept they
 * wanted. Measured on prod 2026-08-16: 144 merged tags, plus 5,802 deprecated
 * ones with the same shape.
 *
 * Two independent defects, and BOTH have to stay fixed or the symptom returns:
 *
 *  1. `tagDetail` looked a tag up by slug with no `status` filter, so a merged
 *     row was "found" and the middleware never reached its 301/404 ladder.
 *  2. Tags were absent from `SLUG_REDIRECT_KINDS`, under a comment asserting
 *     that `/tags/:slug` was not a detail route. It had been one since
 *     TagDetail.tsx was lifted out of the index page.
 *
 * Fixing only (1) turns 144 recoverable redirects into 144 hard 404s, which is
 * why the "merged slug redirects" case below is the load-bearing one.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveSlugRedirect } from './detail';

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' } as never;

type Row = Record<string, unknown>;

/**
 * Fake PostgREST over a tiny fixture, honouring the filters the resolver sends.
 * Deliberately enforces `status=eq.active` rather than ignoring it — the whole
 * point of the deprecated-target case is that the filter reaches the server.
 */
function mockDb(tables: Record<string, Row[]>) {
  const requested: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = new URL(url);
      const table = u.pathname.split('/').pop() as string;
      requested.push(`${table}?${u.searchParams.toString()}`);
      const eq = (k: string) => u.searchParams.get(k)?.replace(/^eq\./, '');
      let rows = tables[table] ?? [];

      // ORDER BY a column the table does not have is a 400, not an empty 200.
      // Modelling this is the whole point: `fetchRows` defaults to `id.asc`, and
      // eleven of the twelve `<type>_slug_redirects` tables have no `id` column,
      // so prod answered 400 -> [] -> hard 404 for every merged venue, event,
      // personality, hotel, village, country, news article, milestone, guide,
      // org and marketplace listing.
      //
      // The venue case below existed and PASSED throughout, because this mock
      // used to return 200 for any `order`. A guard that cannot fail on the real
      // defect is not a guard — it is why this shipped and stayed shipped.
      const orderCol = u.searchParams.get('order')?.split('.')[0];
      if (orderCol && rows.length > 0 && !rows.some((r) => orderCol in r)) {
        return new Response(
          JSON.stringify({
            code: '42703',
            message: `column ${table}.${orderCol} does not exist`,
          }),
          { status: 400 },
        );
      }

      for (const key of ['slug', 'old_slug', 'id', 'status']) {
        const want = eq(key);
        if (want !== undefined && want !== null) rows = rows.filter((r) => r[key] === want);
      }
      return new Response(JSON.stringify(rows), { status: 200 });
    }),
  );
  return requested;
}

// Mirrors the real prod rows named in the report.
const RACK = 'aaaaaaaa-0000-0000-0000-000000000001';
const RACK_CANON = 'aaaaaaaa-0000-0000-0000-000000000002';
const DEPRECATED = 'aaaaaaaa-0000-0000-0000-000000000003';

const unified_tags: Row[] = [
  { id: RACK, slug: 'rack', status: 'merged' },
  { id: RACK_CANON, slug: 'risk-aware-consensual-kink', status: 'active' },
  // The 57-row cohort: a redirect whose target was itself later retired.
  { id: DEPRECATED, slug: 'alex-jurgen', status: 'deprecated' },
];

const tag_slug_redirects: Row[] = [
  { old_slug: 'rack', new_slug: 'risk-aware-consensual-kink', tag_id: RACK_CANON },
  { old_slug: 'alex-j-rgen', new_slug: 'alex-jurgen', tag_id: DEPRECATED },
  // new_slug is stale here and tag_id is right. Resolving through new_slug
  // instead of the id would emit a 301 into a 404.
  //
  // `m-nchen` was the live prod example when this was written; 20270301100000
  // repaired that row (its tag_id pointed at `munchen`, since merged into
  // `munich`) and put the repoint in the merge trigger. The fixture stays — the
  // property it guards is the resolver's, not that row's, and a clean corpus is
  // exactly when a dropped `tag_id` lookup would go unnoticed.
  { old_slug: 'm-nchen', new_slug: 'munchen', tag_id: RACK_CANON },
];

afterEach(() => vi.unstubAllGlobals());

describe('merged tag slug redirects at the edge', () => {
  it('301s a merged slug to its canonical', async () => {
    mockDb({ unified_tags, tag_slug_redirects });
    await expect(resolveSlugRedirect(env, '/tags/rack')).resolves.toBe(
      '/tags/risk-aware-consensual-kink',
    );
  });

  it('resolves through tag_id, not the denormalized new_slug', async () => {
    mockDb({ unified_tags, tag_slug_redirects });
    // new_slug says "munchen"; the row it points at is now "risk-aware-…".
    // The id wins, so the 301 lands somewhere that actually exists.
    await expect(resolveSlugRedirect(env, '/tags/m-nchen')).resolves.toBe(
      '/tags/risk-aware-consensual-kink',
    );
  });

  it('does NOT redirect into a deprecated tag — that would be a 301 to a 404', async () => {
    const requested = mockDb({ unified_tags, tag_slug_redirects });
    await expect(resolveSlugRedirect(env, '/tags/alex-j-rgen')).resolves.toBeNull();
    // Assert the constraint travelled to the server rather than the fixture
    // happening to be empty — the failure mode this guards is a dropped filter.
    expect(requested.some((r) => r.startsWith('unified_tags?') && r.includes('status=eq.active')))
      .toBe(true);
  });

  it('returns null for a slug with no redirect at all, so the caller 404s', async () => {
    mockDb({ unified_tags, tag_slug_redirects });
    await expect(resolveSlugRedirect(env, '/tags/never-existed')).resolves.toBeNull();
  });

  it('covers the /tag/:slug singular alias too', async () => {
    mockDb({ unified_tags, tag_slug_redirects });
    await expect(resolveSlugRedirect(env, '/tag/rack')).resolves.toBe(
      '/tags/risk-aware-consensual-kink',
    );
  });

  it('leaves the other entity kinds resolving without an extra filter', async () => {
    const requested = mockDb({
      venues: [{ id: 'v1', slug: 'new-venue', status: 'whatever' }],
      venue_slug_redirects: [{ old_slug: 'old-venue', venue_id: 'v1' }],
    });
    await expect(resolveSlugRedirect(env, '/venues/old-venue')).resolves.toBe('/venues/new-venue');
    expect(requested.some((r) => r.startsWith('venues?') && r.includes('status='))).toBe(false);
  });

  // The redirect tables are keyed on old_slug and have no `id`. fetchRows'
  // default order is `id.asc`, so ordering must be overridden per lookup or
  // PostgREST 400s and the resolver silently returns null.
  it('never orders a redirect-table lookup by a column those tables lack', async () => {
    const requested = mockDb({
      events: [{ id: 'e1', slug: 'gayhane-1' }],
      event_slug_redirects: [{ old_slug: 'gayhane', event_id: 'e1' }],
    });
    await expect(resolveSlugRedirect(env, '/events/gayhane')).resolves.toBe('/events/gayhane-1');

    const lookup = requested.find((r) => r.startsWith('event_slug_redirects?'));
    expect(lookup, 'the redirect table must actually be queried').toBeTruthy();
    expect(lookup).toContain('order=old_slug');
    expect(lookup, 'id.asc is the default and 400s on these tables').not.toContain('order=id');
  });

  // One case per entity kind whose redirect table lacks an `id`: this is the
  // blast radius of the default-order bug, and a per-kind case is what stops a
  // future refactor from fixing events and leaving the other ten broken.
  it.each([
    ['venue', '/venues/old-v', 'venue_slug_redirects', 'venue_id', 'venues', '/venues/new-v'],
    ['event', '/events/old-e', 'event_slug_redirects', 'event_id', 'events', '/events/new-e'],
    ['hotel', '/hotels/old-h', 'hotel_slug_redirects', 'hotel_id', 'hotels', '/hotels/new-h'],
    ['news', '/news/old-n', 'news_slug_redirects', 'article_id', 'news_articles', '/news/new-n'],
    [
      'personality',
      '/personalities/old-p',
      'personality_slug_redirects',
      'personality_id',
      'personalities',
      '/personalities/new-p',
    ],
    [
      'village',
      '/villages/old-vi',
      'village_slug_redirects',
      'village_id',
      'queer_villages',
      '/villages/new-vi',
    ],
    [
      'country',
      '/country/old-c',
      'country_slug_redirects',
      'country_id',
      'countries',
      '/country/new-c',
    ],
  ])('301s a merged %s through an id-less redirect table', async (
    _kind,
    path,
    redirectTable,
    idColumn,
    entityTable,
    expected,
  ) => {
    const canonical = 'x1';
    mockDb({
      [entityTable]: [{ id: canonical, slug: expected.split('/').pop() }],
      // No `id` key anywhere in these rows — exactly the prod shape.
      [redirectTable]: [{ old_slug: path.split('/').pop(), [idColumn]: canonical }],
    });
    await expect(resolveSlugRedirect(env, path)).resolves.toBe(expected);
  });
});
