import { webcrypto } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  domainConnectConfig,
  domainConnectInput,
} from '../../../../supabase/functions/_shared/redirect-domain-connect-api';
let key: JsonWebKey;
beforeAll(async () => {
  vi.stubGlobal('crypto', webcrypto);
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  key = await crypto.subtle.exportKey('jwk', pair.privateKey);
});
afterAll(() => vi.unstubAllGlobals());
describe('server DNS setup configuration', () => {
  it('imports a non-exportable signing key and binds configuration identity to its public key, DNS label and fixed target', async () => {
    const config = await domainConnectConfig(JSON.stringify(key), '_v1', 'links.queer.guide.');
    expect(config).toMatchObject({
      keyLabel: '_v1',
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(config!.privateKey.extractable).toBe(false);
    const repeated = await domainConnectConfig(
      JSON.stringify({ ...key, ext: false }),
      '_v1',
      'LINKS.QUEER.GUIDE',
    );
    expect(repeated!.fingerprint).toBe(config!.fingerprint);
    expect(
      (await domainConnectConfig(JSON.stringify(key), '_v2', 'links.queer.guide'))!.fingerprint,
    ).not.toBe(config!.fingerprint);
  });
  it('fails closed for absent/malformed keys, an unsigned mode, invalid DNS labels and a different SaaS target', async () => {
    for (const [jwk, label, target] of [
      ['', '_v1', 'links.queer.guide'],
      ['null', '_v1', 'links.queer.guide'],
      ['x'.repeat(17000), '_v1', 'links.queer.guide'],
      [JSON.stringify({ ...key, alg: 'PS256' }), '_v1', 'links.queer.guide'],
      [JSON.stringify({ ...key, use: 'enc' }), '_v1', 'links.queer.guide'],
      [JSON.stringify({ ...key, d: undefined }), '_v1', 'links.queer.guide'],
      [JSON.stringify(key), '_v1.evil.example.com', 'links.queer.guide'],
      [JSON.stringify(key), '_v1', 'other.example.com'],
    ])
      expect(await domainConnectConfig(jwk, label, target)).toBeNull();
  });
  it('accepts only current versions and operation IDs for the requested action', () => {
    const version = '00000000-0000-4000-8000-000000000001',
      operation = '00000000-0000-4000-8000-000000000002';
    expect(domainConnectInput({ version }, 'discover')).toEqual({ version });
    expect(domainConnectInput({ version, operation }, 'approve')).toEqual({ version, operation });
    for (const value of [
      null,
      [],
      {},
      { version, target: 'evil.example.com' },
      { version, operation },
    ])
      expect(() => domainConnectInput(value, 'discover')).toThrow();
    for (const value of [
      { version },
      { version, operation: 'bad' },
      { version, operation, success: true },
      { version, operation, callback: 'https://evil.example.com' },
    ])
      expect(() => domainConnectInput(value, 'complete')).toThrow();
  });
});
