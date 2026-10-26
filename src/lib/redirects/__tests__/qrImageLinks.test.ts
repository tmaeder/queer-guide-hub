import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { initWasm } from '@resvg/resvg-wasm';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  createQrImageToken,
  qrImageLinkInput,
  qrImageRevokeInput,
  qrImageUrls,
  publicQrImageRequest,
} from '../../../../supabase/functions/_shared/redirect-qr-images';
import { readQrImageProfile } from '../../../../workers/redirect-qr/profile';
import { qrImageResponse } from '../../../../workers/redirect-qr/handler';
import { DEFAULT_QR_STYLE } from '../qrRender';
const id = '00000000-0000-4000-8000-000000000001',
  token = 'qg_qr_' + 'a'.repeat(64),
  origin = 'https://fixture.supabase.co';
const profile = () => ({
  url: 'https://links.community.com/',
  tracked: true,
  style: { ...DEFAULT_QR_STYLE, dots: 'joined' },
  effectiveLogo: null,
  logoSource: 'hidden',
});
beforeAll(async () => {
  await initWasm(await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'));
});
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
describe('image capability authoring and public profile API', () => {
  it('creates independent 256-bit opaque URL capabilities without private identity or URL payloads', () => {
    const first = createQrImageToken(),
      second = createQrImageToken();
    expect(first).toMatch(/^qg_qr_[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
    const urls = qrImageUrls(first);
    for (const format of ['png', 'jpg', 'svg'] as const) {
      const url = new URL(urls[format]);
      expect(url.origin + url.pathname).toBe('https://queer.guide/api/qr');
      expect(url.searchParams.get('share')).toBe(first);
      expect(url.searchParams.get('format')).toBe(format);
    }
    expect(() => qrImageUrls('qg_redirect_' + 'a'.repeat(64))).toThrow();
  });
  it('validates explicit publication input, expiry, branding and versioned revocation', () => {
    expect(
      qrImageLinkInput({
        linkId: id,
        style: { dots: 'circle' },
        logoMode: 'none',
        label: ' Print ',
        expiresAt: null,
      }),
    ).toEqual({
      linkId: id,
      style: { dots: 'circle' },
      logoMode: 'none',
      label: 'Print',
      expiresAt: null,
    });
    expect(qrImageLinkInput({ url: 'https://EXAMPLE.com' })).toEqual({
      url: 'https://example.com/',
    });
    expect(qrImageRevokeInput({ version: id })).toEqual({ version: id });
    for (const value of [
      {},
      { linkId: id, url: 'https://example.com/' },
      { linkId: 'bad' },
      { url: 'javascript:alert(1)' },
      { url: 'https://user:secret@example.com/' },
      { url: 'https://example.com/ ' + id },
      { linkId: id, style: { unknown: null } },
      { linkId: id, logoMode: 'custom' },
      { linkId: id, expiresAt: '2000-01-01' },
      { linkId: id, expiresAt: '2099-01-01' },
      { linkId: id, label: '' },
      { linkId: id, image: 'arbitrary' },
    ])
      expect(() => qrImageLinkInput(value)).toThrow();
    for (const value of [{ version: 'bad' }, { version: id, extra: true }, {}, null])
      expect(() => qrImageRevokeInput(value)).toThrow();
  });
  it('validates installation purpose and normalizes only public entry query fields', () => {
    expect(
      qrImageLinkInput({
        linkId: id,
        purpose: 'install',
        entryQuery: 'utm_source=poster%20one&ref=a%2Bb',
      }),
    ).toEqual({ linkId: id, purpose: 'install', entryQuery: 'utm_source=poster+one&ref=a%2Bb' });
    for (const value of [
      { url: 'https://example.com', purpose: 'install' },
      { linkId: id, purpose: null },
      { linkId: id, purpose: 'resume' },
      { linkId: id, purpose: 'visit', entryQuery: 'utm_source=poster' },
      { linkId: id, purpose: 'install', entryQuery: '%70assword=private' },
      { linkId: id, purpose: 'install', entryQuery: 'qg_handoff_token=private' },
      { linkId: id, purpose: 'install', entryQuery: 'QG_CLICK_ID=private' },
      { linkId: id, purpose: 'install', entryQuery: Array(33).fill('utm_source=x').join('&') },
    ])
      expect(() => qrImageLinkInput(value)).toThrow();
  });
  it('hashes the bearer for the service-only lookup, emits fixed public asset metadata and closes missing grants', async () => {
    const db = { rpc: vi.fn(async () => ({ data: profile(), error: null })) };
    const req = new Request(origin + '/functions/v1/redirect-api/public-qr-image', {
      headers: { Authorization: 'Bearer ' + token },
    });
    const response = await publicQrImageRequest(req, db, origin);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(await response.json()).toEqual(profile());
    const hash = Buffer.from(
      await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
    ).toString('hex');
    expect(db.rpc).toHaveBeenLastCalledWith('redirect_public_qr_image', { p_hash: hash });
    expect((await publicQrImageRequest(new Request(origin), db, origin)).status).toBe(404);
    expect(db.rpc).toHaveBeenCalledOnce();
    db.rpc.mockResolvedValueOnce({
      data: null as unknown as ReturnType<typeof profile>,
      error: null,
    });
    expect((await publicQrImageRequest(req, db, origin)).status).toBe(404);
  });
  it('sanitizes internal failures and rejects public query/method misuse', async () => {
    const db = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: 'XX000', message: 'secret credentials' },
      })),
    };
    const req = new Request(origin, { headers: { Authorization: 'Bearer ' + token } });
    const failed = await publicQrImageRequest(req, db, origin);
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain('secret');
    expect(
      (
        await publicQrImageRequest(
          new Request(origin + '?url=https://evil.example', {
            headers: { Authorization: 'Bearer ' + token },
          }),
          db,
          origin,
        )
      ).status,
    ).toBe(400);
    expect(
      (await publicQrImageRequest(new Request(origin, { method: 'POST' }), db, origin)).status,
    ).toBe(400);
    expect(db.rpc).toHaveBeenCalledOnce();
  });
});
describe('Worker live profile transport and rendering', () => {
  it('uses only the fixed API endpoint with bearer/publishable key and bounded no-store transport', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(profile()));
    const result = await readQrImageProfile(
      token,
      origin,
      'fixture-anon',
      new AbortController().signal,
      fetcher,
    );
    expect(result).toMatchObject({
      url: 'https://links.community.com/',
      tracked: '1',
      dots: 'joined',
    });
    expect(fetcher).toHaveBeenCalledWith(
      origin + '/functions/v1/redirect-api/public-qr-image',
      expect.objectContaining({
        headers: { Authorization: 'Bearer ' + token, apikey: 'fixture-anon' },
        credentials: 'omit',
        redirect: 'manual',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      }),
    );
    for (const [bearer, base, key] of [
      ['bad', origin, 'key'],
      [token, 'https://evil.example', 'key'],
      [token, origin, ''],
    ])
      await expect(
        readQrImageProfile(bearer, base, key, new AbortController().signal, fetcher),
      ).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('rejects oversized/malformed/private/unsafe asset profiles and preserves revocation/branding failure statuses', async () => {
    for (const body of [
      { ...profile(), target: 'private' },
      { ...profile(), style: { ...DEFAULT_QR_STYLE, logo: 'https://evil.example' } },
      {
        ...profile(),
        effectiveLogo: {
          id,
          key: id + '.png',
          url: 'https://evil.example',
          mime: 'image/png',
          bytes: 10,
          width: 64,
          height: 64,
          sha256: 'a'.repeat(64),
        },
      },
    ])
      await expect(
        readQrImageProfile(token, origin, 'key', new AbortController().signal, async () =>
          Response.json(body),
        ),
      ).rejects.toMatchObject({ status: 503 });
    await expect(
      readQrImageProfile(
        token,
        origin,
        'key',
        new AbortController().signal,
        async () =>
          new Response('x'.repeat(16385), { headers: { 'Content-Type': 'application/json' } }),
      ),
    ).rejects.toMatchObject({ status: 503 });
    for (const status of [301, 302, 307, 308]) {
      const redirected = vi.fn<typeof fetch>(
        async () =>
          new Response(null, { status, headers: { Location: 'https://other.example/profile' } }),
      );
      await expect(
        readQrImageProfile(token, origin, 'key', new AbortController().signal, redirected),
      ).rejects.toMatchObject({ status: 503 });
      expect(redirected).toHaveBeenCalledOnce();
      expect(redirected).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ redirect: 'manual' }),
      );
    }
    for (const status of [404, 422])
      await expect(
        readQrImageProfile(
          token,
          origin,
          'key',
          new AbortController().signal,
          async () => new Response(null, { status }),
        ),
      ).rejects.toMatchObject({ status });
  });
  it('renders current inherited appearance and cannot override a shared URL or logo through query parameters', async () => {
    const resolver = vi.fn(async () => ({
      url: 'https://links.community.com/',
      tracked: '1',
      ...DEFAULT_QR_STYLE,
      dots: 'joined',
    }));
    const render = (query: Record<string, string>) =>
      qrImageResponse(
        new Request('https://queer.guide/api/qr?' + new URLSearchParams(query)),
        origin,
        async () => true,
        async () => {},
        fetch,
        resolver,
      );
    const response = await render({ share: token, format: 'svg', size: '512' });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('width="512"');
    expect(resolver).toHaveBeenCalledWith(token, expect.any(AbortSignal));
    for (const extra of [
      { url: 'https://evil.example' },
      { dots: 'circle' },
      { logo: id + '.png' },
      { tracked: '0' },
      { size: '4096' },
    ] as Array<Record<string, string>>)
      expect((await render({ share: token, ...extra })).status).toBe(400);
    expect(resolver).toHaveBeenCalledOnce();
    const absent = await qrImageResponse(
      new Request('https://queer.guide/api/qr?share=' + token),
      origin,
      async () => true,
      async () => {},
    );
    expect(absent.status).toBe(503);
  });
});
