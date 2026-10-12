import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), sources: new Map<string, unknown>() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: (table: string) => ({ select: () => ({ gte: () => mocks.sources.get(table) }) }),
  },
}));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: (table: string) => ({
    select: () => {
      if (table === 'pipeline_error_summary') return { limit: () => mocks.sources.get(table) };
      return mocks.sources.get(table);
    },
  }),
  untypedRpc: () => mocks.sources.get('gates'),
}));

import { fetchAdminCounts } from '../useAdminCounts';
import { fetchCockpitOps } from '../useCockpitOps';

beforeEach(() => {
  mocks.rpc.mockReset();
  for (const name of [
    'admin_automations',
    'pipeline_error_summary',
    'gates',
    'import_jobs_enhanced',
  ]) {
    mocks.sources.set(name, Promise.resolve({ data: [], error: null }));
  }
});

describe('cockpit query reliability', () => {
  it('rejects count RPC errors rather than returning an empty successful payload', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Unavailable' } });
    await expect(fetchAdminCounts()).rejects.toThrow('Unavailable');
  });

  it.each([null, [], 'invalid'])('rejects unusable count payload %j', async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(fetchAdminCounts()).rejects.toThrow('no usable data');
  });

  it('returns successful counts including real zeroes', async () => {
    mocks.rpc.mockResolvedValue({ data: { review_staging: 0, events: 12 }, error: null });
    expect(await fetchAdminCounts()).toEqual({ review_staging: 0, events: 12 });
  });

  it('preserves successful checks when another source returns an error', async () => {
    mocks.sources.set('gates', Promise.resolve({ data: null, error: { message: 'Denied' } }));
    mocks.sources.set(
      'admin_automations',
      Promise.resolve({
        data: [
          { slug: 'sync', name: 'Sync', enabled: true, last_run_status: 'failed' },
          { slug: 'disabled', enabled: false, last_run_status: 'failed' },
        ],
        error: null,
      }),
    );
    const result = await fetchCockpitOps();
    expect(result.unavailableSources).toEqual(['Release gates']);
    expect(result.failingAutomations.map((a) => a.slug)).toEqual(['sync']);
    expect(result.allClear).toBe(false);
  });

  it('handles a rejected request without losing known pipeline errors', async () => {
    // Reject only when awaited to avoid an unrelated unhandled rejection.
    mocks.sources.set('gates', {
      then: (_resolve: unknown, reject: (error: Error) => void) => reject(new Error('Network')),
    });
    mocks.sources.set(
      'pipeline_error_summary',
      Promise.resolve({
        data: [
          { function_name: 'sync', last_24h: 7 },
          { function_name: 'refresh', last_24h: 2 },
        ],
        error: null,
      }),
    );
    const result = await fetchCockpitOps();
    expect(result.unavailableSources).toEqual(['Release gates']);
    expect(result.pipelineErrors24h).toBe(9);
    expect(result.allClear).toBe(false);
  });

  it('treats unreadable sources as unknown even when all other checks are clear', async () => {
    mocks.sources.set('import_jobs_enhanced', Promise.resolve({ data: null, error: null }));
    expect(await fetchCockpitOps()).toMatchObject({
      allClear: false,
      unavailableSources: ['Imports'],
    });
  });

  it('reports clear only after all four sources succeed', async () => {
    expect(await fetchCockpitOps()).toMatchObject({ allClear: true, unavailableSources: [] });
  });
});
