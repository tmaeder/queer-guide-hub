import { describe, it, expect } from 'vitest';
import { publicDocumentDelivery } from './publicDocumentDelivery';
const response = () =>
  new Response('<p>Public content</p>', {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      Vary: 'Accept',
      'Content-Security-Policy': "default-src 'self'",
    },
  });
describe('public document delivery', () => {
  it('preserves security and cache policy, prevents transforms, and delivers real compressed HTML', async () => {
    const result = publicDocumentDelivery(
      new Request('https://queer.guide/venues', { headers: { 'Accept-Encoding': 'br, gzip' } }),
      '/venues',
      response(),
    );
    expect(result.headers.get('Cache-Control')).toBe('public, max-age=60, no-transform');
    expect(result.headers.get('Vary')).toBe('Accept, Accept-Encoding');
    expect(result.headers.get('Content-Security-Policy')).toBe("default-src 'self'");
    expect(result.headers.get('Content-Encoding')).toBe('gzip');
    expect(
      await new Response(result.body!.pipeThrough(new DecompressionStream('gzip'))).text(),
    ).toBe('<p>Public content</p>');
  });
  it('respects gzip refusal and does not transform protected routes or JSON', () => {
    const request = new Request('https://queer.guide/', {
      headers: { 'Accept-Encoding': 'gzip;q=0, *;q=1' },
    });
    expect(publicDocumentDelivery(request, '/', response()).headers.has('Content-Encoding')).toBe(
      false,
    );
    const spaced = new Request('https://queer.guide/', {
      headers: { 'Accept-Encoding': 'gzip ; q=0, *;q=1' },
    });
    expect(publicDocumentDelivery(spaced, '/', response()).headers.has('Content-Encoding')).toBe(
      false,
    );
    for (const route of ['/admin', '/login', '/api/private', '/venues/somewhere']) {
      const original = response();
      expect(publicDocumentDelivery(request, route, original)).toBe(original);
    }
    const json = Response.json({ ok: true });
    expect(publicDocumentDelivery(request, '/', json)).toBe(json);
  });
  it('keeps HEAD bodyless and never recompresses an encoded body', async () => {
    const head = publicDocumentDelivery(
      new Request('https://queer.guide/about', { method: 'HEAD' }),
      '/about',
      response(),
    );
    expect(head.body).toBe(null);
    const encoded = response();
    encoded.headers.set('Content-Encoding', 'br');
    const result = publicDocumentDelivery(
      new Request('https://queer.guide/', { headers: { 'Accept-Encoding': 'gzip' } }),
      '/',
      encoded,
    );
    expect(result.headers.get('Content-Encoding')).toBe('br');
    expect(await result.text()).toBe('<p>Public content</p>');
  });
});
