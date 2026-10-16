import { webcrypto } from 'node:crypto';
import { redirectClientIp } from '../../supabase/functions/_shared/redirect-relay';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../api/redirects/[[path]]';
afterEach(() => vi.unstubAllGlobals());
const invoke = (method = 'POST') =>
  onRequest({
    request: new Request('https://queer.guide/api/redirects/track/sale', {
      method,
      headers: { Authorization: 'Bearer server-fixture', 'Content-Type': 'application/json' },
      ...(['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
        ? { body: '{"eventId":"fixture"}' }
        : {}),
    }),
    params: { path: ['track', 'sale'] },
    env: { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_ANON_KEY: 'public-fixture' },
  } as never);
describe('branded Redirects API proxy', () => {
  it('passes server credentials to the owned endpoint, preserves status and prevents caching', async () => {
    const fetcher = vi.fn(async () => new Response('{"error":"duplicate"}', { status: 409 }));
    vi.stubGlobal('fetch', fetcher);
    const response = await invoke();
    expect(response.status).toBe(409);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Vary')).toContain('Authorization');
    const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe('https://fixture.supabase.co/functions/v1/redirect-api/track/sale');
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer server-fixture');
    expect(options.redirect).toBe('manual');
  });
  it('authenticates the visitor relay for public report rate limits and discards forged relay headers', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const fetcher = vi.fn(async () => new Response('{}', { headers: { Vary: 'Origin' } }));
    vi.stubGlobal('fetch', fetcher);
    const id = '00000000-0000-4000-8000-000000000001',
      secret = 'fixture-secret-at-least-thirty-two-characters';
    const result = await onRequest({
      request: new Request('https://queer.guide/api/redirects/public-report', {
        headers: {
          Authorization: 'Bearer qg_report_' + id,
          'cf-connecting-ip': '203.0.113.5',
          'x-qg-relay-ip': 'forged',
          'x-qg-relay-signature': 'forged',
        },
      }),
      params: { path: ['public-report'] },
      env: { SUPABASE_URL: 'https://fixture.supabase.co', REDIRECT_RELAY_SECRET: secret },
    } as never);
    expect(result.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(result.headers.get('Vary')).toBe('Origin, Authorization, X-Qg-Redirect-Workspace');
    const options = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(await redirectClientIp(new Headers(options[1].headers), 'report:' + id, secret)).toBe(
      '203.0.113.5',
    );
  });
  it.each(['58aa4340-8f21-4b7f-9a10-90be2da89c01', '', 'unsupported'])(
    'preserves explicit workspace selection %j for upstream rejection/authorization',
    async (workspace) => {
      const fetcher = vi.fn(async () => new Response('{}'));
      vi.stubGlobal('fetch', fetcher);
      const response = await onRequest({
        request: new Request('https://queer.guide/api/redirects/links', {
          headers: { Authorization: 'Bearer server-fixture', 'x-qg-redirect-workspace': workspace },
        }),
        params: { path: ['links'] },
        env: { SUPABASE_URL: 'https://fixture.supabase.co' },
      } as never);
      const options = (fetcher.mock.calls[0] as unknown as [URL, RequestInit])[1];
      expect(new Headers(options.headers).get('x-qg-redirect-workspace')).toBe(workspace);
      expect(response.headers.get('Vary')).toContain('X-Qg-Redirect-Workspace');
    },
  );
  it('preserves retry-after on rate-limited policy writes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{"error":"limit"}', { status: 429, headers: { 'Retry-After': '600' } }),
      ),
    );
    const response = await invoke('PATCH');
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('600');
  });
  it.each(['PUT', 'PATCH', 'DELETE'])('forwards %s request bodies unchanged', async (method) => {
    const fetcher = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    expect((await invoke(method)).status).toBe(200);
    const options = (fetcher.mock.calls[0] as unknown as [URL, RequestInit])[1];
    expect(options.method).toBe(method);
    expect(await new Response(options.body).text()).toBe('{"eventId":"fixture"}');
  });
  it('rejects unsupported methods and reports upstream failures without following redirects', async () => {
    expect((await invoke('HEAD')).status).toBe(405);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(null, { status: 302, headers: { Location: 'https://example.com' } }),
      ),
    );
    expect((await invoke()).status).toBe(502);
  });
});
