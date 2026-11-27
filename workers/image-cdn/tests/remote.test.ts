import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { decodeSource } from '../src/remote';
import { toR2ImageUrl } from '../../../src/utils/imageHost';

type WorkerEnv = Parameters<typeof worker.fetch>[1];
const SRC = 'https://cdn.shopify.com/s/files/1/a b/ünï.jpg?v=1&w=2';
const png = new Uint8Array(200).fill(7);

function setup(stored: unknown = null) {
  const bucket = { head: vi.fn(async () => stored), get: vi.fn(async () => stored), put: vi.fn() };
  const cache = { match: vi.fn(async () => undefined), put: vi.fn(async () => undefined) };
  vi.stubGlobal('caches', { default: cache });
  const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
  const env = { IMAGES: bucket, ALLOWED_ORIGINS: 'https://queer.guide', THUMB_WIDTH: '400', THUMB_QUALITY: '80' } as unknown as WorkerEnv;
  return { bucket, cache, ctx, env };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('pull-through /r/ route', () => {
  it('decodes exactly the URL the client encoded', () => {
    const r2 = toR2ImageUrl(SRC);
    expect(r2.startsWith('https://img.queer.guide/r/')).toBe(true);
    expect(decodeSource(r2.split('/r/')[1])?.href).toBe(new URL(SRC).href);
  });

  it('fetches a miss once, stores it in R2 and serves it', async () => {
    const { bucket, ctx, env } = setup();
    const fetchMock = vi.fn(async () => new Response(png, { headers: { 'Content-Type': 'image/png' } }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(new Request(toR2ImageUrl(SRC)), env, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Mirror')).toBe('miss');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bucket.put).toHaveBeenCalledWith(expect.stringMatching(/^remote\/[0-9a-f]{64}$/), expect.anything(), expect.anything());
  });

  it('serves a stored copy without touching the source', async () => {
    const stored = { size: 4, httpEtag: '"e"', httpMetadata: { contentType: 'image/webp' }, body: new Blob([png]).stream() };
    const { env, ctx } = setup(stored);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await worker.fetch(new Request(toR2ImageUrl(SRC)), env, ctx);
    expect(res.headers.get('X-Mirror')).toBe('hit');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses non-images and SVG, and negative-caches the miss', async () => {
    for (const ct of ['text/html', 'image/svg+xml']) {
      const { bucket, cache, env, ctx } = setup();
      vi.stubGlobal('fetch', vi.fn(async () => new Response(png, { headers: { 'Content-Type': ct } })));
      const res = await worker.fetch(new Request(toR2ImageUrl(SRC)), env, ctx);
      expect(res.status).toBe(404);
      expect(bucket.put).not.toHaveBeenCalled();
      expect(cache.put).toHaveBeenCalled();
    }
  });

  it('mirrors a real image served with a non-image content type (sniffed)', async () => {
    const { bucket, env, ctx } = setup();
    const jpeg = new Uint8Array(200);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(jpeg, { headers: { 'Content-Type': 'application/octet-stream' } })));
    const res = await worker.fetch(new Request(toR2ImageUrl(SRC)), env, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(bucket.put).toHaveBeenCalled();
  });

  it('refuses private storage URLs and deletes any existing copy', async () => {
    const signed = 'https://xqeacpakadqfxjxjcewc.supabase.co/storage/v1/object/sign/user-photos/a.jpg?token=abc';
    expect(toR2ImageUrl(signed)).toBe(signed); // the client never sends it here
    const { bucket, env, ctx } = setup({ size: 4, httpMetadata: {}, body: new Blob([png]).stream() });
    (bucket as unknown as { delete: unknown }).delete = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const token = btoa(signed).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const res = await worker.fetch(new Request(`https://img.queer.guide/r/${token}`), env, ctx);
    expect(res.status).toBe(404);
    expect((bucket as unknown as { delete: ReturnType<typeof vi.fn> }).delete).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('remembers a gone image for a day but a blocked/rate-limited one for minutes', async () => {
    for (const [status, reason, ttl] of [
      [404, 'upstream-404', 86400],
      [429, 'upstream-429', 900],
      [403, 'upstream-403', 900],
    ] as const) {
      const { env, ctx } = setup();
      vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status })));
      const res = await worker.fetch(new Request(toR2ImageUrl(SRC)), env, ctx);
      expect(res.status).toBe(404);
      expect(res.headers.get('X-Mirror-Reason')).toBe(reason);
      expect(res.headers.get('Cache-Control')).toBe(`public, max-age=${ttl}`);
    }
  });

  it('sends an honest, contactable User-Agent', async () => {
    const { env, ctx } = setup();
    const fetchMock = vi.fn(async (_u: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/^QueerGuideImageMirror\/.*queer\.guide/);
      return new Response(png, { headers: { 'Content-Type': 'image/png' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    await worker.fetch(new Request(toR2ImageUrl(SRC)), env, ctx);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('rejects a source pointing back at img.queer.guide', () => {
    const token = btoa('https://img.queer.guide/r/x').replace(/=+$/, '');
    expect(decodeSource(token)).toBeNull();
  });
});
