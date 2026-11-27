import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildHubLinksHtml, HUB_PATHS } from '../../functions/_lib/hubLinks';
import { STATIC_ROUTE_META, isIndexable } from '../../functions/_lib/routeMeta';
import { STATIC_ROUTE_BODY } from '../../functions/_lib/routeBody';
import { resolvedRoutes } from '../test/routeTable';

const { fetchRows } = vi.hoisted(() => ({ fetchRows: vi.fn() }));
vi.mock('../../functions/_lib/sitemap', () => ({ fetchRows }));

afterEach(() => vi.resetAllMocks());

describe('crawler hub route contracts', () => {
  it('places every hub on a real, indexable public page with its own body', () => {
    const pages = new Set(
      resolvedRoutes()
        .filter((r) => !r.isRedirectStub)
        .map((r) => r.path),
    );
    expect(pages.has('/tags/rights-by-country')).toBe(true);
    expect(HUB_PATHS).toContain('/tags/rights-by-country');
    expect(HUB_PATHS.length).toBeGreaterThan(5);
    for (const path of HUB_PATHS) {
      expect(pages.has(path), `${path} has no public page`).toBe(true);
      expect(STATIC_ROUTE_META[path], `${path} has no metadata`).toBeDefined();
      expect(STATIC_ROUTE_BODY[path], `${path} has no crawler body`).toBeDefined();
      expect(isIndexable(path), `${path} is not indexable`).toBe(true);
    }
  });

  it('serves country detail links on the country index and leaves the missing route empty', async () => {
    fetchRows.mockResolvedValue([
      {
        slug: 'germany',
        name: 'Germany',
        lgbti_criminalization: { legal: true },
        lgbti_same_sex_unions: JSON.stringify({ summary: 'Marriage' }),
        equality_score: 92,
      },
      { slug: 'nowhere', name: 'Nowhere' },
    ]);
    const html = await buildHubLinksHtml({ ASSETS: { fetch } }, '/tags/rights-by-country');
    expect(html).toContain('data-prerendered="hub-links"');
    // Each country carries its legal status, so the crawler sees the data
    // the page is cited for, not just a list of names.
    expect(html).toContain(
      '<a href="/country/germany">Germany</a> — same-sex acts legal; same-sex marriage; equality score 92',
    );
    expect(html).toContain('<li><a href="/country/nowhere">Nowhere</a></li>');
    expect(fetchRows).toHaveBeenCalledWith(
      expect.anything(),
      'countries',
      'slug,name,lgbti_criminalization,lgbti_same_sex_unions,equality_score',
      'slug=not.is.null&seo_indexable=eq.true&duplicate_of_id=is.null&shell_status=not.in.(ghost,merged)',
      300,
      'name.asc,slug.asc',
    );
    expect(await buildHubLinksHtml({ ASSETS: { fetch } }, '/countries')).toBe('');
    expect(fetchRows).toHaveBeenCalledTimes(1);
  });

  it('links the RPC-backed hubs with the anon key, as a signed-out visitor sees them', async () => {
    const calls: { url: string; key: string | null }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, key: new Headers(init.headers).get('apikey') });
        const name = url.split('/rpc/')[1];
        const body =
          name === 'substance_interaction_matrix'
            ? { axis: [{ slug: 'mdma', name: 'MDMA' }] }
            : name === 'sti_transmission_matrix'
              ? { stis: [{ slug: 'syphilis', name: 'Syphilis' }] }
              : [{ slug: 'act-up', name: 'ACT UP <NY>' }];
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    const env = {
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    } as never;
    expect(await buildHubLinksHtml(env, '/tags/interactions')).toContain(
      'href="/tags/mdma">MDMA</a>',
    );
    expect(await buildHubLinksHtml(env, '/tags/sti-guide')).toContain(
      'href="/tags/syphilis">Syphilis</a>',
    );
    expect(await buildHubLinksHtml(env, '/organizations')).toContain(
      'href="/organizations/act-up">ACT UP &lt;NY&gt;</a>',
    );
    expect(calls.map((c) => c.key)).toEqual(['anon', 'anon', 'anon']);
    vi.unstubAllGlobals();
  });

  it('renders nothing for an RPC hub when the call fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 500 })),
    );
    const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' } as never;
    expect(await buildHubLinksHtml(env, '/tags/interactions')).toBe('');
    vi.unstubAllGlobals();
  });
});
