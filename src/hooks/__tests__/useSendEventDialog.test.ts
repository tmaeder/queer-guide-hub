import { describe, it, expect, beforeEach, vi } from 'vitest';

type MockResult = { data: unknown; error: { message: string } | null };

const state = vi.hoisted(() => ({
  results: [] as MockResult[],
  calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from(table: string) {
      const record = { table, chain: [] as Array<{ method: string; args: unknown[] }> };
      state.calls.push(record);
      const builder: unknown = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              return (onFulfilled: (v: MockResult) => unknown) => {
                const next = state.results.shift() ?? { data: [], error: null };
                return Promise.resolve(next).then(onFulfilled);
              };
            }
            return (...args: unknown[]) => {
              record.chain.push({ method: prop, args });
              return builder;
            };
          },
        },
      );
      return builder;
    },
  },
}));

import {
  fetchSendEventMembers,
  fetchSendEventGroups,
  postEventToGroup,
} from '../useSendEventDialog';

function withResults(...r: MockResult[]) { state.results.push(...r); }

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('fetchSendEventMembers', () => {
  it('excludes the current user and applies ilike when query is non-empty', async () => {
    withResults({
      data: [
        { user_id: 'u2', display_name: 'Alice', avatar_url: null },
        { user_id: 'u3', display_name: 'Bob', avatar_url: 'b.png' },
      ],
      error: null,
    });

    const result = await fetchSendEventMembers('u1', 'al');
    expect(result.map(m => m.id)).toEqual(['u2', 'u3']);

    const call = state.calls[0];
    expect(call.table).toBe('profiles');
    const neq = call.chain.find(s => s.method === 'neq');
    expect(neq?.args).toEqual(['user_id', 'u1']);
    const ilike = call.chain.find(s => s.method === 'ilike');
    expect(ilike?.args).toEqual(['display_name', '%al%']);
  });

  it('skips the ilike filter when query is whitespace-only', async () => {
    withResults({ data: [], error: null });
    await fetchSendEventMembers('u1', '   ');
    const ilike = state.calls[0].chain.find(s => s.method === 'ilike');
    expect(ilike).toBeUndefined();
  });

  it('returns an empty array when data is null', async () => {
    withResults({ data: null, error: null });
    expect(await fetchSendEventMembers('u1', '')).toEqual([]);
  });
});

describe('fetchSendEventGroups', () => {
  it('flattens the community_groups join and skips rows without a group', async () => {
    withResults({
      data: [
        { group_id: 'g1', community_groups: { id: 'g1', name: 'A', image_url: null } },
        { group_id: 'g2', community_groups: null },
        { group_id: 'g3', community_groups: { id: 'g3', name: 'C', image_url: 'c.png' } },
      ],
      error: null,
    });

    const result = await fetchSendEventGroups('u1');
    expect(result.map(g => g.id)).toEqual(['g1', 'g3']);

    const eq = state.calls[0].chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['user_id', 'u1']);
  });
});

describe('postEventToGroup', () => {
  it('inserts a text post into group_posts', async () => {
    withResults({ data: null, error: null });
    await postEventToGroup('g1', 'u1', 'check this');

    const insert = state.calls[0].chain.find(s => s.method === 'insert');
    expect(insert?.args[0]).toEqual({
      group_id: 'g1',
      user_id: 'u1',
      content: 'check this',
      post_type: 'text',
    });
  });

  it('throws on supabase error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    await expect(postEventToGroup('g1', 'u1', 'x')).rejects.toEqual({ message: 'rls' });
  });
});
