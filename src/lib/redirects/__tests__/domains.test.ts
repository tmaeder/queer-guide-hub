import { describe, expect, it, vi } from 'vitest';
import {
  checkRedirectDomainDns,
  domainInput,
  redirectHostname,
} from '../../../../supabase/functions/_shared/redirect-domains';
const proof = { name: '_qg-redirect.links.example.com', value: 'qg-redirect=' + 'a'.repeat(64) };
const answer = {
  Status: 0,
  TC: false,
  Question: [{ name: proof.name + '.', type: 16 }],
  Answer: [{ name: proof.name, type: 16, data: '"' + proof.value + '"' }],
};
const dns = (value: unknown, status = 200) =>
  vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/dns-json' },
      }),
  );
describe('custom-domain ownership verifier', () => {
  it('accepts versioned archive/restore only as boolean updates', () => {
    const version = '10000000-0000-4000-8000-000000000001';
    expect(domainInput({ version, archived: true }, 'patch')).toEqual({ version, archived: true });
    expect(domainInput({ version, archived: false }, 'patch')).toEqual({
      version,
      archived: false,
    });
    for (const archived of ['true', 1, null])
      expect(() => domainInput({ version, archived }, 'patch')).toThrow();
    expect(() =>
      domainInput({ hostname: 'links.example.com', archived: true }, 'create'),
    ).toThrow();
  });
  it('normalizes case, trailing dots and IDNs while rejecting URL/IP/private/infrastructure inputs', () => {
    expect(redirectHostname('LINKS.Example.com.')).toBe('links.example.com');
    expect(redirectHostname('links.bücher.ch')).toBe('links.xn--bcher-kva.ch');
    for (const host of [
      'queer.guide',
      'evil.queer.guide',
      '127.0.0.1',
      '0x7f000001',
      '[::1]',
      'links.local',
      'user@example.com',
      'https://example.com',
      'foo.pages.dev',
      'a..com',
      'example.com/path',
    ])
      expect(() => redirectHostname(host)).toThrow();
    expect(() =>
      domainInput({ hostname: 'links.example.com', ownershipVerified: true }, 'create'),
    ).toThrow();
    expect(() =>
      domainInput({ hostname: 'links.example.com', rootUrl: '/help' }, 'create'),
    ).toThrow();
    expect(() =>
      domainInput(
        { hostname: 'links.example.com', rootUrl: 'https://user:pass@example.com' },
        'create',
      ),
    ).toThrow();
    expect(
      domainInput({ hostname: 'links.example.com', rootUrl: 'https://EXAMPLE.org/path' }, 'create'),
    ).toMatchObject({ rootUrl: 'https://example.org/path' });
  });
  it('checks only exact DNS TXT records from the fixed DoH resolver, including segmented RDATA', async () => {
    const fetcher = dns(answer);
    expect(await checkRedirectDomainDns(proof, fetcher)).toBe('verified');
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe(
      'https://cloudflare-dns.com/dns-query?name=_qg-redirect.links.example.com&type=TXT',
    );
    expect(options).toMatchObject({ redirect: 'error', cache: 'no-store' });
    expect(
      await checkRedirectDomainDns(
        proof,
        dns({
          ...answer,
          Answer: [{ ...answer.Answer[0], data: '"qg-redirect=" "' + 'a'.repeat(64) + '"' }],
        }),
      ),
    ).toBe('verified');
    for (const row of [
      { ...answer.Answer[0], name: '_qg-redirect.other.example.com' },
      { ...answer.Answer[0], type: 5 },
      { ...answer.Answer[0], data: '"prefix-' + proof.value + '"' },
      { ...answer.Answer[0], data: '"' + proof.value + '" garbage' },
    ])
      expect(await checkRedirectDomainDns(proof, dns({ ...answer, Answer: [row] }))).toBe(
        'missing',
      );
  });
  it('distinguishes definite missing proof from unavailable, truncated, malformed or oversized DNS replies', async () => {
    expect(await checkRedirectDomainDns(proof, dns({ ...answer, Status: 3, Answer: [] }))).toBe(
      'missing',
    );
    expect(await checkRedirectDomainDns(proof, dns({ ...answer, Answer: [] }))).toBe('missing');
    for (const value of [
      { ...answer, Status: 2 },
      { ...answer, TC: true },
      { ...answer, Question: [{ name: 'wrong.example.com', type: 16 }] },
      { ...answer, Answer: Array(101).fill(answer.Answer[0]) },
    ])
      expect(await checkRedirectDomainDns(proof, dns(value))).toBe('unavailable');
    expect(await checkRedirectDomainDns(proof, dns(answer, 503))).toBe('unavailable');
    expect(
      await checkRedirectDomainDns(
        proof,
        vi.fn(async () => {
          throw new Error('network');
        }),
      ),
    ).toBe('unavailable');
    expect(
      await checkRedirectDomainDns(
        proof,
        vi.fn(
          async () =>
            new Response('x'.repeat(65537), {
              headers: { 'Content-Type': 'application/dns-json' },
            }),
        ),
      ),
    ).toBe('unavailable');
  });
});
