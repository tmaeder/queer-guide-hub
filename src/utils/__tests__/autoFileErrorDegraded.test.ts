/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://queer.guide/community/feed" }
 */

/**
 * The `degraded` kind, exercised against the REAL `fileError` rather than a mock.
 *
 * `realtimeSubscribe.test.ts` mocks `fileError` and so proves only that the call
 * is made with the right arguments. This file proves the other half: that
 * `fileError` accepts the new kind, reaches the RPC, titles the row so an admin
 * can tell a contained degradation from a crash, and — the part that actually
 * bounds cost — files ONE network call per fingerprint per tab, so a visitor
 * whose WebSocket is permanently broken cannot mint a row per navigation.
 *
 * The jsdom URL is a real production origin on purpose: `fileError` no-ops on
 * localhost, so a default jsdom URL would make every assertion here vacuous.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const rpc = vi.fn((..._args: unknown[]) => Promise.resolve({ data: null, error: null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
}));
vi.mock('@/utils/feedbackContext', () => ({ captureContext: () => ({}) }));

import { fileError } from '../autoFileError';

type RpcArgs = { p_fingerprint: string; p_data: Record<string, unknown>; p_source: string };

function lastCall(): RpcArgs {
  const calls = rpc.mock.calls as unknown as [string, RpcArgs][];
  return calls[calls.length - 1][1];
}

describe("fileError kind 'degraded'", () => {
  beforeEach(() => {
    rpc.mockClear();
    sessionStorage.clear();
    // `fileError` deliberately no-ops in DEV so local work never pollutes the
    // board; vitest runs with DEV=true, so without this every test below passes
    // by doing nothing.
    vi.stubEnv('DEV', false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Control: proves the harness (origin, UA, DEV stub, mocks) actually lets a
  // call through, so a later `toHaveBeenCalledTimes(1)` means the throttle held
  // rather than the whole path being skipped.
  it('reaches the upsert_api_error RPC at all', () => {
    fileError({
      kind: 'degraded',
      error: { name: 'RealtimeDegraded', message: 'useCommunityPosts (subscribe-failed): boom' },
      routePath: '/community/feed',
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect((rpc.mock.calls as unknown as [string][])[0][0]).toBe('upsert_api_error');
  });

  it('titles the row as a degradation, not a crash', () => {
    fileError({
      kind: 'degraded',
      error: { name: 'RealtimeDegraded', message: 'useCommunityPosts (subscribe-failed): boom' },
      routePath: '/community/feed',
    });

    const args = lastCall();
    // An admin scanning the board must be able to tell "the Feed lost live
    // updates" from "the Feed died", which is the whole point of a new kind.
    expect(args.p_data.title).toBe('[degraded] RealtimeDegraded @ /community/feed');
    expect(args.p_data.kind).toBe('degraded');
    expect(args.p_fingerprint.startsWith('degraded:')).toBe(true);
    expect(args.p_source).toBe('degraded');
  });

  // THE VOLUME BOUND. Without this, a visitor whose environment can never
  // construct a WebSocket files a row on every navigation into a realtime route.
  it('files once per fingerprint per tab, however many times it fires', () => {
    for (let i = 0; i < 25; i++) {
      fileError({
        kind: 'degraded',
        error: { name: 'RealtimeDegraded', message: 'useCommunityPosts (subscribe-failed): boom' },
        routePath: '/community/feed',
      });
    }

    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('still separates genuinely different failures', () => {
    const file = (message: string, routePath: string) =>
      fileError({ kind: 'degraded', error: { name: 'RealtimeDegraded', message }, routePath });

    file('useCommunityPosts (subscribe-failed): boom', '/community/feed');
    file('useCommunityPosts (teardown-failed): boom', '/community/feed'); // different reason
    file('useCommunityPosts (subscribe-failed): boom', '/community'); // different route

    expect(rpc).toHaveBeenCalledTimes(3);
    const fingerprints = new Set(
      (rpc.mock.calls as unknown as [string, RpcArgs][]).map(([, a]) => a.p_fingerprint),
    );
    expect(fingerprints.size).toBe(3);
  });

  it('does not collide with the crash kind for the same underlying error', () => {
    const error = { name: 'RealtimeDegraded', message: 'useCommunityPosts (subscribe-failed): boom' };
    fileError({ kind: 'degraded', error, routePath: '/community/feed' });
    fileError({ kind: 'error_boundary', error, routePath: '/community/feed' });

    const [a, b] = (rpc.mock.calls as unknown as [string, RpcArgs][]).map(([, x]) => x.p_fingerprint);
    expect(a).not.toBe(b);
    // The pre-existing crash title must not have moved.
    expect(lastCall().p_data.title).toBe('[crash] RealtimeDegraded @ /community/feed');
  });
});
