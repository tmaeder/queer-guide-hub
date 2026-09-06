import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The branding lookup must never hold up a page.
 *
 * Written after a live incident (2026-09-05): Postgres was refusing connections,
 * PostgREST held the socket open, and because this fetch carried no signal it
 * inherited the platform subrequest timeout. Every HTML document — apex and
 * pages.dev alike — served at a 19.5s TTFB while static assets stayed at 63ms.
 * Branding is decoration with a documented fail-open to the stock site, so the
 * failure mode should have been "stock site, instantly".
 *
 * These assert the two properties that were missing, not the constants: a slow
 * upstream is abandoned, and a failure is cached so the cost is paid once per
 * window rather than once per request.
 */

const ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
} as unknown as Parameters<
  Awaited<ReturnType<typeof importBranding>>['getBranding']
>[0];

async function importBranding() {
  // Module-level memo: each test needs its own instance.
  vi.resetModules();
  return await import('./branding');
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('getBranding resilience', () => {
  it('gives up on a hanging upstream instead of waiting for the platform timeout', async () => {
    // A fetch that never settles on its own — only the abort signal can end it.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted.', 'TimeoutError')),
            );
          }),
      ),
    );

    const { getBranding } = await importBranding();
    const pending = getBranding(ENV);

    // Nothing resolves until the timeout fires; advancing past it must settle.
    await vi.advanceTimersByTimeAsync(1_500);

    await expect(pending).resolves.toBeNull();
  });

  it('caches a failure, so a dead backend costs one fetch per window, not one per request', async () => {
    const fetchMock = vi.fn(async () => new Response('boom', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    const { getBranding } = await importBranding();

    expect(await getBranding(ENV)).toBeNull();
    expect(await getBranding(ENV)).toBeNull();
    expect(await getBranding(ENV)).toBeNull();

    // Without negative caching this would be 3 — which is exactly how a 19.5s
    // upstream became 19.5s on every page view rather than once a minute.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still serves a successful doc from cache', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify([{ published: { meta: { site_name: 'X' } }, overrides_enabled: true }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { getBranding } = await importBranding();

    const first = await getBranding(ENV);
    const second = await getBranding(ENV);

    expect(first).toEqual({ meta: { site_name: 'X' } });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
