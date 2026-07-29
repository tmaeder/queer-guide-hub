/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildEntityCardQuery } from '@/lib/databaseBlock/query';

/**
 * Exercises the query the hook actually issues against `v_entity_cards`.
 *
 * The chain spy records every builder call, so these assertions are about the
 * real request shape — in particular that a curated block never degenerates
 * into an unfiltered "all entities of this type" fetch.
 */

interface Call {
  method: string;
  args: unknown[];
}

let calls: Call[] = [];
let resultRows: unknown[] = [];
let resultError: { message: string } | null = null;

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return chain;
  };
  for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'is', 'not', 'order', 'limit']) {
    chain[m] = record(m);
  }
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: resultRows, error: resultError }).then(resolve);

  return {
    supabase: {
      from: (relation: string) => {
        calls.push({ method: 'from', args: [relation] });
        return chain;
      },
    },
  };
});

const { fetchEntityCards } = await import('../useEntityCards');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const row = (id: string, title: string, slug: string) => ({
  entity_type: 'venue',
  entity_id: id,
  title,
  slug,
  facets: {},
});

const callTo = (method: string) => calls.filter((c) => c.method === method);

beforeEach(() => {
  calls = [];
  resultRows = [];
  resultError = null;
});

describe('fetchEntityCards', () => {
  it('reads the gated view, never search_documents', () => {
    resultRows = [];
    return fetchEntityCards(
      buildEntityCardQuery('venue', { kind: 'query', filters: {}, orderBy: { field: 'title', dir: 'asc' }, limit: 5 }),
    ).then(() => {
      expect(callTo('from')[0].args[0]).toBe('v_entity_cards');
      expect(JSON.stringify(calls)).not.toContain('search_documents');
    });
  });

  it('constrains a curated block to its ids', async () => {
    resultRows = [row(A, 'A', 'a'), row(B, 'B', 'b')];
    await fetchEntityCards(buildEntityCardQuery('venue', { kind: 'ids', ids: [A, B] }));
    const inCalls = callTo('in');
    expect(inCalls.some((c) => c.args[0] === 'entity_id')).toBe(true);
  });

  it('returns [] for an empty curated block WITHOUT querying', async () => {
    // Falling through would render every venue on the site under an empty block.
    const cards = await fetchEntityCards(buildEntityCardQuery('venue', { kind: 'ids', ids: [] }));
    expect(cards).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('restores author order rather than database order', async () => {
    resultRows = [row(A, 'A', 'a'), row(B, 'B', 'b')];
    const cards = await fetchEntityCards(buildEntityCardQuery('venue', { kind: 'ids', ids: [B, A] }));
    expect(cards.map((c) => c.entityId)).toEqual([B, A]);
  });

  it('drops ids with no row — deleted, or gated for this reader', async () => {
    resultRows = [row(A, 'A', 'a')];
    const cards = await fetchEntityCards(buildEntityCardQuery('venue', { kind: 'ids', ids: [A, B] }));
    expect(cards.map((c) => c.entityId)).toEqual([A]);
  });

  it('applies filters, ordering and limit for a query block', async () => {
    await fetchEntityCards(
      buildEntityCardQuery('event', {
        kind: 'query',
        filters: { city: ['Berlin'], is_featured: true },
        orderBy: { field: 'start_date', dir: 'desc' },
        limit: 8,
      }),
    );
    expect(callTo('in').some((c) => c.args[0] === 'city')).toBe(true);
    expect(callTo('eq').some((c) => c.args[0] === 'is_featured' && c.args[1] === true)).toBe(true);
    expect(callTo('eq').some((c) => c.args[0] === 'entity_type' && c.args[1] === 'event')).toBe(true);
    expect(callTo('order')[0].args).toEqual(['start_date', { ascending: false }]);
    expect(callTo('limit')[0].args).toEqual([8]);
  });

  it('never filters or orders on gatedness', async () => {
    await fetchEntityCards(
      buildEntityCardQuery('venue', {
        kind: 'query',
        filters: { city: ['Kampala'] },
        orderBy: { field: 'title', dir: 'asc' },
        limit: 10,
      }),
    );
    // `is_gated` IS legitimately in the select list — the editor reads it to keep
    // gated entities out of the crawlable snapshot. What must never happen is a
    // client-chosen predicate on gatedness; the gate belongs to the view body.
    const predicates = calls.filter((c) => c.method !== 'select' && c.method !== 'from');
    for (const call of predicates) {
      expect(String(call.args[0])).not.toMatch(/gated/);
    }
  });

  it('throws on a query error rather than rendering a silently empty block', async () => {
    // An empty block and a failed block must not look the same to the caller:
    // TanStack needs the rejection to surface an error state and retry.
    resultError = { message: 'permission denied for relation v_entity_cards' };
    await expect(
      fetchEntityCards(buildEntityCardQuery('venue', { kind: 'ids', ids: [A] })),
    ).rejects.toMatchObject({ message: expect.stringContaining('permission denied') });
  });
});
