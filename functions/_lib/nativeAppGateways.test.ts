import { afterEach, describe, it, expect, vi } from 'vitest';
import domainWorker from '../../workers/redirect-domains/index';
import { onRequest } from '../_middleware';
import { publicAppAssociation } from '../../supabase/functions/_shared/redirect-native-apps';
const env = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_ANON_KEY: 'fixture-public',
  REDIRECT_RELAY_SECRET: 'fixture-relay-secret-'.repeat(3),
};
afterEach(() => vi.unstubAllGlobals());
describe('native association gateway wiring', () => {
  it('serves both built-in hosts before SEO, asset fallback and locale processing', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      publicAppAssociation(new Request(input, init), {
        rpc: async (_name, args) => ({
          data: [
            {
              platform: 'ios',
              appId: 'ABCDE12345.org.example.gateway',
              fingerprints: [],
              paths: ['/go/*'],
            },
          ],
          error: args.p_hostname ? null : 'missing host',
        }),
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    const next = vi.fn();
    for (const hostname of ['queer.guide', 'www.queer.guide']) {
      const request = new Request(
        'https://' + hostname + '/.well-known/apple-app-site-association',
      );
      const response = await onRequest({ request, env, next } as unknown as Parameters<
        typeof onRequest
      >[0]);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(response.headers.get('location')).toBeNull();
      expect(await response.json()).toEqual({
        applinks: {
          details: [{ appIDs: ['ABCDE12345.org.example.gateway'], components: [{ '/': '/go/*' }] }],
        },
      });
    }
    expect(next).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('uses the actual branded hostname and public credentials while omitting visitor and relay secrets', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      publicAppAssociation(new Request(input, init), {
        rpc: async (_name, args) => ({
          data:
            args.p_hostname === 'links.example.com'
              ? [
                  {
                    platform: 'android',
                    appId: 'org.example.gateway',
                    fingerprints: [Array(32).fill('AA').join(':')],
                    paths: ['/*'],
                  },
                ]
              : null,
          error: null,
        }),
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    const response = await domainWorker.fetch(
      new Request('https://links.example.com/.well-known/assetlinks.json', {
        headers: {
          cookie: 'private=true',
          authorization: 'Bearer private',
          'x-qg-domain-hostname': 'forged.example.com',
        },
      }),
      env,
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as { target: { package_name: string } }[];
    expect(data[0].target.package_name).toBe('org.example.gateway');
    const [url, options] = fetcher.mock.calls[0];
    expect(new URL(String(url)).searchParams.get('hostname')).toBe('links.example.com');
    expect(options?.headers).toEqual({
      Authorization: 'Bearer fixture-public',
      apikey: 'fixture-public',
    });
  });
  it('returns JSON unavailability for an unready host without redirecting to the domain fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
        publicAppAssociation(new Request(input, init), {
          rpc: async () => ({ data: null, error: null }),
        }),
      ),
    );
    const response = await domainWorker.fetch(
      new Request('https://unready.example.com/.well-known/apple-app-site-association'),
      env,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('location')).toBeNull();
  });
});
