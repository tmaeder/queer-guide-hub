/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

const fixtures = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  venueConfig: {
    id: 'venues',
    tableName: 'venues',
    primaryKey: 'id',
    titleField: 'name',
    descriptionField: 'description',
    label: { singular: 'Venue', plural: 'Venues' },
    color: '#000',
    fields: [],
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = () => chain;
      chain.range = () => Promise.resolve({ data: [], error: null, count: 0 });
      chain.limit = () =>
        Promise.resolve({ data: fixtures.rows, error: null, count: fixtures.rows.length });
      return chain;
    },
  },
}));
vi.mock('@/config/contentTypeRegistry', () => ({
  getContentType: (id: string) => (id === 'venues' ? fixtures.venueConfig : null),
  getContentTypeIds: () => ['venues'],
}));

import { useContentListController } from '../useContentListController';

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('useContentListController', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() => useContentListController({ contentTypeId: 'venues' }), {
      wrapper,
    });
    expect(result.current).toBeDefined();
  });

  it('keeps raw source values in the all-content list for inline editing', async () => {
    fixtures.rows = [
      {
        id: 'venue-1',
        name: 'The Existing Name',
        description: 'Already published copy',
        review_status: 'approved',
        updated_at: '2026-10-01T10:00:00Z',
      },
    ];

    const { result } = renderHook(() => useContentListController({}), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({
      id: 'venue-1',
      title: 'The Existing Name',
      raw: fixtures.rows[0],
    });
  });
});
