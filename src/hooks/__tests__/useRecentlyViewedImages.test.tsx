/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RecentlyViewedItem } from '@/lib/recentlyViewed';

// In-memory stand-in for the entity tables.
const TABLES: Record<string, Array<Record<string, unknown>>> = {
  venues: [{ slug: 'the-eagle', images: ['https://cdn.example/eagle.webp'], logo_url: null }],
  cities: [{ slug: 'berlin', curated_image_url: 'https://cdn.example/berlin.jpg', image_url: null, image_flagged: false }],
};

const inSpy = vi.fn();

vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: (table: string) => ({
    select: () => ({
      in: (_col: string, slugs: string[]) => {
        inSpy(table, slugs);
        return Promise.resolve({
          data: (TABLES[table] ?? []).filter((r) => slugs.includes(r.slug as string)),
          error: null,
        });
      },
    }),
  }),
}));

import { useRecentlyViewedImages } from '../useRecentlyViewedImages';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useRecentlyViewedImages', () => {
  it('resolves a real image for entries stored without one', async () => {
    inSpy.mockClear();
    const items: RecentlyViewedItem[] = [
      { type: 'venue', slug: 'the-eagle', title: 'The Eagle', ts: 2 },
      { type: 'city', slug: 'berlin', title: 'Berlin', ts: 1 },
    ];
    const { result } = renderHook(() => useRecentlyViewedImages(items), { wrapper: wrapper() });

    await waitFor(() => expect(result.current['venue:the-eagle']).toBeDefined());
    expect(result.current['venue:the-eagle']).toBe('https://cdn.example/eagle.webp');
    expect(result.current['city:berlin']).toBe('https://cdn.example/berlin.jpg');
  });

  it('does not look up items that already carry a valid image', async () => {
    inSpy.mockClear();
    const items: RecentlyViewedItem[] = [
      { type: 'venue', slug: 'has-img', title: 'Has', image: 'https://cdn.example/already.webp', ts: 1 },
    ];
    const { result } = renderHook(() => useRecentlyViewedImages(items), { wrapper: wrapper() });

    // No gap → query disabled → empty map, and the table was never queried.
    await waitFor(() => expect(result.current).toEqual({}));
    expect(inSpy).not.toHaveBeenCalled();
  });
});
