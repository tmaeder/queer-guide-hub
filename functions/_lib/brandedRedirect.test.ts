import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../go/[slug]';

afterEach(() => vi.unstubAllGlobals());
function invoke(method = 'GET', slug = 'pride-zurich', query = '') {
  return onRequest({
    request: new Request(`https://queer.guide/go/${slug}${query}`, {
      method,
      headers: {
        'cf-ipcountry': 'CH',
        'cf-connecting-ip': '192.0.2.1',
        referer: 'https://example.com',
      },
    }),
    params: { slug },
    env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-key' },
  } as never);
}
describe('branded tracked URL', () => {
  it('preserves encoded query/context and returns the resolver redirect without following it', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: 'https://queer.guide/events?utm_source=qr' },
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    const response = await invoke('GET', 'pride-zurich', '?utm_source=qr&name=A%26B');
    expect(response.status).toBe(302);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get('q')).toBe('utm_source=qr&name=A%26B');
    expect(options.redirect).toBe('manual');
    expect(new Headers(options.headers).get('cf-ipcountry')).toBe('CH');
  });
  it('forwards HEAD as HEAD rather than generating a GET visit', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { Location: 'https://queer.guide/events' } }),
    );
    vi.stubGlobal('fetch', fetcher);
    expect((await invoke('HEAD')).status).toBe(302);
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ method: 'HEAD' }),
    );
  });
  it('rejects invalid slugs and writes, and fails clearly on missing/upstream errors', async () => {
    expect((await invoke('POST')).status).toBe(405);
    expect((await invoke('GET', 'xx')).status).toBe(404);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    expect((await invoke()).status).toBe(404);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    expect((await invoke()).status).toBe(502);
  });
});
