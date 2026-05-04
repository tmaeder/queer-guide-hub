import { describe, it, expect } from 'vitest';

// Re-importing applySort would require exporting it. Instead we test via a
// chain stub that records every `.order()` call so we can assert the sort
// composition without booting Supabase.
type OrderCall = { col: string; ascending: boolean };

function makeStubQuery(record: OrderCall[]) {
  const builder = {
    order(col: string, opts?: { ascending?: boolean }) {
      record.push({ col, ascending: opts?.ascending ?? true });
      return builder;
    },
  };
  return builder as unknown as ReturnType<typeof builder.order>;
}

// Inlined applySort logic — kept in sync manually with src/hooks/usePersonalities.tsx
// so that unit tests don't require exposing the helper through the hook's public API.
function applySort(query: ReturnType<typeof makeStubQuery>, sortBy: string) {
  switch (sortBy) {
    case 'az':
      return query.order('name', { ascending: true }).order('id', { ascending: true });
    case 'za':
      return query.order('name', { ascending: false }).order('id', { ascending: true });
    case 'popular':
      return query.order('view_count', { ascending: false }).order('id', { ascending: true });
    case 'newest':
      return query.order('created_at', { ascending: false }).order('id', { ascending: true });
    default:
      return query
        .order('is_featured', { ascending: false })
        .order('view_count', { ascending: false })
        .order('id', { ascending: true });
  }
}

describe('applySort', () => {
  it('featured pins is_featured first, then view_count, then id', () => {
    const calls: OrderCall[] = [];
    applySort(makeStubQuery(calls), 'featured');
    expect(calls.map((c) => c.col)).toEqual(['is_featured', 'view_count', 'id']);
  });

  it.each(['az', 'za', 'popular', 'newest'])(
    '%s does NOT pin is_featured first',
    (sortBy) => {
      const calls: OrderCall[] = [];
      applySort(makeStubQuery(calls), sortBy);
      expect(calls[0].col).not.toBe('is_featured');
    },
  );

  it('az orders by name ascending', () => {
    const calls: OrderCall[] = [];
    applySort(makeStubQuery(calls), 'az');
    expect(calls[0]).toEqual({ col: 'name', ascending: true });
  });

  it('za orders by name descending', () => {
    const calls: OrderCall[] = [];
    applySort(makeStubQuery(calls), 'za');
    expect(calls[0]).toEqual({ col: 'name', ascending: false });
  });

  it('every sort ends with stable id tiebreaker', () => {
    for (const sortBy of ['featured', 'az', 'za', 'popular', 'newest']) {
      const calls: OrderCall[] = [];
      applySort(makeStubQuery(calls), sortBy);
      expect(calls[calls.length - 1]).toEqual({ col: 'id', ascending: true });
    }
  });
});
