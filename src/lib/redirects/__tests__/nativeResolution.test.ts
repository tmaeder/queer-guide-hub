import { describe, it, expect } from 'vitest';
import {
  NATIVE_REDIRECT_MEDIA,
  nativeHandoffRequest,
  nativeHandoffResponse,
  newNativeHandoffToken,
  nativeHandoffDigest,
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

describe('native handoff metadata', () => {
  const app = '10000000-0000-4000-8000-000000000001',
    token = 'qg_handoff_' + 'a'.repeat(64);
  const headers = {
    Accept: NATIVE_REDIRECT_MEDIA,
    'x-qg-attribution-consent': 'granted',
    'x-qg-handoff-action': 'create',
    'x-qg-handoff-app': app,
  };
  const creation = (query = '?qg_handoff=install', extra: Record<string, string> = {}) =>
    new Request(source.href + query, { headers: { ...headers, ...extra } });
  it('requires explicit consent, matching markers and bounded header-only tokens', () => {
    expect(nativeHandoffRequest(creation())).toEqual({ action: 'create', app });
    expect(() =>
      nativeHandoffRequest(creation('?qg_handoff=install&qg_handoff_token=' + token)),
    ).toThrow('Handoff credentials require headers');
    for (const request of [
      creation(''),
      creation('?qg_handoff=resume'),
      creation('?qg_handoff=install&qg_handoff=install'),
      creation(undefined, { 'x-qg-attribution-consent': 'denied' }),
      creation(undefined, { 'x-qg-handoff-token': token }),
      creation(undefined, { 'x-qg-handoff-app': 'bad' }),
      creation(undefined, { 'x-qg-handoff-other': 'unknown' }),
      new Request(source.href + '?qg_handoff=resume', {
        headers: { Accept: NATIVE_REDIRECT_MEDIA },
      }),
    ])
      expect(() => nativeHandoffRequest(request)).toThrow('Invalid native handoff request');
    expect(
      nativeHandoffRequest(
        creation('?qg_handoff=resume', {
          'x-qg-handoff-action': 'resume',
          'x-qg-handoff-token': token,
        }),
      ),
    ).toEqual({ action: 'resume', app, token });
    const forwarded = new Headers();
    forwardNativeHeaders(creation(), forwarded);
    expect(forwarded.get('x-qg-handoff-action')).toBe('create');
    expect(forwarded.get('x-qg-handoff-app')).toBe(app);
    expect(forwarded.has('x-qg-handoff-token')).toBe(false);
  });
  it('generates independent 256-bit capabilities and stores only a different digest', async () => {
    const first = newNativeHandoffToken(),
      second = newNativeHandoffToken();
    expect(first).toMatch(/^qg_handoff_[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
    const hash = await nativeHandoffDigest(first);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe(first.slice('qg_handoff_'.length));
  });
  it('requires valid creation metadata and a consumed acknowledgement from the upstream', async () => {
    const body = {
      ...outcome,
      clickId: app,
      destination: 'https://example.org/content?qg_click_id=' + app,
    };
    const upstream = (extra: HeadersInit = {}) =>
      new Response(JSON.stringify(body), {
        headers: {
          'Content-Type': NATIVE_REDIRECT_MEDIA,
          ...Object.fromEntries(new Headers(extra)),
        },
      });
    expect((await nativeUpstreamResponse(creation(), upstream())).status).toBe(502);
    const receipt = new Headers();
    nativeHandoffResponse(receipt, token, new Date(Date.now() + 60000).toISOString());
    const valid = await nativeUpstreamResponse(creation(), upstream(receipt));
    expect(valid.status).toBe(200);
    expect(valid.headers.get('x-qg-handoff-token')).toBe(token);
    expect(await valid.json()).toEqual(body);
    receipt.set('x-qg-handoff-expires', new Date(Date.now() - 1000).toISOString());
    expect((await nativeUpstreamResponse(creation(), upstream(receipt))).status).toBe(502);
    const resume = creation('?qg_handoff=resume', {
      'x-qg-handoff-action': 'resume',
      'x-qg-handoff-token': token,
    });
    expect((await nativeUpstreamResponse(resume, upstream())).status).toBe(502);
    expect(
      (
        await nativeUpstreamResponse(
          resume,
          upstream({ 'x-qg-handoff-state': 'consumed', 'x-qg-handoff-token': token }),
        )
      ).status,
    ).toBe(502);
    const consumed = await nativeUpstreamResponse(
      resume,
      upstream({ 'x-qg-handoff-state': 'consumed' }),
    );
    expect(consumed.status).toBe(200);
    expect(consumed.headers.get('x-qg-handoff-state')).toBe('consumed');
    expect(consumed.headers.has('x-qg-handoff-token')).toBe(false);
  });
});
