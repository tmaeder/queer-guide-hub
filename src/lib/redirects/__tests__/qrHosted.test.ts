import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { initWasm } from '@resvg/resvg-wasm';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { qrImageResponse as handleImageResponse } from '../../../../workers/redirect-qr/handler';
import { parseQrImageRequest } from '../../../../workers/redirect-qr/request';
import { validateLogoBytes } from '../../../../workers/redirect-qr/render';
const initialize = vi.fn(async () => {});
const env = {
  SUPABASE_URL: 'https://fixture.supabase.co',
  QR_RATE_LIMITER: {
    limit: vi.fn<(options: { key: string }) => Promise<{ success: boolean }>>(async () => ({
      success: true,
    })),
  },
};
const qrImageResponse = (
  request: Request,
  environment: typeof env,
  initialize: () => Promise<void>,
  fetcher?: typeof fetch,
) =>
  handleImageResponse(
    request,
    environment.SUPABASE_URL,
    async (key) => (await environment.QR_RATE_LIMITER.limit({ key })).success,
    initialize,
    fetcher,
  );
const target = 'https://links.community.com/?utm_source=poster#details';
const imageUrl = (parameters: Record<string, string> = {}) =>
  'https://queer.guide/api/qr?' + new URLSearchParams({ url: target, tracked: '1', ...parameters });
beforeAll(async () => {
  await initWasm(await readFile('node_modules/@resvg/resvg-wasm/index_bg.wasm'));
});
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  env.QR_RATE_LIMITER.limit.mockResolvedValue({ success: true });
  initialize.mockClear();
});
afterEach(() => vi.unstubAllGlobals());
async function decode(bytes: Uint8Array) {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data;
}
describe('hosted QR rendering HTTP', () => {
  it.each(['png', 'jpg', 'svg'])(
    'returns scan-verified %s with tracked branded roots and safe headers',
    async (format) => {
      const response = await qrImageResponse(
        new Request(
          imageUrl({ format, size: '512', dots: 'joined', border: 'rounded', center: 'circle' }),
        ),
        env,
        initialize,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(response.headers.get('access-control-expose-headers')).toContain('X-QG-QR-Verified');
      expect(response.headers.get('x-qg-qr-verified')).toBe('1');
      expect(response.headers.get('content-type')).toBe(
        'image/' + (format === 'svg' ? 'svg+xml' : format === 'jpg' ? 'jpeg' : 'png'),
      );
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(await decode(bytes)).toBe(
        'https://links.community.com/?utm_source=poster&qg_qr=1#details',
      );
      expect(Number(response.headers.get('content-length'))).toBe(bytes.length);
    },
  );
  it.each(
    ['square', 'circle', 'joined'].flatMap((dots) =>
      ['square', 'rounded', 'circle'].flatMap((border) =>
        ['square', 'circle'].map((center) => ({ dots, border, center })),
      ),
    ),
  )(
    'scan-verifies $dots/$border/$center with the Wasm rasterizer',
    async ({ dots, border, center }) => {
      const response = await qrImageResponse(
        new Request(imageUrl({ dots, border, center })),
        env,
        initialize,
      );
      expect(response.status).toBe(200);
      expect(await decode(new Uint8Array(await response.arrayBuffer()))).toBe(
        'https://links.community.com/?utm_source=poster&qg_qr=1#details',
      );
    },
  );
  it('encodes external URLs without following or tracking them', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await parseQrImageRequest(
      new Request(imageUrl({ url: 'https://example.com/path?q=1', tracked: '0' })),
      env.SUPABASE_URL,
      fetcher,
    );
    expect(result.url).toBe('https://example.com/path?q=1');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([256, 512, 1024])(
    'supports size %s and inline PNG/JPG artwork for POST generation',
    async (size) => {
      for (const format of ['png', 'jpeg'] as const) {
        const logo = await sharp({
          create: { width: 64, height: 64, channels: 3, background: '#652895' },
        })
          [format]()
          .toBuffer();
        const response = await qrImageResponse(
          new Request('https://queer.guide/api/qr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: target,
              tracked: '1',
              size: String(size),
              format: 'png',
              logo: 'data:image/' + format + ';base64,' + logo.toString('base64'),
            }),
          }),
          env,
          initialize,
        );
        expect(response.status).toBe(200);
        expect(await decode(new Uint8Array(await response.arrayBuffer()))).toBe(
          'https://links.community.com/?utm_source=poster&qg_qr=1#details',
        );
      }
    },
  );
  it('loads only exact public bucket keys and verifies digest/type/bytes before embedding', async () => {
    const logo = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#006655' },
    })
      .png()
      .toBuffer();
    const hash = Buffer.from(await webcrypto.subtle.digest('SHA-256', logo)).toString('hex');
    const key = '00000000-0000-4000-8000-000000000001.png';
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(logo, { headers: { 'Content-Type': 'image/png' } }),
    );
    const response = await qrImageResponse(
      new Request(imageUrl({ logo: key, logoHash: hash, format: 'svg' })),
      env,
      initialize,
      fetcher,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('data:image/png;base64,' + logo.toString('base64'));
    expect(fetcher).toHaveBeenCalledWith(
      env.SUPABASE_URL + '/storage/v1/object/public/redirect-brand-assets/' + key,
      expect.objectContaining({ redirect: 'manual', credentials: 'omit', cache: 'no-store' }),
    );
    for (const change of [
      { logo: 'https://evil.example/x.png' },
      { logo: '../private.png' },
      { logoHash: 'a'.repeat(64) },
    ]) {
      const invalid = await qrImageResponse(
        new Request(imageUrl({ logo: key, logoHash: hash, ...change })),
        env,
        initialize,
        fetcher,
      );
      expect(invalid.status).toBeGreaterThanOrEqual(400);
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const status of [301, 302, 307, 308]) {
      const redirected = vi.fn<typeof fetch>(
        async () =>
          new Response(null, {
            status,
            headers: { Location: 'https://other.example/logo.png' },
          }),
      );
      const rejected = await qrImageResponse(
        new Request(imageUrl({ logo: key, logoHash: hash })),
        env,
        initialize,
        redirected,
      );
      expect(rejected.status).toBe(422);
      expect(redirected).toHaveBeenCalledOnce();
      expect(redirected).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ redirect: 'manual' }),
      );
    }
  });
  it('rejects unknown/duplicate parameters, credentials, unsafe schemes, invalid colors and excess bodies before Wasm initialization', async () => {
    for (const url of [
      imageUrl({ size: '4096' }),
      imageUrl({ foreground: '#ffffff' }),
      imageUrl({ url: 'javascript:alert(1)' }),
      imageUrl({ url: 'https://user:secret@example.com/' }),
      imageUrl({ url: 'https://example.com/' + 'a'.repeat(2100) }),
      imageUrl({ unknown: 'x' }),
      imageUrl() + '&size=512&size=1024',
    ]) {
      expect((await qrImageResponse(new Request(url), env, initialize)).status).toBe(400);
    }
    const huge = await qrImageResponse(
      new Request('https://queer.guide/api/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: ' '.repeat(2100001),
      }),
      env,
      initialize,
    );
    expect(huge.status).toBe(413);
    expect(initialize).not.toHaveBeenCalled();
    const png = await sharp({
      create: { width: 1025, height: 1, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    await expect(validateLogoBytes(png)).rejects.toThrow('1024px');
    await expect(validateLogoBytes(new Uint8Array([1, 2, 3]))).rejects.toThrow('valid PNG');
  });
  it('rejects truncated rasters and excessive QR payload density without silent logo fallback', async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: 'white' } })
      .png()
      .toBuffer();
    await expect(validateLogoBytes(png.subarray(0, 34))).rejects.toThrow('decoded');
    const response = await qrImageResponse(
      new Request(imageUrl({ url: 'https://example.com/' + 'x'.repeat(1900), size: '256' })),
      env,
      initialize,
    );
    expect(response.status).toBe(422);
  });
  it('enforces request limits, supports OPTIONS/HEAD and sanitizes unexpected failures', async () => {
    env.QR_RATE_LIMITER.limit.mockResolvedValueOnce({ success: false });
    const denied = await qrImageResponse(
      new Request(imageUrl(), { headers: { 'cf-connecting-ip': '192.0.2.1' } }),
      env,
      initialize,
    );
    expect(denied.status).toBe(429);
    expect(denied.headers.get('retry-after')).toBe('60');
    expect(env.QR_RATE_LIMITER.limit).toHaveBeenLastCalledWith({ key: '192.0.2.1' });
    expect(
      (await qrImageResponse(new Request(imageUrl(), { method: 'OPTIONS' }), env, initialize))
        .status,
    ).toBe(204);
    const head = await qrImageResponse(
      new Request(imageUrl(), { method: 'HEAD' }),
      env,
      initialize,
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    const failure = await qrImageResponse(new Request(imageUrl()), env, async () => {
      throw new Error('secret key');
    });
    expect(failure.status).toBe(503);
    expect(await failure.text()).not.toContain('secret');
    expect(
      (await qrImageResponse(new Request('https://queer.guide/wrong'), env, initialize)).status,
    ).toBe(404);
  });
});
