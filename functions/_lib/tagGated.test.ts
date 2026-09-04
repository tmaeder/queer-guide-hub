/**
 * A gated glossary term must reach the SPA as a sign-in gate, never as a 404,
 * and must never reach a crawler as prose.
 *
 * `unified_tags_public_gated_read` hides a sensitive term from anon until an
 * editor reviews it. Measured on prod 2026-09-03: 101 active tags in that state
 * — the whole Kinktionary cohort — and `/tags/footjob` answered a browser UA
 * with HTTP 404 while rendering normally for a signed-in user, against
 * `/tags/kink` (sensitive, reviewed) and `/tags/fluffer` (not sensitive) at 200.
 *
 * The edge half is load-bearing and easy to skip: `functions/_middleware.ts`
 * hard-404s when `resolveDetailRoute` returns null on a detail path, so the SPA
 * never mounts on a hard load and the sign-in gate added to
 * src/pages/TagDetail.tsx could not be reached. Fixing only the SPA leaves the
 * 404 exactly where it was for anyone arriving by link.
 *
 * TWO KEYS, TWO PATHS, and both have to hold — which is the reason this file
 * exists rather than one case:
 *
 *  - anon key (prod): RLS hides the row, `fetchRows` returns nothing, and the
 *    `gated_entity_exists` RPC is the only thing that can tell "gated" from
 *    "no such term".
 *  - service-role key (previews, local): RLS is bypassed, the row arrives in
 *    full, and `tagIsAnonGated` is the only thing between an unreviewed explicit
 *    definition and the crawler-visible <article> body. `seo_indexable=false`
 *    does not help — it suppresses indexing, not the prose we hand over.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveDetailRoute, tagIsAnonGated } from './detail';

type Row = Record<string, unknown>;

const ANON_ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' } as never;
const SERVICE_ENV = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'svc',
} as never;

const GATED: Row = {
  id: 'tag-1',
  name: 'Footjob',
  slug: 'footjob',
  status: 'active',
  description: 'A sexual act involving the feet.',
  long_description: 'An unreviewed definition that must not reach a crawler.',
  seo_indexable: false,
  is_sensitive: true,
  verification_status: 'unverified',
};

const READABLE: Row = {
  id: 'tag-2',
  name: 'Kink',
  slug: 'kink',
  status: 'active',
  description: 'Sexual practice outside the conventional.',
  seo_indexable: true,
  is_sensitive: true,
  verification_status: 'reviewed',
};

/**
 * PostgREST double.
 *
 * `applyRls` is the whole point: with the anon key it filters exactly as
 * `unified_tags_public_gated_read` does, so the fixture cannot accidentally hand
 * back a row prod would withhold. The RPC is answered from the same predicate
 * rather than a hardcoded list, for the same reason — a fixture where the two
 * disagree tests neither.
 */
function mockDb(tags: Row[], { applyRls }: { applyRls: boolean }) {
  const requested: string[] = [];
  const hidden = (r: Row) =>
    r.is_sensitive === true && r.verification_status !== 'reviewed' && r.verification_status !== 'locked';

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      const table = u.pathname.split('/').pop() as string;

      if (u.pathname.includes('/rpc/gated_entity_exists')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          p_entity_type: string;
          p_slug: string;
        };
        requested.push(`rpc:${body.p_entity_type}:${body.p_slug}`);
        const hit =
          body.p_entity_type === 'tag' &&
          tags.some((r) => r.slug === body.p_slug && r.status === 'active' && hidden(r));
        return new Response(JSON.stringify(hit), { status: 200 });
      }

      requested.push(`${table}?${u.searchParams.toString()}`);
      const eq = (k: string) => u.searchParams.get(k)?.replace(/^eq\./, '');
      let rows: Row[] = table === 'unified_tags' ? tags : [];
      for (const key of ['slug', 'status', 'tag_id']) {
        const want = eq(key);
        if (want !== undefined && want !== null) rows = rows.filter((r) => r[key] === want);
      }
      if (applyRls) rows = rows.filter((r) => !hidden(r));
      return new Response(JSON.stringify(rows), { status: 200 });
    }),
  );
  return requested;
}

afterEach(() => vi.unstubAllGlobals());

describe('tagIsAnonGated', () => {
  it('gates a sensitive term that no editor has reviewed', () => {
    expect(tagIsAnonGated({ is_sensitive: true, verification_status: 'unverified' })).toBe(true);
  });

  it('gates a sensitive term with NO verification_status at all', () => {
    // The SQL policy denies on NULL — `verification_status = any(...)` is NULL,
    // not false, so the OR never becomes true. A `!== 'reviewed'` check that
    // treated a missing value as "fine" would publish the row.
    expect(tagIsAnonGated({ is_sensitive: true })).toBe(true);
    expect(tagIsAnonGated({ is_sensitive: true, verification_status: null })).toBe(true);
  });

  it('does not gate the three shapes anon can legitimately read', () => {
    expect(tagIsAnonGated({ is_sensitive: true, verification_status: 'reviewed' })).toBe(false);
    expect(tagIsAnonGated({ is_sensitive: true, verification_status: 'locked' })).toBe(false);
    expect(tagIsAnonGated({ is_sensitive: false, verification_status: 'unverified' })).toBe(false);
  });

  it('does not gate a row where is_sensitive is absent or null', () => {
    // `coalesce(is_sensitive, false)` in the policy — an unset flag is not a gate.
    expect(tagIsAnonGated({ verification_status: 'unverified' })).toBe(false);
    expect(tagIsAnonGated({ is_sensitive: null, verification_status: 'unverified' })).toBe(false);
  });
});

describe('gated tag at the edge, anon key (production shape)', () => {
  it('returns a non-null gated result so the middleware serves the SPA, not a 404', async () => {
    mockDb([GATED, READABLE], { applyRls: true });
    const detail = await resolveDetailRoute(ANON_ENV, '/tags/footjob');
    // Non-null is the assertion that matters: `!detail` on a detail path is
    // exactly what produced the prod 404.
    expect(detail).not.toBeNull();
    expect(detail?.meta.title).toMatch(/sign in/i);
    expect(detail?.indexable).toBe(false);
  });

  it('leaks no part of the term to a crawler', async () => {
    mockDb([GATED, READABLE], { applyRls: true });
    const detail = await resolveDetailRoute(ANON_ENV, '/tags/footjob');
    // Assert we got a document BEFORE asserting what is absent from it.
    // Mutation-tested: without this line the whole case passes on a null detail,
    // i.e. on the very 404 regression it exists to catch.
    expect(detail).not.toBeNull();
    const served = `${detail!.body}${detail!.jsonLd}${detail!.meta.title}${detail!.meta.description}`;
    expect(served).not.toMatch(/footjob/i);
    expect(served).not.toContain('must not reach a crawler');
  });

  it('still 404s a slug that genuinely does not exist', async () => {
    // The inverse control. "Never 404s" would also pass a build that offered a
    // sign-in gate for every typo, which would delete the 404 entirely.
    const requested = mockDb([GATED, READABLE], { applyRls: true });
    await expect(resolveDetailRoute(ANON_ENV, '/tags/not-a-real-term')).resolves.toBeNull();
    expect(requested).toContain('rpc:tag:not-a-real-term');
  });

  it('still 404s a merged tag, so resolveSlugRedirect can 301 it instead', async () => {
    // A merged row keeps its slug and is gated-shaped. If the RPC claimed it,
    // the middleware would offer a sign-in gate for a concept that has a live
    // canonical one hop away and the 301 would never run.
    mockDb([{ ...GATED, slug: 'rack', status: 'merged' }], { applyRls: true });
    await expect(resolveDetailRoute(ANON_ENV, '/tags/rack')).resolves.toBeNull();
  });

  it('renders a reviewed sensitive term normally — the gate is not blanket', async () => {
    mockDb([GATED, READABLE], { applyRls: true });
    const detail = await resolveDetailRoute(ANON_ENV, '/tags/kink');
    expect(detail?.meta.title).toContain('Kink');
    expect(detail?.body).toContain('Sexual practice outside the conventional');
  });
});

describe('gated tag at the edge, service-role key (RLS bypassed)', () => {
  it('withholds the row the fetch DID return', async () => {
    // The key difference from the anon case: `fetchRows` hands back the full
    // row, so nothing but the in-process predicate stops the prose. A build that
    // relied on RLS alone passes every anon test above and fails here.
    const requested = mockDb([GATED, READABLE], { applyRls: false });
    const detail = await resolveDetailRoute(SERVICE_ENV, '/tags/footjob');
    expect(requested.some((r) => r.startsWith('unified_tags?'))).toBe(true);
    expect(detail).not.toBeNull();
    expect(detail?.indexable).toBe(false);
    expect(`${detail?.body}${detail?.jsonLd}`).not.toMatch(/footjob|must not reach a crawler/i);
  });

  it('selects the two columns the predicate needs', async () => {
    // Without them every row reads as un-gated and the check above is vacuous —
    // the failure mode is a silently dropped column in the select list.
    const requested = mockDb([GATED], { applyRls: false });
    await resolveDetailRoute(SERVICE_ENV, '/tags/footjob');
    const tagQuery = requested.find((r) => r.startsWith('unified_tags?'))!;
    expect(tagQuery).toContain('is_sensitive');
    expect(tagQuery).toContain('verification_status');
  });
});
