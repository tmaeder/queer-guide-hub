import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const metadata = { size: bytes.length, etag: 'fixture', httpEtag: '"fixture"', httpMetadata: { contentType: 'image/jpeg' } };
type Metadata = typeof metadata;
type StoredObject = Metadata & { body: ReadableStream<Uint8Array> };
type WorkerEnv = Parameters<typeof worker.fetch>[1];
// Minimal platform fakes: these paths use only R2 head/get and waitUntil.
const context = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as ExecutionContext;
function fixture() {
  const bucket = {
    head: vi.fn<() => Promise<Metadata | null>>(async () => metadata),
    get: vi.fn<() => Promise<StoredObject | null>>(async () => ({ ...metadata, body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }) })),
    put: vi.fn(),
  };
  const env = { IMAGES: bucket, ALLOWED_ORIGINS: 'https://queer.guide', THUMB_WIDTH: '400', THUMB_QUALITY: '80' } as WorkerEnv;
  const request = (method: string, path = 'event-images/fixture.jpg') => new Request(`https://img.queer.guide/${path}`, { method, headers: { Origin: 'https://queer.guide' } });
  return { bucket, env, request };
}
afterEach(() => vi.restoreAllMocks());

describe('image CDN HEAD requests', () => {
  it('returns GET image metadata without opening or transferring the object body', async () => {
    const { bucket, env, request } = fixture();
    const head = await worker.fetch(request('HEAD'), env, context);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect(bucket.head).toHaveBeenCalledWith('event-images/fixture.jpg');
    expect(bucket.get).not.toHaveBeenCalled();
    expect(head.headers.get('Content-Length')).toBe('4');
    expect(head.headers.get('Content-Type')).toBe('image/jpeg');
    expect(head.headers.get('ETag')).toBe('"fixture"');
    expect(head.headers.get('Access-Control-Allow-Methods')).toContain('HEAD');
    const get = await worker.fetch(request('GET'), env, context);
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(bytes);
    for (const name of ['Content-Length', 'Content-Type', 'Cache-Control', 'ETag', 'Access-Control-Allow-Origin']) {
      expect(head.headers.get(name)).toBe(get.headers.get(name));
    }
  });

  it('returns a bodyless 404 for a missing image instead of a false method failure', async () => {
    const { bucket, env, request } = fixture();
    bucket.head.mockResolvedValue(null);
    const response = await worker.fetch(request('HEAD'), env, context);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
    expect(bucket.get).not.toHaveBeenCalled();
  });

  it('uses cached thumbnail metadata without regenerating or fetching an image', async () => {
    const { bucket, env, request } = fixture();
    const network = vi.spyOn(globalThis, 'fetch');
    const response = await worker.fetch(request('HEAD', 'thumb/event-images/fixture.jpg'), env, context);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(response.headers.get('X-Thumb')).toBe('cached');
    expect(bucket.head).toHaveBeenCalledWith('thumb/event-images/fixture.jpg');
    expect(bucket.get).not.toHaveBeenCalled();
    expect(bucket.put).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it('strips the uncached SVG thumbnail body while retaining GET metadata', async () => {
    const { bucket, env, request } = fixture();
    const cancelled = vi.fn();
    bucket.head.mockResolvedValue(null);
    bucket.get.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...metadata,
      httpMetadata: { contentType: 'image/svg+xml' }, body: new ReadableStream({ cancel: cancelled }),
    });
    const response = await worker.fetch(request('HEAD', 'thumb/fixture.svg'), env, context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(await response.text()).toBe('');
    expect(cancelled).toHaveBeenCalledOnce();
    expect(bucket.put).not.toHaveBeenCalled();
  });

  it('keeps upload authentication and unsupported methods intact', async () => {
    const { bucket, env, request } = fixture();
    expect((await worker.fetch(request('PUT', 'upload/fixture.jpg'), env, context)).status).toBe(401);
    expect((await worker.fetch(request('DELETE'), env, context)).status).toBe(405);
    expect(bucket.head).not.toHaveBeenCalled();
    expect(bucket.get).not.toHaveBeenCalled();
  });
});
