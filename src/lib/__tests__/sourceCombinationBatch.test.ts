import { describe, it, expect, vi } from 'vitest';
import {
  combineStagingSources,
  planSourceCombinations,
  type CombinationBatch,
} from '../../../supabase/functions/pipeline-commit/combine-sources';

function batch(): CombinationBatch {
  return {
    pending: [
      {
        id: 'pending',
        source_name: 'osm',
        source_type: 'api',
        dedup_match_id: 'canonical',
        normalized_data: { description: 'Recovered', metadata: { keep: 'untouched' } },
        enriched_data: {},
        created_at: '2026-10-15T10:00:00Z',
        updated_at: '2026-10-15T10:00:00Z',
      },
    ],
    canonical: { canonical: { description: null, website: 'https://curated.example' } },
    history: {
      canonical: [
        {
          id: 'history',
          source_name: 'wikidata',
          source_type: 'api',
          normalized_data: { description: 'Recovered' },
          created_at: '2026-10-14T10:00:00Z',
        },
      ],
    },
  };
}

describe('batched source combination integration', () => {
  it('uses committed evidence and preserves primary metadata and source IDs', () => {
    const input = batch();
    const plans = planSourceCombinations(input, 'venues');
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      ids: ['pending'],
      primary: 'pending',
      needs_review: false,
      normalized: {
        description: 'Recovered',
        metadata: { keep: 'untouched', website: 'https://curated.example' },
        contacts: { website: 'https://curated.example' },
      },
    });
    expect((plans[0].decisions as { evidence?: string[] }[])[0].evidence).toEqual([
      'pending',
      'history',
    ]);
    expect(input.pending[0].normalized_data).toEqual({
      description: 'Recovered',
      metadata: { keep: 'untouched' },
    });
  });
  it('uses safely archived observations to fill fields outside the venue consensus schema', () => {
    const input = batch();
    input.canonical.canonical.social_links = { facebook: '' };
    input.history.canonical.push({
      id: 'archived',
      source_name: 'google',
      source_type: 'api',
      normalized_data: { social_links: { facebook: 'https://facebook.com/venue' } },
      created_at: '2026-10-15T09:00:00Z',
    });
    const [plan] = planSourceCombinations(input, 'venues');
    expect(plan.normalized).toMatchObject({
      social_links: { facebook: 'https://facebook.com/venue' },
    });
    expect(plan.needs_review).toBe(false);
  });
  it('does no work when gaps are filled or sources only contain unsupported fields', () => {
    const input = batch();
    input.canonical.canonical.description = 'Curated';
    expect(planSourceCombinations(input, 'venues')).toEqual([]);
    input.pending[0].normalized_data = { bio: 'Unsupported venue field' };
    input.history.canonical[0].normalized_data = { bio: 'Unsupported venue field' };
    input.canonical.canonical.description = null;
    expect(planSourceCombinations(input, 'venues')).toEqual([]);
  });
  it('does not combine unmatched/hidden canonical rows or a lone observation', () => {
    const input = batch();
    input.canonical.canonical.duplicate_of_id = 'other';
    expect(planSourceCombinations(input, 'venues')).toEqual([]);
    delete input.canonical.canonical.duplicate_of_id;
    input.history = {};
    expect(planSourceCombinations(input, 'venues')).toEqual([]);
  });
  it('gates conflicting sources without archiving contributors', () => {
    const input = batch();
    input.history.canonical[0].normalized_data = { description: 'Disagrees' };
    const [plan] = planSourceCombinations(input, 'venues');
    expect(plan.needs_review).toBe(true);
    expect(plan.ids).toEqual(['pending']);
    expect(plan).not.toHaveProperty('archive');
  });
  it('uses two RPCs for a whole batch and never performs per-record reads', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: batch(), error: null })
      .mockResolvedValueOnce({ data: { groups: 1, gated: 0, stale: 0 }, error: null });
    const client = { rpc } as unknown as Parameters<typeof combineStagingSources>[0];
    expect(await combineStagingSources(client, 'venues', 'run', 100)).toEqual({
      groups: 1,
      gated: 0,
      stale: 0,
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual([
      'load_source_combination_batch',
      { p_table: 'venues', p_pipeline_run_id: 'run', p_limit: 100 },
    ]);
    expect(rpc.mock.calls[1][0]).toBe('apply_source_combination_batch');
  });
  it('skips the write RPC for a no-op batch', async () => {
    const input = batch();
    input.canonical.canonical.description = 'Curated';
    const rpc = vi.fn().mockResolvedValue({ data: input, error: null });
    const client = { rpc } as unknown as Parameters<typeof combineStagingSources>[0];
    await combineStagingSources(client, 'venues');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('surfaces read/write failures instead of reporting a successful merge', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'failed' } });
    const client = { rpc } as unknown as Parameters<typeof combineStagingSources>[0];
    await expect(combineStagingSources(client, 'venues')).rejects.toThrow(
      'source combination read: failed',
    );
    rpc
      .mockResolvedValueOnce({ data: batch(), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'write failed' } });
    await expect(combineStagingSources(client, 'venues')).rejects.toThrow(
      'source combination write: write failed',
    );
  });
});
