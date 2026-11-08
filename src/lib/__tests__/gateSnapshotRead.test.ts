import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- plain .mjs operator helper, no type declarations
import { readGateSnapshot } from '../../../scripts/lib/gate-rpc.mjs';

/**
 * readGateSnapshot() may only ever make a PR gate faster, never laxer: any
 * snapshot that is missing, stale or unreadable must return null so the
 * caller runs the gate RPC live, exactly as before snapshots existed.
 */
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('readGateSnapshot', () => {
  it('returns the stored result when the snapshot is fresh', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const rows = [{ gate: 'g', severity: 'critical', failures: 0, detail: {} }];
    const fetchMock = stubFetch(200, [
      { result: rows, computed_at: minutesAgo(4), last_error: null },
    ]);
    const res = await readGateSnapshot('https://x', 'k', 'release_gate_checks');
    expect(res).toEqual({ ok: true, status: 200, body: null, data: rows });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'gate_snapshots?rpc=eq.release_gate_checks',
    );
  });

  it('returns null for a snapshot older than the limit', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch(200, [{ result: { a: 1 }, computed_at: minutesAgo(31), last_error: 'boom' }]);
    expect(await readGateSnapshot('https://x', 'k', 'tag_hygiene_stats')).toBeNull();
  });

  it('returns null when the table does not exist yet (404)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch(404, { code: '42P01' });
    expect(await readGateSnapshot('https://x', 'k', 'tag_hygiene_stats')).toBeNull();
  });

  it('returns null when the row has never succeeded', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch(200, [{ result: null, computed_at: null, last_error: '57014: timeout' }]);
    expect(await readGateSnapshot('https://x', 'k', 'event_quality_gate_checks')).toBeNull();
  });

  it('returns null for a timestamp in the future', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch(200, [{ result: [], computed_at: minutesAgo(-10), last_error: null }]);
    expect(await readGateSnapshot('https://x', 'k', 'release_gate_checks')).toBeNull();
  });
});
