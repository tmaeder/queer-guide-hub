import { describe, expect, it, vi } from 'vitest';
import { discoverDomainConnect } from '../../../../supabase/functions/_shared/redirect-domain-discovery';
const api = 'https://api.cloudflare.com/client/v4/dns/domainconnect';
const metadata = {
  providerId: 'cloudflare.com',
  urlAPI: api,
  urlSyncUX: 'https://dash.cloudflare.com/domainconnect',
};
const dnsReply = (name: string, type: number, answer: unknown[]) =>
  new Response(
    JSON.stringify({ Status: 0, TC: false, Question: [{ name, type }], Answer: answer }),
    { headers: { 'Content-Type': 'application/dns-json' } },
  );
function fixture({
  zone = 'example.co.uk',
  settings = metadata,
  txt = 'api.cloudflare.com/client/v4/dns/domainconnect',
  templateStatus = 200,
  templateBody = '',
  alias = false,
} = {}) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    expect(init?.redirect).toBe('error');
    expect(init?.cache).toBe('no-store');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.headers).not.toHaveProperty('Authorization');
    if (url.origin === 'https://cloudflare-dns.com') {
      const name = url.searchParams.get('name')!,
        type = Number(url.searchParams.get('type'));
      if (type === 2)
        return dnsReply(
          name,
          type,
          name === zone ? [{ name, type: 2, data: 'ns1.cloudflare.com.' }] : [],
        );
      return dnsReply(
        name,
        type,
        alias
          ? [
              { name, type: 5, data: 'provider-dns.example.net.' },
              { name: 'provider-dns.example.net.', type: 16, data: JSON.stringify(txt) },
            ]
          : [{ name, type: 16, data: JSON.stringify(txt) }],
      );
    }
    if (url.pathname.endsWith('/settings')) return Response.json(settings);
    return new Response(templateBody, {
      status: templateStatus,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}
describe('bounded DNS provider discovery', () => {
  it('uses the real public-suffix parser and closest authoritative zone, then confirms template support', async () => {
    const fetcher = fixture();
    const result = await discoverDomainConnect('go.example.co.uk', { fetcher });
    expect(result).toEqual({
      status: 'available',
      provider: 'cloudflare',
      hostname: 'go.example.co.uk',
      domain: 'example.co.uk',
      host: 'go',
      apiBase: api,
      syncBase: metadata.urlSyncUX,
      templateVersion: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(fetcher.mock.calls[3][0].toString()).toBe(api + '/v2/example.co.uk/settings');
    expect(fetcher.mock.calls[4][0]).toBe(
      api + '/v2/domainTemplates/providers/queer.guide/services/redirects',
    );
    expect(new Set(fetcher.mock.calls.map(([, init]) => init?.signal)).size).toBe(1);
  });
  it('honors a delegated zone and supports a resolver-returned CNAME/TXT chain', async () => {
    const result = await discoverDomainConnect('go.team.example.co.uk', {
      fetcher: fixture({ zone: 'team.example.co.uk', alias: true, templateBody: '{"version":1}' }),
    });
    expect(result).toMatchObject({
      status: 'available',
      domain: 'team.example.co.uk',
      host: 'go',
      templateVersion: 1,
    });
  });
  it('stops at the registrable/private suffix boundary and rejects apex setup', async () => {
    const missing = fixture({ zone: 'other.example.com' });
    expect(await discoverDomainConnect('account.github.io', { fetcher: missing })).toEqual({
      status: 'unsupported',
      reason: 'no_zone',
    });
    expect(missing).toHaveBeenCalledTimes(1);
    expect(await discoverDomainConnect('example.co.uk', { fetcher: fixture() })).toEqual({
      status: 'unsupported',
      reason: 'apex_not_supported',
    });
  });
  it('does not fetch untrusted TXT endpoints or allow cross-provider dashboard destinations', async () => {
    for (const txt of [
      '127.0.0.1',
      'api.cloudflare.com.evil.org/path',
      'tenant.vercel.app',
      'user@api.cloudflare.com/client/v4/dns/domainconnect',
      'api.cloudflare.com/client/v4/other',
      'api.cloudflare.com/client/v4/dns/domainconnect?extra=1',
    ]) {
      const fetcher = fixture({ txt });
      expect(await discoverDomainConnect('go.example.co.uk', { fetcher })).toMatchObject({
        status: 'unsupported',
      });
      expect(fetcher).toHaveBeenCalledTimes(3);
    }
    for (const urlSyncUX of [
      'https://evil.example.com',
      'http://dash.cloudflare.com/domainconnect',
      'https://dash.cloudflare.com.evil.org',
      'https://vercel.com/domainconnect',
      'https://dash.cloudflare.com/domainconnect?next=bad',
    ])
      expect(
        await discoverDomainConnect('go.example.co.uk', {
          fetcher: fixture({ settings: { ...metadata, urlSyncUX } }),
        }),
      ).toMatchObject({ status: 'unsupported' });
  });
  it('distinguishes unsupported templates from transient/malformed provider responses', async () => {
    expect(
      await discoverDomainConnect('go.example.co.uk', {
        fetcher: fixture({ templateStatus: 404 }),
      }),
    ).toEqual({ status: 'unsupported', reason: 'template_not_supported' });
    expect(
      await discoverDomainConnect('go.example.co.uk', {
        fetcher: fixture({ templateStatus: 503 }),
      }),
    ).toEqual({ status: 'unavailable', reason: 'provider_unavailable' });
    expect(
      await discoverDomainConnect('go.example.co.uk', {
        fetcher: fixture({ templateBody: '{"version":2}' }),
      }),
    ).toEqual({ status: 'unsupported', reason: 'template_not_supported' });
    expect(
      await discoverDomainConnect('go.example.co.uk', {
        fetcher: fixture({ templateBody: 'not-json' }),
      }),
    ).toMatchObject({ status: 'unavailable' });
  });
  it('rejects oversized, mismatched and ambiguous resolver payloads before provider fetches', async () => {
    for (const response of [
      new Response('x'.repeat(17000), { headers: { 'Content-Type': 'application/dns-json' } }),
      dnsReply('other.example.com', 2, []),
      new Response('', { status: 302, headers: { Location: 'https://evil.example.com' } }),
    ]) {
      const fetcher = vi.fn<typeof fetch>(async () => response);
      expect(await discoverDomainConnect('go.example.co.uk', { fetcher })).toMatchObject({
        status: 'unavailable',
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    const normal = fixture();
    const ambiguous = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      if (url.searchParams.get('type') === '16') {
        const name = url.searchParams.get('name')!;
        return dnsReply(name, 16, [
          { name, type: 16, data: '"api.cloudflare.com/client/v4/dns/domainconnect"' },
          { name, type: 16, data: '"api.cloudflare.com/client/v4/dns/domainconnect"' },
        ]);
      }
      return normal(input, init);
    });
    expect(await discoverDomainConnect('go.example.co.uk', { fetcher: ambiguous })).toMatchObject({
      status: 'unavailable',
    });
    expect(ambiguous).toHaveBeenCalledTimes(3);
  });
  it('accepts coherent Vercel metadata but rejects a provider switch after DNS discovery', async () => {
    const vercel = {
      providerId: 'vercel.com',
      urlAPI: 'https://api.vercel.com/domainconnect',
      urlSyncUX: 'https://vercel.com/domainconnect',
    };
    expect(
      await discoverDomainConnect('go.example.co.uk', {
        fetcher: fixture({ txt: 'api.vercel.com/domainconnect', settings: vercel }),
      }),
    ).toMatchObject({ status: 'available', provider: 'vercel' });
    const switched = fixture({ settings: vercel });
    expect(await discoverDomainConnect('go.example.co.uk', { fetcher: switched })).toMatchObject({
      status: 'unsupported',
    });
    expect(switched).toHaveBeenCalledTimes(4);
  });
  it('rejects non-object and explicit error template responses', async () => {
    for (const templateBody of [
      'null',
      '[]',
      'true',
      '1',
      '"supported"',
      '{"success":false}',
      '{"error":"not found"}',
      '{"errors":[]}',
    ]) {
      expect(
        await discoverDomainConnect('go.example.co.uk', { fetcher: fixture({ templateBody }) }),
      ).toMatchObject({ status: 'unavailable' });
    }
  });
  it('bounds metadata, rejects redirects, and preserves caller cancellation', async () => {
    for (const bad of [
      () => Response.json({ ...metadata, oversized: 'x'.repeat(33000) }),
      () => new Response('', { status: 302, headers: { Location: 'https://evil.example.com' } }),
    ]) {
      const normal = fixture();
      const fetcher = vi.fn<typeof fetch>(async (input, init) =>
        String(input).endsWith('/settings') ? bad() : normal(input, init),
      );
      expect(await discoverDomainConnect('go.example.co.uk', { fetcher })).toMatchObject({
        status: 'unavailable',
      });
      expect(fetcher).toHaveBeenCalledTimes(4);
    }
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      init?.signal?.throwIfAborted();
      throw new Error('Unexpected request');
    });
    expect(
      await discoverDomainConnect('go.example.co.uk', { fetcher, signal: controller.signal }),
    ).toMatchObject({ status: 'unavailable' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects DNS alias loops without fetching the alias as an HTTP endpoint', async () => {
    const normal = fixture();
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      if (url.searchParams.get('type') === '16') {
        const name = url.searchParams.get('name')!;
        return dnsReply(name, 16, [
          { name, type: 5, data: 'alias.example.net.' },
          { name: 'alias.example.net.', type: 5, data: name + '.' },
        ]);
      }
      return normal(input, init);
    });
    expect(await discoverDomainConnect('go.example.co.uk', { fetcher })).toMatchObject({
      status: 'unavailable',
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
