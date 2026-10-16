import { describe, it, expect } from 'vitest';
import {
  NATIVE_REDIRECT_MEDIA,
  forwardNativeHeaders,
  nativeProblem,
  nativeRedirectRequested,
  nativeResolution,
  nativeUpstreamResponse,
  parseNativePayload,
} from '../../../../supabase/functions/_shared/redirect-native-resolution';
const source = new URL('https://queer.guide/go/native-proof');
const outcome = {
  protocol: 1,
  canonicalUrl: source.href,
  destination: 'https://example.org/content#section',
  mode: 'navigate',
  statusCode: 302,
  clickId: null,
};
describe('native resolution transport contract', () => {
  it('uses explicit negotiation and defaults attribution to denied', () => {
    const request = new Request(source, { headers: { Accept: NATIVE_REDIRECT_MEDIA } }),
      headers = new Headers();
    expect(nativeRedirectRequested(request)).toBe(true);
    forwardNativeHeaders(request, headers);
    expect(headers.get('Accept')).toBe(NATIVE_REDIRECT_MEDIA);
    expect(headers.get('x-qg-attribution-consent')).toBe('denied');
    expect(
      nativeRedirectRequested(new Request(source, { headers: { Accept: 'application/json' } })),
    ).toBe(false);
  });
  it('respects explicit native media quality values', () => {
    expect(
      nativeRedirectRequested(
        new Request(source, { headers: { Accept: NATIVE_REDIRECT_MEDIA + ';q=1' } }),
      ),
    ).toBe(true);
    expect(
      nativeRedirectRequested(
        new Request(source, { headers: { Accept: NATIVE_REDIRECT_MEDIA + ';q=0' } }),
      ),
    ).toBe(false);
    expect(
      nativeRedirectRequested(
        new Request(source, { headers: { Accept: NATIVE_REDIRECT_MEDIA + ';q=invalid' } }),
      ),
    ).toBe(false);
  });
  it('transfers a protected challenge and bounded retry information without a destination', async () => {
    const request = new Request(source, { headers: { Accept: NATIVE_REDIRECT_MEDIA } });
    const response = await nativeUpstreamResponse(request, nativeProblem(401));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ protocol: 1, error: 'password_required' });
    const retry = nativeProblem(429);
    retry.headers.set('Retry-After', '120');
    expect((await nativeUpstreamResponse(request, retry)).headers.get('Retry-After')).toBe('120');
  });
  it('returns a closed success shape and preserves public destinations with ports', async () => {
    const response = await nativeUpstreamResponse(
      new Request(source),
      nativeResolution(source.href, outcome.destination, 302, 'navigate', null),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(outcome);
    expect(
      parseNativePayload({ ...outcome, destination: 'https://example.org:8443/path' }, 200, source),
    ).toMatchObject({ destination: 'https://example.org:8443/path' });
  });
  it('rejects wrong sources, protocols, untrusted fields and spoofed click IDs', () => {
    for (const value of [
      { ...outcome, protocol: 2 },
      { ...outcome, canonicalUrl: 'https://other.example.org/go/native-proof' },
      { ...outcome, password_hash: 'private' },
      { ...outcome, destination: 'http://127.0.0.1/private' },
      { ...outcome, destination: 'https://example.org/?qg_click_id=forged' },
    ])
      expect(() => parseNativePayload(value, 200, source)).toThrow();
  });
  it('fails closed on redirects, HTML, malformed JSON, oversized data and MIME lookalikes', async () => {
    for (const response of [
      new Response(null, { status: 302, headers: { Location: 'https://example.org' } }),
      new Response('<html/>', { headers: { 'Content-Type': 'text/html' } }),
      new Response('{}', { headers: { 'Content-Type': NATIVE_REDIRECT_MEDIA } }),
      new Response('x'.repeat(65537), { headers: { 'Content-Type': NATIVE_REDIRECT_MEDIA } }),
      new Response(JSON.stringify(outcome), {
        headers: { 'Content-Type': NATIVE_REDIRECT_MEDIA + '-other' },
      }),
    ])
      expect((await nativeUpstreamResponse(new Request(source), response)).status).toBe(502);
  });
  it('keeps HEAD empty and declares allowed methods', async () => {
    expect(
      (
        await nativeUpstreamResponse(
          new Request(source, { method: 'HEAD' }),
          nativeResolution(source.href, outcome.destination, 302, 'navigate', null, true),
        )
      ).body,
    ).toBeNull();
    expect(nativeProblem(405).headers.get('Allow')).toBe('GET, HEAD, POST');
  });
});
