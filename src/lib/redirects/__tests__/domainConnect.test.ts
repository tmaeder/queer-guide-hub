import { webcrypto } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import template from '../../../../config/domain-connect/queer.guide.redirects.json';
import {
  DOMAIN_CONNECT_TARGET,
  DOMAIN_CONNECT_PROVIDER,
  DOMAIN_CONNECT_SERVICE,
  DOMAIN_CONNECT_KEY_DOMAIN,
  signDomainConnectQuery,
} from '../../../../supabase/functions/_shared/redirect-domain-connect';
let pair: CryptoKeyPair;
const request = {
  rootDomain: 'example.com',
  hostname: 'go.example.com',
  verificationToken: 'a'.repeat(64),
  operationId: '00000000-0000-4000-8000-000000000001',
  keyLabel: '_dcpubkeyv1',
};
beforeAll(async () => {
  vi.stubGlobal('crypto', webcrypto);
  pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    false,
    ['sign', 'verify'],
  );
});
afterAll(() => vi.unstubAllGlobals());
describe('Domain Connect signing foundation', () => {
  it('uses a fixed scoped CNAME plus the matching ownership TXT template', () => {
    expect(template).toMatchObject({
      providerId: DOMAIN_CONNECT_PROVIDER,
      serviceId: DOMAIN_CONNECT_SERVICE,
      syncPubKeyDomain: DOMAIN_CONNECT_KEY_DOMAIN,
      syncRedirectDomain: 'queer.guide',
      hostRequired: true,
      syncBlock: false,
    });
    expect(template.records).toEqual([
      { type: 'CNAME', host: '@', pointsTo: DOMAIN_CONNECT_TARGET + '.', ttl: 1800 },
      { type: 'TXT', host: '_qg-redirect', data: 'qg-redirect=%verification%', ttl: 1800 },
    ]);
    expect(JSON.stringify(template.records).match(/%[^%]+%/g)).toEqual(['%verification%']);
  });
  it('signs the exact encoded query, excludes key/sig, and binds Cloudflare callback correlation', async () => {
    const result = await signDomainConnectQuery(request, pair.privateKey);
    const unsigned = result.query.split('&key=')[0];
    const params = new URLSearchParams(result.query);
    expect(params.get('domain')).toBe('example.com');
    expect(params.get('host')).toBe('go');
    expect(params.get('key')).toBe('_dcpubkeyv1');
    expect(params.has('state')).toBe(false);
    expect(result.query.split('&').at(-1)).toMatch(/^sig=/);
    expect(params.get('redirect_uri')).toBe(
      'https://queer.guide/admin/content/redirects?domain_connect=' + request.operationId,
    );
    const signature = Uint8Array.from(atob(params.get('sig')!), (c) => c.charCodeAt(0));
    expect(
      await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        pair.publicKey,
        signature,
        new TextEncoder().encode(unsigned),
      ),
    ).toBe(true);
    expect(
      await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        pair.publicKey,
        signature,
        new TextEncoder().encode(unsigned.replace('host=go', 'host=other')),
      ),
    ).toBe(false);
  });
  it('normalizes IDNs and supports scoped nested/delegated subdomain hosts', async () => {
    const result = await signDomainConnectQuery(
      { ...request, rootDomain: 'BÜCHER.DE', hostname: 'nested.go.bücher.de' },
      pair.privateKey,
    );
    expect(result.domain).toBe('xn--bcher-kva.de');
    expect(result.host).toBe('nested.go');
  });
  it('rejects apex, unrelated/private names, arbitrary callback/key fields and malformed challenges', async () => {
    for (const patch of [
      { hostname: 'example.com' },
      { hostname: 'evilexample.com' },
      { hostname: 'go.other.com' },
      { hostname: '127.0.0.1' },
      { keyLabel: '_v1.other.com' },
      { keyLabel: '../key' },
      { operationId: 'invalid' },
      { verificationToken: 'a'.repeat(63) },
      { rootDomain: 'https://example.com' },
    ])
      await expect(
        signDomainConnectQuery({ ...request, ...patch }, pair.privateKey),
      ).rejects.toThrow();
    const extra = { ...request, callback: 'https://outside.example.com/' };
    await expect(signDomainConnectQuery(extra, pair.privateKey)).rejects.toThrow('only DNS setup');
    await expect(signDomainConnectQuery(request, pair.publicKey)).rejects.toThrow('RS256');
  });
});
