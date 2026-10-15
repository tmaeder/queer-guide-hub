import { describe, expect, it } from 'vitest';
import { subpathSettings, subpathSetup } from '../subpath';

describe('website subpath setup', () => {
  it('normalizes public origins and IDNs while preserving a concrete nested prefix', () => {
    expect(subpathSettings('https://EXAMPLE.com/', '/campaign/r', 'links.example.com')).toEqual({
      website: 'https://example.com',
      prefix: '/campaign/r',
      hostname: 'links.example.com',
    });
    expect(subpathSettings('https://bücher.de', '/r', 'links.example.com').website).toBe(
      'https://xn--bcher-kva.de',
    );
  });
  it('rejects ambiguous origins, credentials, private hosts, default ports and host loops', () => {
    for (const website of [
      'http://example.com',
      'https://example.com:443',
      'https://user@example.com',
      'https://@example.com',
      'https://example.com/path',
      'https://example.com/?',
      'https://example.com/#',
      'https://example.com?x=1',
      'https://127.0.0.1',
      'https://10.0.0.1',
      'https://localhost',
      'https://private.internal',
      'https://a.onion',
      'https://-bad.com',
      'https://%65xample.com',
      'https://links.example.com',
      'https://links.example.com.',
      ' https://example.com',
      'https://example.com\\evil',
    ])
      expect(() => subpathSettings(website, '/r', 'links.example.com'), website).toThrow();
  });
  it('rejects root, control, traversal, encoding and hosting matcher syntax in prefixes', () => {
    for (const prefix of [
      '',
      '/',
      '/r/',
      '//r',
      'r',
      '/r//x',
      '/r/..',
      '/r/%2e',
      '/r/:slug',
      '/r*',
      '/r?',
      '/r#',
      '/api',
      '/auth/r',
      '/ADMIN/r',
      '/.well-known',
      '/r\n',
      '/r\\x',
      '/r/é',
      '/' + 'r'.repeat(121),
    ])
      expect(
        () => subpathSettings('https://example.com', prefix, 'links.example.com'),
        prefix,
      ).toThrow();
  });
  it('emits bounded temporary provider rules and exact examples without replacing site config', async () => {
    const next = subpathSetup('https://example.com', '/campaign/r', 'links.example.com', 'nextjs');
    const rules = await (
      await import(
        /* @vite-ignore */ 'data:text/javascript,' + encodeURIComponent(next.configuration)
      )
    ).default.redirects();
    expect(rules).toEqual([
      {
        source: '/campaign/r/:path*',
        destination: 'https://links.example.com/:path*',
        permanent: false,
        basePath: false,
        locale: false,
      },
    ]);
    const vercel = subpathSetup(
      'https://example.com',
      '/campaign/r',
      'links.example.com',
      'vercel',
    );
    expect(JSON.parse(vercel.configuration).redirects).toEqual([
      {
        source: '/campaign/r/:path*',
        destination: 'https://links.example.com/:path*',
        permanent: false,
      },
    ]);
    const netlify = subpathSetup(
      'https://example.com',
      '/campaign/r',
      'links.example.com',
      'netlify',
    );
    expect(netlify.configuration).toBe(
      '/campaign/r https://links.example.com/ 302!\n/campaign/r/* https://links.example.com/:splat 302!\n',
    );
    expect(next.entryExample).toBe('https://example.com/campaign/r/community?utm_source=website');
    expect(next.targetExample).toBe('https://links.example.com/community?utm_source=website');
  });
});
