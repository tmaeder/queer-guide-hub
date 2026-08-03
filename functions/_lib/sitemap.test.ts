/**
 * Regression tests for the sitemap row fetcher.
 *
 * The bug these lock down: PostgREST enforces a server-side `db-max-rows` cap
 * (1000 on this project) and truncates SILENTLY — `res.ok` is true, no header
 * marks the result as cut. `fetchRows` used to send `limit=5000` in one shot,
 * so every sitemap stopped at 1000 URLs and the majority of the site was never
 * announced to Google.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchRows, SITEMAP_MAX_URLS } from './sitemap';

const SERVER_MAX_ROWS = 1000; // what PostgREST will actually return per request

/**
 * Fake PostgREST that honours limit/offset but, like the real server, caps any
 * page at SERVER_MAX_ROWS regardless of the requested limit.
 */
function mockPostgrest(totalRows: number) {
  const calls: { limit: number; offset: number; order: string | null }[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    const qs = new URL(url).searchParams;
    const limit = Number(qs.get('limit'));
    const offset = Number(qs.get('offset') ?? 0);
    calls.push({ limit, offset, order: qs.get('order') });
    const n = Math.max(0, Math.min(Math.min(limit, SERVER_MAX_ROWS), totalRows - offset));
    const rows = Array.from({ length: n }, (_, i) => ({ id: offset + i, slug: `s${offset + i}` }));
    return new Response(JSON.stringify(rows), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' } as never;

afterEach(() => vi.unstubAllGlobals());

describe('fetchRows pagination', () => {
  it('returns every row when the result set exceeds the server row cap', async () => {
    mockPostgrest(6047); // the measured personalities count that returned 1000
    const rows = await fetchRows(env, 'personalities', 'slug');
    expect(rows).toHaveLength(6047);
  });

  it('never requests a page larger than the server will return', async () => {
    const calls = mockPostgrest(2500);
    await fetchRows(env, 'venues', 'slug');
    expect(calls.every((c) => c.limit <= SERVER_MAX_ROWS)).toBe(true);
  });

  it('always orders, so pages cannot overlap or skip rows', async () => {
    const calls = mockPostgrest(2500);
    const rows = await fetchRows(env, 'venues', 'slug');
    expect(calls.every((c) => c.order)).toBe(true);
    expect(new Set(rows.map((r) => r.slug)).size).toBe(rows.length);
  });

  it('stops on a short page rather than looping to the ceiling', async () => {
    const calls = mockPostgrest(1500);
    await fetchRows(env, 'venues', 'slug');
    expect(calls).toHaveLength(2);
  });

  it('probes once more when the total is an exact multiple of the page size', async () => {
    const calls = mockPostgrest(2000);
    const rows = await fetchRows(env, 'venues', 'slug');
    expect(rows).toHaveLength(2000);
    expect(calls).toHaveLength(3); // 1000, 1000, then an empty page ends it
  });

  it('honours a caller-supplied cap without crying wolf', async () => {
    // sitemap-landings.xml caps major cities at 200 on purpose. That is a
    // deliberate bound, not the truncation bug — it must not raise a warning
    // on every single request, or the real warning below becomes invisible.
    mockPostgrest(10_000);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const rows = await fetchRows(env, 'cities', 'slug', '', 200);
    expect(rows).toHaveLength(200);
    expect(warn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('deliberate bound'));
    warn.mockRestore();
    log.mockRestore();
  });

  it('warns loudly when a type outgrows the global sitemap ceiling', async () => {
    mockPostgrest(SITEMAP_MAX_URLS + 1000);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rows = await fetchRows(env, 'venues', 'slug');
    expect(rows).toHaveLength(SITEMAP_MAX_URLS);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('TRUNCATED'));
    warn.mockRestore();
  });

  it('surfaces a mid-pagination failure instead of silently returning a short list', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (n++ === 0) {
        return new Response(JSON.stringify(Array.from({ length: 1000 }, (_, i) => ({ id: i }))), { status: 200 });
      }
      return new Response('boom', { status: 500 });
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rows = await fetchRows(env, 'venues', 'slug');
    expect(rows).toHaveLength(1000);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('failed: 500'));
    warn.mockRestore();
  });

  it('keeps the ceiling at or under Google per-sitemap limit', () => {
    expect(SITEMAP_MAX_URLS).toBeLessThanOrEqual(50_000);
  });

  it('preserves caller filters on every page', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      const off = Number(new URL(url).searchParams.get('offset'));
      const n = off === 0 ? 1000 : 5;
      return new Response(JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: off + i }))), { status: 200 });
    }));
    await fetchRows(env, 'venues', 'slug', 'safety_gated=eq.false&seo_indexable=eq.true');
    expect(urls).toHaveLength(2);
    for (const u of urls) {
      expect(u).toContain('safety_gated=eq.false');
      expect(u).toContain('seo_indexable=eq.true');
    }
  });
});
