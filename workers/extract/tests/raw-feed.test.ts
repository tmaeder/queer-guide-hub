import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/render', () => ({ renderHtml: vi.fn() }));
import worker from '../src/index';
const env = { INTERNAL_SECRET: 'test-internal-secret' };
const request = (body: Record<string, unknown>, authorized = true) => new Request('https://extract.example/extract', { method: 'POST', headers: { 'content-type': 'application/json', ...(authorized ? { 'x-internal-secret': env.INTERNAL_SECRET } : {}) }, body: JSON.stringify(body) });
afterEach(() => vi.unstubAllGlobals());
describe('internal raw document extraction', () => {
  it('preserves RSS publication dates and enclosures without markdown conversion', async () => {
    const xml = '<?xml version="1.0"?><rss><channel><item><title>Episode</title><pubDate>Tue, 17 Nov 2026 10:00:00 GMT</pubDate><enclosure url="https://audio.example/episode.mp3"/></item></channel></rss>';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(xml, { headers: { 'content-type': 'application/rss+xml' } })));
    const response = await worker.fetch(request({ url: 'https://publisher.example/feed/', raw: true }), env);
    expect(response.status).toBe(200);
    const body = await response.json() as { rawHtml?: string };
    expect(body.rawHtml).toBe(xml);
  });
  it('keeps the existing cleaned-document response for ordinary callers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html><body><main><h1>Publisher</h1><p>Public article content.</p></main></body></html>', { headers: { 'content-type': 'text/html' } })));
    const response = await worker.fetch(request({ url: 'https://publisher.example/article' }), env);
    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty('rawHtml');
  });
  it('requires the existing internal authentication for raw retrieval', async () => {
    expect((await worker.fetch(request({ url: 'https://publisher.example/feed/', raw: true }, false), env)).status).toBe(401);
  });
});
