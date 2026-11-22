/**
 * /spots/:slug at the edge renders the venue or organisation page, and must declare the old
 * URL canonical until the spots redirect switch — otherwise every venue gains a second
 * self-canonical URL.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isDetailPath, resolveDetailRoute } from './detail';

type Row = Record<string, unknown>;
const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' } as never;

const VENUE: Row = {
  name: 'Berghain',
  slug: 'berghain',
  description: 'A club.',
  city: 'Berlin',
  safety_gated: false,
};
const ORG: Row = {
  id: 'o1',
  name: 'Acme Support',
  slug: 'acme-support',
  status: 'active',
  roles: ['support'],
};
// Shares the venue's slug (3,209 such pairs on prod before the P2 fold): the place must win.
const ORG_TWIN: Row = {
  id: 'o2',
  name: 'Berghain Holding',
  slug: 'berghain',
  status: 'active',
  roles: ['venue'],
};

function mockDb() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.pathname.includes('/rpc/')) return new Response('false', { status: 200 });
      const table = u.pathname.split('/').pop();
      const slug = u.searchParams.get('slug')?.replace(/^eq\./, '');
      const rows = table === 'venues' ? [VENUE] : table === 'organizations' ? [ORG, ORG_TWIN] : [];
      return new Response(JSON.stringify(rows.filter((r) => r.slug === slug)), { status: 200 });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('/spots/:slug at the edge', () => {
  it('is a detail path', () => {
    expect(isDetailPath('/spots/berghain')).toBe(true);
  });

  it('renders a venue with /venues/:slug as canonical', async () => {
    mockDb();
    const r = await resolveDetailRoute(ENV, '/spots/berghain');
    expect(r?.canonicalPath).toBe('/venues/berghain');
    expect(r?.meta.title).toContain('Berghain');
    expect(r?.meta.title).not.toContain('Holding');
  });

  it('falls back to the organisation with /organizations/:slug as canonical', async () => {
    mockDb();
    const r = await resolveDetailRoute(ENV, '/spots/acme-support');
    expect(r?.canonicalPath).toBe('/organizations/acme-support');
    expect(r?.meta.title).toContain('Acme Support');
  });

  it('returns null for an unknown slug, so the middleware 404s', async () => {
    mockDb();
    expect(await resolveDetailRoute(ENV, '/spots/nothing-here')).toBeNull();
  });
});
