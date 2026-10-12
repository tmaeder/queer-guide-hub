// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
const fixtures = vi.hoisted(() => ({
  queries: [] as { select: string; ids?: unknown[]; scoped: string[] }[],
  config: {
    id: 'cities',
    tableName: 'cities',
    primaryKey: 'id',
    titleField: 'name',
    fields: [],
    label: { singular: 'City', plural: 'Cities' },
    color: '#000',
    listSelect: '*,countries(name),venues(count),events(count)',
    listCountsAfterPagination: true,
    listEmbedScopes: [
      {
        embed: 'venues',
        type: {
          merge: { column: 'duplicate_of_id' },
          lifecycle: { archive: { column: 'review_status', value: 'archived' } },
        },
      },
      {
        embed: 'events',
        type: {
          merge: { column: 'duplicate_of_id' },
          lifecycle: { archive: { column: 'status', value: 'cancelled' } },
        },
      },
    ],
  },
}));
vi.mock('@/config/contentTypeRegistry', () => ({
  getContentType: () => fixtures.config,
  getContentTypeIds: () => ['cities'],
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const record = {
        select: '',
        ids: undefined as unknown[] | undefined,
        scoped: [] as string[],
      };
      fixtures.queries.push(record);
      const q: Record<string, unknown> = {};
      for (const name of ['order', 'range', 'limit', 'eq']) q[name] = () => q;
      q.select = (columns: string) => {
        record.select = columns;
        return q;
      };
      q.in = (_column: string, ids: unknown[]) => {
        record.ids = ids;
        return q;
      };
      q.is = (column: string) => {
        record.scoped.push(column);
        return q;
      };
      q.or = (_value: string, options?: { referencedTable: string }) => {
        if (options) record.scoped.push(options.referencedTable);
        return q;
      };
      q.then = (resolve: (result: unknown) => void) => {
        const embed = record.select.includes('venues(count)')
          ? 'venues'
          : record.select.includes('events(count)')
            ? 'events'
            : null;
        resolve({
          data: embed
            ? (record.ids ?? []).map((id) => ({
                id,
                [embed]: [{ count: embed === 'venues' ? 7 : 9 }],
              }))
            : [
                { id: 'c1', name: 'One' },
                { id: 'c2', name: 'Two' },
              ],
          count: 17000,
          error: null,
        });
      };
      return q;
    },
  },
}));
import { useContentListController } from '../useContentListController';
function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}
describe('page-scoped embedded counts', () => {
  it('loads the page first and preserves scoped venue/event counts by ID', async () => {
    const { result } = renderHook(() => useContentListController({ contentTypeId: 'cities' }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.totalCount).toBe(17000);
    expect(result.current.items.map((item) => item.raw)).toEqual([
      { id: 'c1', name: 'One', venues: [{ count: 7 }], events: [{ count: 9 }] },
      { id: 'c2', name: 'Two', venues: [{ count: 7 }], events: [{ count: 9 }] },
    ]);
    expect(fixtures.queries[0].select).toBe('*,countries(name)');
    expect(fixtures.queries.slice(1).map((q) => q.ids)).toEqual([
      ['c1', 'c2'],
      ['c1', 'c2'],
    ]);
    expect(fixtures.queries[1].scoped.slice().sort()).toEqual(['venues', 'venues.duplicate_of_id']);
    expect(fixtures.queries[2].scoped.slice().sort()).toEqual(['events', 'events.duplicate_of_id']);
  });
});
