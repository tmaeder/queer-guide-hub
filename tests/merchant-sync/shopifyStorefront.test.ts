import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  storefrontPage,
  publicThemeToken,
  publicStorefrontCredentials,
} from '../../supabase/functions/_shared/shopify-storefront.ts';

afterEach(() => vi.unstubAllGlobals());
const response = {
  data: {
    products: { pageInfo: { hasNextPage: true, endCursor: 'next' }, nodes: [{ handle: 'sample' }] },
  },
};
describe('Shopify public Storefront pages', () => {
  it('uses tokenless fields and pins the currency market, preserving pagination', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response)));
    vi.stubGlobal('fetch', fetch);
    const page = await storefrontPage('example.com', null, 'GB', 'previous');
    expect(page.hasNext).toBe(true);
    expect(page.endCursor).toBe('next');
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toContain('/api/2026-10/graphql.json');
    expect(init.headers).not.toHaveProperty('X-Shopify-Storefront-Access-Token');
    const body = JSON.parse(init.body);
    expect(body.query).not.toContain('productType tags');
    expect(body.variables).toEqual({ n: 50, c: 'previous', country: 'GB' });
  });
  it('preserves the GraphQL POST body across regional redirects', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://eu.example.com/api/2026-10/graphql.json' },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(response)));
    vi.stubGlobal('fetch', fetch);
    await storefrontPage('example.com', null, 'DE', null);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1][0])).toContain('eu.example.com');
    expect(fetch.mock.calls[1][1].method).toBe('POST');
    expect(JSON.parse(fetch.mock.calls[1][1].body).variables.country).toBe('DE');
  });
  it('rejects redirects to private hosts', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }),
        ),
    );
    await expect(storefrontPage('example.com', null, 'US', null)).rejects.toThrow();
  });
  it('preserves token-based access to product tags', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response)));
    vi.stubGlobal('fetch', fetch);
    await storefrontPage('example.com', 'public-token', 'US', null);
    const init = fetch.mock.calls[0][1];
    expect(init.headers['X-Shopify-Storefront-Access-Token']).toBe('public-token');
    expect(JSON.parse(init.body).query).toContain('productType tags');
  });
  it.each([429, 500])('does not treat HTTP %s as an empty catalog', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('upstream unavailable', { status })),
    );
    await expect(storefrontPage('example.com', null, 'US', 'cursor')).rejects.toThrow(
      `storefront ${status}`,
    );
  });
  it('rejects GraphQL errors even with HTTP 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ errors: [{ message: 'Access denied' }] })),
        ),
    );
    await expect(storefrontPage('example.com', null, 'US', null)).rejects.toThrow(
      'storefront graphql',
    );
  });
  it('rejects private destinations before fetching', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(storefrontPage('127.0.0.1', null, 'US', null)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('public Shopify theme credentials', () => {
  it('reads only the published Shopify features token', () => {
    const token = '0123456789abcdef0123456789abcdef';
    expect(
      publicThemeToken(
        `<script id="shopify-features" type="application/json">{"accessToken":"${token}"}</script>`,
      ),
    ).toBe(token);
    expect(publicThemeToken('<script>{"accessToken":"private"}</script>')).toBeNull();
    expect(publicThemeToken('<script id="shopify-features">invalid</script>')).toBeNull();
  });
  it('keeps the canonical storefront domain after a public homepage redirect', async () => {
    const token = '0123456789abcdef0123456789abcdef';
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: 'https://www.example.com/' } }),
      )
      .mockResolvedValueOnce(
        new Response(`<script id="shopify-features">{"accessToken":"${token}"}</script>`),
      );
    vi.stubGlobal('fetch', fetch);
    expect(await publicStorefrontCredentials('example.com')).toEqual({
      token,
      domain: 'www.example.com',
    });
  });
  it('rejects private redirect destinations before any follow-up request', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(publicStorefrontCredentials('example.com')).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
