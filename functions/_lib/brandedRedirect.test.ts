import { afterEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { redirectClientIp } from '../../supabase/functions/_shared/redirect-relay';
import { onRequest } from '../go/[slug]';
import { visitorMetadata } from '../../supabase/functions/_shared/redirect-visitor';

afterEach(() => vi.unstubAllGlobals());
function invoke(method = 'GET', slug = 'pride-zurich', query = '', secret?: string) {
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
    env: {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'public-key',
      REDIRECT_RELAY_SECRET: secret,
    },
  } as never);
}
describe('branded tracked URL', () => {
  it('relays Unicode geography without raw non-ASCII header bytes or forged visitor fields', async () => {
    let captured: Request | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, options) => {
        captured = new Request(url, options);
        return new Response(null, { status: 302, headers: { Location: 'https://example.org' } });
      }),
    );
    const request = Object.assign(
      new Request('https://queer.guide/go/geo-fixture', {
        headers: { 'x-qg-visitor-city': 'Forged', 'x-qg-visitor-city-utf8': 'Forged' },
      }),
      { cf: { city: 'Zürich', region: 'Zürich', continent: 'EU', country: 'CH' } },
    );
    expect(
      (
        await onRequest({
          request,
          params: { slug: 'geo-fixture' },
          env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public' },
        } as never)
      ).status,
    ).toBe(302);
    expect(captured?.headers.get('x-qg-visitor-city-utf8')).toBe('Z%C3%BCrich');
    expect(captured?.headers.has('x-qg-visitor-city')).toBe(false);
    expect(visitorMetadata(captured!, false).city).toBe('Zürich');
  });
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
    expect(new Headers(options.headers).get('x-qg-visitor-country')).toBe('CH');
  });
  it('signs the edge visitor IP for the resolver when a relay secret is configured', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const secret = 'x'.repeat(32);
    const fetcher = vi.fn(
      async () => new Response(null, { status: 302, headers: { Location: 'https://example.com' } }),
    );
    vi.stubGlobal('fetch', fetcher);
    await invoke('GET', 'pride-zurich', '', secret);
    const options = (fetcher.mock.calls[0] as unknown as [URL, RequestInit])[1];
    const headers = new Headers(options.headers);
    headers.set('cf-connecting-ip', '192.0.2.99'); // upstream CDN replaced its own header
    expect(await redirectClientIp(headers, 'pride-zurich', secret)).toBe('192.0.2.1');
  });
  it('preserves the rate-limit page and retry time', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<h1>Try again later</h1>', {
            status: 429,
            headers: {
              'Content-Type': 'text/html',
              'Retry-After': '900',
              'Content-Security-Policy': "default-src 'none'",
            },
          }),
      ),
    );
    const response = await invoke('POST');
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('900');
    expect(response.headers.get('Content-Security-Policy')).toBe("default-src 'none'");
    expect(await response.text()).toContain('Try again later');
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
    expect((await invoke('PUT')).status).toBe(405);
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
