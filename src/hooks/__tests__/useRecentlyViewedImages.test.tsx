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
  cities: [
    {
      slug: 'berlin',
      curated_image_url: 'https://cdn.example/berlin.jpg',
      image_url: null,
      image_flagged: false,
    },
    {
      slug: 'mexico-city',
      curated_image_url: 'https://cdn.example/pride.jpg',
      image_url: 'https://cdn.example/map.jpg',
      image_flagged: false,
    },
    {
      slug: 'flagged-town',
      curated_image_url: null,
      image_url: 'https://cdn.example/map.jpg',
      image_flagged: true,
    },
  ],
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

  it('replaces a stale stored image with the current one', async () => {
    // localStorage keeps the URL from the moment of viewing; Mexico City's was
    // a radar map that has since been replaced.
    const items: RecentlyViewedItem[] = [
      {
        type: 'city',
        slug: 'mexico-city',
        title: 'Mexico City',
        image: 'https://cdn.example/map.jpg',
        ts: 1,
      },
    ];
    const { result } = renderHook(() => useRecentlyViewedImages(items), { wrapper: wrapper() });
    await waitFor(() =>
      expect(result.current['city:mexico-city']).toBe('https://cdn.example/pride.jpg'),
    );
  });

  it('reports a found row with no usable image as null, not absent', async () => {
    const items: RecentlyViewedItem[] = [
      {
        type: 'city',
        slug: 'flagged-town',
        title: 'Flagged',
        image: 'https://cdn.example/map.jpg',
        ts: 1,
      },
      {
        type: 'city',
        slug: 'not-in-db',
        title: 'Gone',
        image: 'https://cdn.example/kept.jpg',
        ts: 2,
      },
    ];
    const { result } = renderHook(() => useRecentlyViewedImages(items), { wrapper: wrapper() });
    await waitFor(() => expect('city:flagged-town' in result.current).toBe(true));
    expect(result.current['city:flagged-town']).toBeNull();
    // Unresolved → absent, so the caller keeps the stored URL.
    expect('city:not-in-db' in result.current).toBe(false);
  });
});
