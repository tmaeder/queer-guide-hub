import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost, sentrySecurityEndpoint } from './csp-report';

const DSN = 'https://abc123@o42.ingest.de.sentry.io/7';

const run = async (env: Record<string, string>, body = '{"csp-report":{}}') => {
  const pending: Promise<unknown>[] = [];
  const res = await onRequestPost({
    request: new Request('https://queer.guide/api/csp-report', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/csp-report', 'user-agent': 'UA' },
    }),
    env,
    waitUntil: (p: Promise<unknown>) => pending.push(p),
  } as unknown as Parameters<typeof onRequestPost>[0]);
  await Promise.all(pending);
  return res;
};

afterEach(() => vi.unstubAllGlobals());

describe('csp-report forwarder', () => {
  it('derives the Sentry security endpoint from a DSN', () => {
    expect(sentrySecurityEndpoint(DSN)).toBe(
      'https://o42.ingest.de.sentry.io/api/7/security/?sentry_key=abc123',
    );
    expect(sentrySecurityEndpoint(undefined)).toBeNull();
    expect(sentrySecurityEndpoint('not a url')).toBeNull();
    expect(sentrySecurityEndpoint('https://o42.ingest.sentry.io/7')).toBeNull();
    expect(sentrySecurityEndpoint('http://k@o42.ingest.sentry.io/7')).toBeNull();
  });

  it('forwards the report body and content-type to Sentry and answers 204', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await run({ VITE_SENTRY_DSN: DSN });
    expect(res.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://o42.ingest.de.sentry.io/api/7/security/?sentry_key=abc123');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/csp-report');
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"csp-report":{}}');
  });

  it('drops reports (still 204) when no DSN is configured or the body is oversized', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await run({})).status).toBe(204);
    expect((await run({ VITE_SENTRY_DSN: DSN }, 'x'.repeat(70_000))).status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
