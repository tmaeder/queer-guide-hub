import { describe, it, expect, vi } from 'vitest';
import {
  associationDocument,
  nativeAppValues,
  publicAppAssociation,
  type NativeAppBinding,
} from '../../../../supabase/functions/_shared/redirect-native-apps';
import { proxyAppAssociation } from '../../../../supabase/functions/_shared/redirect-app-association-proxy';
const ios: NativeAppBinding = {
  platform: 'ios',
  appId: 'ABCDE12345.org.example.app',
  fingerprints: [],
  paths: ['/go/*'],
};
const android: NativeAppBinding = {
  platform: 'android',
  appId: 'org.example.app',
  fingerprints: [Array(32).fill('AA').join(':')],
  paths: ['/go/*'],
};
const env = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_ANON_KEY: 'fixture-public-key',
};
const get = (path = '/.well-known/apple-app-site-association', method = 'GET') =>
  new Request('https://queer.guide' + path, { method });
describe('native app associations', () => {
  it('renders exact platform permissions and Android dynamic exclusions without private fields', () => {
    expect(associationDocument('ios', [ios, android])).toEqual({
      applinks: { details: [{ appIDs: [ios.appId], components: [{ '/': '/go/*' }] }] },
    });
    expect(associationDocument('android', [ios, android])).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: android.appId,
          sha256_cert_fingerprints: android.fingerprints,
        },
        relation_extensions: {
          'delegate_permission/common.handle_all_urls': {
            dynamic_app_link_components: [{ '/': '/go/*' }, { '/': '*', exclude: true }],
          },
        },
      },
    ]);
    expect(associationDocument('android', [])).toEqual([]);
  });
  it('publishes only parent-bound App Clip identities and reconstructs their exact gateway schema', async () => {
    const clipped = { ...ios, appClipId: ios.appId + '.Clip' };
    const document = associationDocument('ios', [clipped, android]);
    expect(document).toEqual({
      applinks: { details: [{ appIDs: [ios.appId], components: [{ '/': '/go/*' }] }] },
      appclips: { apps: [clipped.appClipId] },
    });
    expect(associationDocument('android', [clipped, android])).toEqual(
      associationDocument('android', [ios, android]),
    );
    const proxy = await proxyAppAssociation(
      get(),
      env,
      vi.fn(async () => Response.json(document)),
    );
    expect(proxy?.status).toBe(200);
    expect(await proxy?.json()).toEqual(document);
    expect(nativeAppValues({ appClipId: '  ' })).toEqual({ appClipId: null });
    expect(() => nativeAppValues({ appClipId: true })).toThrow();
    expect(() =>
      associationDocument('ios', [{ ...ios, appClipId: 'OTHER12345.org.other.Clip' }]),
    ).toThrow();
    expect(() => associationDocument('ios', [{ ...ios, appClipId: ios.appId }])).toThrow();
    expect(() =>
      associationDocument('android', [{ ...android, appClipId: clipped.appClipId }]),
    ).toThrow();
    for (const bad of [
      { ...document, appclips: { apps: ['OTHER12345.org.other.Clip'] } },
      { ...document, appclips: { apps: [clipped.appClipId, clipped.appClipId] } },
      { ...document, appclips: { apps: [clipped.appClipId], extra: true } },
      { ...document, webcredentials: { apps: [ios.appId] } },
    ]) {
      expect(
        (
          await proxyAppAssociation(
            get(),
            env,
            vi.fn(async () => Response.json(bad)),
          )
        )?.status,
      ).toBe(503);
    }
  });
  it('normalizes fingerprints and rejects arbitrary identifiers, fields and unsafe patterns', () => {
    expect(
      nativeAppValues(
        {
          label: 'App',
          platform: 'android',
          appId: 'org.example.app',
          fingerprints: ['a'.repeat(64)],
          paths: ['/go/*'],
        },
        true,
      ).fingerprints,
    ).toEqual(android.fingerprints);
    expect(() => nativeAppValues({ label: 'App', unknown: true })).toThrow();
    expect(() => associationDocument('ios', [{ ...ios, appId: '*.org.example.app' }])).toThrow();
    expect(() => associationDocument('android', [{ ...android, fingerprints: [] }])).toThrow();
    expect(() => nativeAppValues({ paths: ['//evil.example.org'] })).toThrow();
    expect(() => nativeAppValues({ paths: ['/go/../admin'] })).toThrow();
    expect(() => associationDocument('ios', [{ ...ios, paths: ['/*'] }], 'queer.guide')).toThrow();
  });
  it('serves public JSON only and treats unavailable hosts separately from an empty publication', async () => {
    const rpc = vi.fn(async () => ({ data: [ios, android], error: null }));
    const request = new Request(
      'https://fixture.supabase.co/functions/v1/redirect-api/public-app-association?hostname=queer.guide&platform=ios',
    );
    const response = await publicAppAssociation(request, { rpc });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(associationDocument('ios', [ios]));
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(rpc).toHaveBeenCalledWith('redirect_native_apps_public', { p_hostname: 'queer.guide' });
    expect(
      (await publicAppAssociation(new Request(request.url, { method: 'HEAD' }), { rpc })).body,
    ).toBeNull();
    expect(
      (await publicAppAssociation(request, { rpc: async () => ({ data: null, error: null }) }))
        .status,
    ).toBe(404);
    expect(
      (
        await publicAppAssociation(new Request(request.url + '&hostname=other.example.com'), {
          rpc,
        })
      ).status,
    ).toBe(400);
    expect(
      (await publicAppAssociation(new Request(request.url, { method: 'POST' }), { rpc })).status,
    ).toBe(405);
  });
  it.each([
    '/.well-known/apple-app-site-association',
    '/apple-app-site-association',
    '/.well-known/assetlinks.json',
  ])(
    'proxies %s through the fixed upstream without a redirect or visitor headers',
    async (path) => {
      const platform = path.includes('assetlinks') ? 'android' : 'ios';
      const fetcher = vi.fn(
        async () =>
          new Response(JSON.stringify(associationDocument(platform, [ios, android])), {
            headers: { 'content-type': 'application/json' },
          }),
      );
      const response = await proxyAppAssociation(
        new Request('https://queer.guide' + path, {
          headers: {
            Authorization: 'Bearer private-visitor',
            cookie: 'private=true',
            'x-forwarded-host': 'evil.example.org',
          },
        }),
        env,
        fetcher,
      );
      expect(response?.status).toBe(200);
      expect(await response?.json()).toEqual(associationDocument(platform, [ios, android]));
      const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
      expect(url.origin).toBe('https://fixture.supabase.co');
      expect(url.searchParams.get('hostname')).toBe('queer.guide');
      expect(options.redirect).toBe('manual');
      expect(options.headers).toEqual({
        Authorization: 'Bearer fixture-public-key',
        apikey: 'fixture-public-key',
      });
    },
  );
  it('rejects redirects, HTML, extra permissions, oversized bodies, malformed JSON and global built-in paths', async () => {
    const fixtures = [
      new Response(null, { status: 302, headers: { location: 'https://evil.example.org' } }),
      new Response('<html/>', { headers: { 'content-type': 'text/html' } }),
      new Response('x'.repeat(65537), { headers: { 'content-type': 'application/json' } }),
      new Response('{}', { headers: { 'content-type': 'application/json' } }),
      new Response(
        JSON.stringify({
          applinks: { details: [{ appIDs: [ios.appId], components: [{ '/': '/*' }] }] },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
      new Response(
        JSON.stringify({ applinks: { details: [] }, webcredentials: { apps: [ios.appId] } }),
        { headers: { 'content-type': 'application/json' } },
      ),
    ];
    for (const fixture of fixtures)
      expect((await proxyAppAssociation(get(), env, async () => fixture))?.status).toBe(503);
  });
  it('does not fetch for unrelated paths, unsafe configuration, query strings or wrong methods', async () => {
    const fetcher = vi.fn();
    expect(await proxyAppAssociation(get('/go/example'), env, fetcher)).toBeNull();
    expect((await proxyAppAssociation(get(undefined, 'POST'), env, fetcher))?.status).toBe(405);
    expect(
      (await proxyAppAssociation(get('/.well-known/assetlinks.json?spoof=1'), env, fetcher))
        ?.status,
    ).toBe(400);
    expect(
      (
        await proxyAppAssociation(
          get(),
          { ...env, SUPABASE_URL: 'https://evil.example.org' },
          fetcher,
        )
      )?.status,
    ).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
