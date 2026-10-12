import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../supabase/functions/_shared/sentry.ts', () => ({
  captureError: vi.fn(),
  initSentry: vi.fn(),
}));
import {
  reportApiError,
  withErrorReporting,
} from '../../supabase/functions/_shared/report-api-error.ts';
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Deno', {
    env: {
      get: (key: string) =>
        ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-only' })[
          key
        ],
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
describe('automatic feedback delivery', () => {
  it('files without the optional ingest secret and groups repeated failures', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('"id"'));
    vi.stubGlobal('fetch', fetch);
    await reportApiError('source-test', new Error('upstream 429'));
    await reportApiError('source-test', new Error('upstream 429'));
    const first = JSON.parse(fetch.mock.calls[0][1].body);
    const second = JSON.parse(fetch.mock.calls[1][1].body);
    expect(fetch.mock.calls[0][0]).toBe('https://example.supabase.co/rest/v1/rpc/upsert_api_error');
    expect(first.p_fingerprint).toBe(second.p_fingerprint);
    expect(first.p_data.title).toBe('[error] source-test');
    expect(first.p_data).not.toHaveProperty('SUPABASE_SERVICE_ROLE_KEY');
  });
  it('waits for delivery before returning a failed response', async () => {
    let release!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      ),
    );
    let finished = false;
    const result = withErrorReporting(
      'test',
      async () => new Response('invalid currency', { status: 422 }),
    )(new Request('https://example.com/sync')).then((r) => {
      finished = true;
      return r;
    });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect(finished).toBe(false);
    release(new Response('"id"'));
    expect((await result).status).toBe(422);
  });
  it('preserves caller behavior when the feedback service is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const response = await withErrorReporting(
      'test',
      async () => new Response('failed', { status: 500 }),
    )(new Request('https://example.com/sync'));
    expect(response.status).toBe(500);
  });
  it('reports thrown exceptions and rethrows the original', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('"id"'));
    vi.stubGlobal('fetch', fetch);
    const error = new Error('crash');
    await expect(
      withErrorReporting('test', async () => {
        throw error;
      })(new Request('https://example.com/sync')),
    ).rejects.toBe(error);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([200, 401, 403])(
    'does not file successful or rejected-auth responses (%s)',
    async (status) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      await withErrorReporting(
        'test',
        async () => new Response('', { status }),
      )(new Request('https://example.com/sync'));
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
