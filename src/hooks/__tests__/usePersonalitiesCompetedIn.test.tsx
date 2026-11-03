import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * The "Competed in" filter must reach PostgREST as an `!inner` embed plus an
 * eq on the embedded column, and the embed must not leak onto the entity.
 * A recording builder captures every call so the assertions read the actual
 * query rather than the hook's intent.
 */
const { calls, rows } = vi.hoisted(() => ({
  calls: [] as Array<[string, unknown[]]>,
  rows: { value: [] as unknown[] },
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => {
  const builder: Record<string, unknown> = {};
  for (const m of [
    'select',
    'eq',
    'is',
    'or',
    'ilike',
    'contains',
    'gte',
    'lte',
    'not',
    'filter',
    'order',
    'range',
  ]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: rows.value, error: null, count: rows.value.length });
  return { supabase: { from: () => builder } };
});

import { usePersonalities } from '../usePersonalities';
import { COMPETED_IN_EMBED } from '@/lib/competedInFilter';

async function run(competed_in?: string) {
  const { result } = renderHook(() => usePersonalities(false));
  await act(async () => {
    await result.current.fetchPersonalities({ competed_in, exclude_adult: false });
  });
  return result;
}

describe('usePersonalities — competed_in', () => {
  beforeEach(() => {
    calls.length = 0;
    rows.value = [];
  });

  it('adds no embed and no competition filter when unset', async () => {
    await run(undefined);
    expect(calls.find(([m]) => m === 'select')?.[1][0]).toBe('*');
    expect(calls.some(([m, a]) => m === 'eq' && String(a[0]).startsWith('competed.'))).toBe(false);
  });

  it('"any" is the inner embed alone', async () => {
    await run('any');
    expect(calls.find(([m]) => m === 'select')?.[1][0]).toBe(`*,${COMPETED_IN_EMBED}`);
    expect(calls.some(([m, a]) => m === 'eq' && String(a[0]).startsWith('competed.'))).toBe(false);
  });

  it('a category filters the embedded category column', async () => {
    await run('drag_series');
    expect(calls).toContainEqual(['eq', ['competed.ed.c.category', 'drag_series']]);
  });

  it('a competition slug filters the embedded slug column', async () => {
    await run('rupauls-drag-race-uk');
    expect(calls).toContainEqual(['eq', ['competed.ed.c.slug', 'rupauls-drag-race-uk']]);
  });

  it('ignores a malformed value rather than sending it', async () => {
    await run('Robert);drop');
    expect(calls.find(([m]) => m === 'select')?.[1][0]).toBe('*');
  });

  it('strips the embed from returned rows', async () => {
    rows.value = [{ id: 'p1', name: 'Victoria Scone', competed: [{ ed: { c: { slug: 'x' } } }] }];
    const result = await run('any');
    expect(result.current.personalities).toHaveLength(1);
    expect(result.current.personalities[0]).not.toHaveProperty('competed');
  });
});
