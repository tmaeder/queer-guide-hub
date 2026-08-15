/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

const state = vi.hoisted(() => ({
  front: [] as unknown[],
  forYou: [] as unknown[],
}));

// The band reads the RANKED feed now, not `published_at desc` — mocking
// useLatestNews here would leave the real hooks running.
vi.mock('@/hooks/useNewsFront', () => ({
  useNewsFront: () => ({ articles: state.front, loading: false, error: null }),
  useForYouNews: () => ({ articles: state.forYou, loading: false, error: null }),
}));
vi.mock('@/hooks/useEditorsPick', () => ({ useEditorsPick: () => null }));
vi.mock('@/hooks/useEntityImageAssets', () => ({
  useEntityImageAssets: () => ({ assets: new Map() }),
}));

import NewsMagazine from '../NewsMagazine';

const article = (i: number, over: Record<string, unknown> = {}) => ({
  id: `a${i}`,
  slug: `story-${i}`,
  title: `Story ${i}`,
  excerpt: null,
  image_url: null,
  published_at: '2026-08-01T00:00:00Z',
  publisher_name: 'Wire',
  is_read: false,
  ...over,
});

beforeEach(() => {
  state.front = [];
  state.forYou = [];
});

describe('NewsMagazine', () => {
  it('self-hides when there is nothing to show', () => {
    const { container } = renderWithProviders(<NewsMagazine />);
    expect(container.querySelector('h2')).toBeNull();
  });

  it('renders the global front when signed out', () => {
    state.front = Array.from({ length: 6 }, (_, i) => article(i));
    renderWithProviders(<NewsMagazine />);
    expect(screen.getByRole('heading', { level: 2 })).toBeTruthy();
  });

  it('prefers the personalized feed when it has anything', () => {
    state.front = [article(1, { title: 'Global lead' })];
    state.forYou = [article(9, { title: 'Personal lead' })];
    renderWithProviders(<NewsMagazine />);
    // The For-You feed returns [] for signed-out readers and for readers with
    // no interests, so the global front is the floor rather than the default.
    expect(screen.getByText('Personal lead')).toBeTruthy();
    expect(screen.queryByText('Global lead')).toBeNull();
  });

  it('sinks already-read stories out of the lead slot', () => {
    // The most visible difference on a return visit: the piece you just opened
    // is no longer the headline.
    state.front = [
      article(1, { title: 'Already read', is_read: true }),
      article(2, { title: 'Fresh one', is_read: false }),
    ];
    renderWithProviders(<NewsMagazine />);
    const lead = screen.getByRole('heading', { level: 3 });
    expect(lead.textContent).toContain('Fresh one');
  });
});
