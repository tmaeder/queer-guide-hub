import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error — .mjs script library has no type declarations
import { fetchRemoteVersions } from '../../../scripts/lib/remote-migrations.mjs';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('remote migration history transport', () => {
  it('recovers from a transient connection timeout without losing history', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('Connection timeout', { status: 544 }))
      .mockResolvedValueOnce(Response.json([{ version: '99991791810018' }]));
    vi.stubGlobal('fetch', fetch);
    const result = fetchRemoteVersions('test-token');
    await vi.runAllTimersAsync();
    expect(await result).toEqual(new Set(['99991791810018']));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('fails after three transient failures', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockImplementation(async () => new Response('Unavailable', { status: 544 }));
    vi.stubGlobal('fetch', fetch);
    const assertion = expect(fetchRemoteVersions('test-token')).rejects.toThrow('544');
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry invalid credentials', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchRemoteVersions('test-token')).rejects.toThrow('401');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects an unexpected success payload instead of treating history as empty', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ message: 'unexpected' }));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchRemoteVersions('test-token')).rejects.toThrow(
      'Unrecognized Management API response shape',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
