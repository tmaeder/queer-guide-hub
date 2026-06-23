/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { RecentlyViewedItem } from '@/lib/recentlyViewed';

const mockItems = vi.hoisted(() => ({ value: [] as RecentlyViewedItem[] }));

vi.mock('@/hooks/useRecentlyViewed', () => ({
  useRecentlyViewed: () => mockItems.value,
}));

import { RecentlyViewedRail } from '../RecentlyViewedRail';

describe('RecentlyViewedRail', () => {
  it('renders the stored image when present', () => {
    mockItems.value = [
      { type: 'venue', slug: 'the-eagle', title: 'The Eagle', image: 'https://cdn.example/eagle.webp', ts: 1 },
    ];
    const { container } = render(
      <MemoryRouter>
        <RecentlyViewedRail />
      </MemoryRouter>,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://cdn.example/eagle.webp');
  });

  it('falls back to a deterministic local placeholder when no image', () => {
    mockItems.value = [
      { type: 'city', slug: 'berlin', title: 'Berlin', ts: 1 },
    ];
    const { container } = render(
      <MemoryRouter>
        <RecentlyViewedRail />
      </MemoryRouter>,
    );
    const src = container.querySelector('img')?.getAttribute('src') ?? '';
    expect(src).toMatch(/\/images\/fallback\/.+\.webp$/);
  });
});
