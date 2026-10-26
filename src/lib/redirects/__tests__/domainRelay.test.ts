import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  domainLinkSlug,
  domainRelayHeaders,
  signDomainRelay,
  verifyDomainRelay,
} from '../../../../supabase/functions/_shared/redirect-domain-relay';
import worker from '../../../../workers/redirect-domains/index';
import { visitorMetadata } from '../../../../supabase/functions/_shared/redirect-visitor';
const secret = 'fixture-domain-secret-'.repeat(3);
const env = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_ANON_KEY: 'public-fixture-key',
  REDIRECT_RELAY_SECRET: secret,
};
afterEach(() => vi.unstubAllGlobals());
async function signed(
  method = 'GET',
  url = new URL('https://links.community.com/pride-qr?qg_qr=1&utm_source=poster'),
) {
  vi.stubGlobal('crypto', webcrypto);
  const relay = await signDomainRelay(method, url, '192.0.2.1', secret);
  const upstream = new URL('https://fixture.supabase.co/functions/v1/redirect-handler');
  upstream.searchParams.set('slug', domainLinkSlug(url.pathname));
  upstream.searchParams.set('q', url.searchParams.toString());
  return {
    relay: relay!,
    request: new Request(upstream, { method, headers: domainRelayHeaders(relay!) }),
  };
}
describe('domain-separated authenticated branded relay', () => {
  it('uses encoded geography from Cloudflare metadata on custom domains', async () => {
    vi.stubGlobal('crypto', webcrypto);
    let captured: Request | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, options) => {
        captured = new Request(url, options);
        return new Response(null, { status: 302, headers: { Location: 'https://example.org' } });
      }),
    );
    const request = Object.assign(
      new Request('https://links.community.com/geo-fixture', {
        headers: { 'cf-connecting-ip': '192.0.2.1', 'x-qg-visitor-city-utf8': 'Forged' },
      }),
      { cf: { city: '東京', region: 'São Paulo', country: 'JP', continent: 'AS' } },
    );
    expect((await worker.fetch(request, env)).status).toBe(302);
    expect(visitorMetadata(captured!, false)).toMatchObject({
      city: '東京',
      region: 'São Paulo',
      continent: 'AS',
    });
    expect(captured?.headers.has('x-qg-visitor-city')).toBe(false);
  });
  it('binds method, actual hostname, path, query, visitor IP and time, rejecting every altered field', async () => {
    const { relay, request } = await signed();
    expect(await verifyDomainRelay(request, secret)).toEqual(relay);
    for (const [field, replacement] of Object.entries({
      hostname: 'other.community.com',
      path: '/other-slug',
      query: 'utm_source=spoof',
      ip: '192.0.2.2',
      timestamp: String(Number(relay.timestamp) - 121),
      signature: '0'.repeat(64),
    })) {
      const headers = new Headers(request.headers);
      headers.set('x-qg-domain-' + field, replacement);
      expect(await verifyDomainRelay(new Request(request.url, { headers }), secret)).toBeNull();
    }
    expect(
      await verifyDomainRelay(
        new Request(request.url, { method: 'POST', headers: request.headers }),
        secret,
      ),
    ).toBeNull();
    expect(await verifyDomainRelay(request, 'other-secret'.repeat(5))).toBeNull();
    expect(await verifyDomainRelay(request)).toBeNull();
    expect(
      await verifyDomainRelay(
        new Request(request.url + '&slug=other-link', { headers: request.headers }),
        secret,
      ),
    ).toBeNull();
    expect(
      await verifyDomainRelay(
        new Request(request.url + '&pw=unsigned', { headers: request.headers }),
        secret,
      ),
    ).toBeNull();
    const changed = new URL(request.url);
    changed.searchParams.set('q', 'utm_source=altered');
    expect(
      await verifyDomainRelay(new Request(changed, { headers: request.headers }), secret),
    ).toBeNull();
    expect(
      await signDomainRelay('GET', new URL('http://links.community.com/pride-qr'), 'ip', secret),
    ).toBeNull();
    expect(
      await signDomainRelay('GET', new URL('https://queer.guide/go/pride-qr'), 'ip', secret),
    ).toBeNull();
  });
  it('derives scope from the request URL and strips all incoming internal, auth and cookie headers', async () => {
    vi.stubGlobal('crypto', webcrypto);
    let upstream: Request | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, options) => {
        upstream = new Request(url, options);
        return new Response(null, {
          status: 302,
          headers: {
            Location: 'https://example.com/events',
            'Set-Cookie': 'private=1',
            'X-QG-Domain-Signature': 'never-echo',
          },
        });
      }),
    );
    const request = new Request('https://links.community.com/pride-qr?utm_source=poster', {
      headers: {
        Host: 'other.community.com',
        'X-Forwarded-Host': 'other.community.com',
        'x-qg-domain-hostname': 'other.community.com',
        'x-qg-relay-signature': 'spoof',
        Authorization: 'Bearer attacker',
        Cookie: 'secret=1',
        'cf-connecting-ip': '192.0.2.1',
      },
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(302);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(response.headers.has('X-QG-Domain-Signature')).toBe(false);
    expect((await verifyDomainRelay(upstream!, secret))?.hostname).toBe('links.community.com');
    expect(upstream!.headers.get('Authorization')).toBe('Bearer public-fixture-key');
    for (const key of ['Cookie', 'Host', 'X-Forwarded-Host', 'x-qg-relay-signature'])
      expect(upstream!.headers.has(key)).toBe(false);
  });
  it('fails closed without configuration or transport, and rejects oversized password forms before a fetch', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const fetcher = vi.fn(async () => {
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', fetcher);
    const request = new Request('https://links.community.com/pride-qr');
    expect((await worker.fetch(request, { ...env, REDIRECT_RELAY_SECRET: '' })).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await worker.fetch(request, env)).status).toBe(502);
    fetcher.mockClear();
    const large = new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'password=' + 'a'.repeat(4096),
    });
    expect((await worker.fetch(large, env)).status).toBe(502);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('proxies a bounded password form and protected HTML without forwarding cookies', async () => {
    vi.stubGlobal('crypto', webcrypto);
    let upstream: Request | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, options) => {
        upstream = new Request(url, options);
        return new Response('<form>Protected link</form>', {
          status: 401,
          headers: {
            'Content-Type': 'text/html',
            'Content-Security-Policy': "default-src 'none'",
            'Set-Cookie': 'bad=1',
          },
        });
      }),
    );
    const response = await worker.fetch(
      new Request('https://links.community.com/pride-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'password=fixture',
      }),
      env,
    );
    expect(response.status).toBe(401);
    expect(await response.text()).toContain('Protected link');
    expect(response.headers.get('Content-Security-Policy')).toBe("default-src 'none'");
    expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(await upstream!.text()).toBe('password=fixture');
    expect(await verifyDomainRelay(upstream!, secret)).not.toBeNull();
  });
  it('exposes the routing health result only to allowed browser origins and accepts only GET', async () => {
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{"ready":true,"protocol":1}', {
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const url = 'https://links.community.com/.well-known/qg-redirect';
    const allowed = await worker.fetch(
      new Request(url, { headers: { Origin: 'https://queer.guide' } }),
      env,
    );
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://queer.guide');
    expect(allowed.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    const denied = await worker.fetch(
      new Request(url, { headers: { Origin: 'https://evil.example' } }),
      env,
    );
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect((await worker.fetch(new Request(url, { method: 'POST' }), env)).status).toBe(405);
  });
});
