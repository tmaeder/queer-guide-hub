import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const filters = new Map<string, string>();
      const builder = {
        select: () => builder,
        eq: (field: string, value: string) => {
          filters.set(field, value);
          return builder;
        },
        in: (_field: string, slugs: string[]) =>
          Promise.resolve({
            data: [
              { id: 'active-museum', name: 'Museum', slug: 'museum', status: 'active' },
              { id: 'merged-art', name: 'Art', slug: 'art', status: 'merged' },
              { id: 'retired-books', name: 'Books', slug: 'books', status: 'deprecated' },
            ].filter(
              (row) =>
                slugs.includes(row.slug) &&
                (!filters.has('status') || row.status === filters.get('status')),
            ),
            error: null,
          }),
      };
      return builder;
    },
  },
}));

import { useInterestVocabularyTags } from '../useInterestVocabularyTags';

describe('useInterestVocabularyTags', () => {
  it('keeps merged and retired terms out of the followable interest choices', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useInterestVocabularyTags(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((row) => row.id)).toEqual(['active-museum']);
    client.clear();
  });
});
