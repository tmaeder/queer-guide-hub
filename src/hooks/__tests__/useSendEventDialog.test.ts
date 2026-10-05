import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { data: unknown; error: unknown };
const results: Record<string, Result> = {};
const orCalls: Record<string, string[]> = {};

function chain(table: string) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'neq', 'order', 'limit', 'eq']) c[m] = () => c;
  c.or = (expr: string) => {
    (orCalls[table] ||= []).push(expr);
    return c;
  };
  c.then = (resolve: (r: Result) => unknown) => resolve(results[table]);
  return c;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (t: string) => chain(t) },
}));

import { fetchSendEventMembers } from '../useSendEventDialog';

const profiles = [
  { user_id: 'a', display_name: 'Alex', avatar_url: null },
  { user_id: 'b', display_name: 'Blocked by me', avatar_url: null },
  { user_id: 'c', display_name: 'Blocked me', avatar_url: null },
];

describe('fetchSendEventMembers', () => {
  beforeEach(() => {
    for (const k of Object.keys(orCalls)) delete orCalls[k];
    results.profiles = { data: profiles, error: null };
    results.user_relationships = {
      data: [
        { user_id: 'me', target_user_id: 'b' },
        { user_id: 'c', target_user_id: 'me' },
      ],
      error: null,
    };
  });

  it('drops users in a block relationship in either direction', async () => {
    const out = await fetchSendEventMembers('me', '');
    expect(out.map((m) => m.id)).toEqual(['a']);
  });

  it('fails closed when the block list cannot be read', async () => {
    results.user_relationships = { data: null, error: { message: 'boom' } };
    expect(await fetchSendEventMembers('me', '')).toEqual([]);
  });

  it('searches display name and username, stripping filter-breaking characters', async () => {
    await fetchSendEventMembers('me', ' al,(x)% ');
    expect(orCalls.profiles).toEqual(['display_name.ilike.%alx%,username.ilike.%alx%']);
  });
});
