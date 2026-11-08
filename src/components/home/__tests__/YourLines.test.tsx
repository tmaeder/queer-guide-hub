/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RecentlyViewedItem } from '@/lib/recentlyViewed';
import { screen } from '@testing-library/react';
import { renderWithProviders, expectNoNestedInteractive } from '@/test/test-utils';

const state = vi.hoisted(() => ({
  recent: [] as RecentlyViewedItem[],
  images: {} as Record<string, string | null>,
  discovery: [] as unknown[],
  discoveryEnabled: null as boolean | null,
}));

vi.mock('@/hooks/useRecentlyViewedImages', () => ({
  useRecentlyViewedImages: () => state.images,
}));
vi.mock('@/hooks/useYourLines', () => ({
  useYourLinesDiscovery: (_r: unknown, _l: number, enabled = true) => {
    state.discoveryEnabled = enabled;
    return { data: enabled ? state.discovery : [] };
  },
}));

import { YourLines } from '../YourLines';

const recentItem = (slug: string): RecentlyViewedItem => ({
  type: 'venue',
  slug,
  title: `Venue ${slug}`,
  city: 'Zürich',
  country: 'CH',
  ts: 0,
});

const discoveryCard = (slug: string) => ({
  type: 'venue',
  slug,
  href: `/venues/${slug}`,
  title: `Discovered ${slug}`,
  subtitle: 'Zürich, CH',
  reason: 'In Zürich',
  image: null,
});

beforeEach(() => {
  state.recent = [];
  state.images = {};
  state.discovery = [];
  state.discoveryEnabled = null;
});

describe('YourLines', () => {
  it('self-hides for a visitor with no thread of their own', () => {
    // Discovery alone is "places in your region" — which is what the Near you
    // band already is. Rendering it here produced two near-identical lists,
    // the second claiming the content was the reader's.
    state.discovery = [discoveryCard('a'), discoveryCard('b')];
    const { container } = renderWithProviders(<YourLines recent={state.recent} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not even fire the discovery query for a cold visitor', () => {
    state.discovery = [discoveryCard('a')];
    renderWithProviders(<YourLines recent={state.recent} />);
    expect(state.discoveryEnabled).toBe(false);
  });

  it('renders once the visitor has history, and leads with it', () => {
    state.recent = [recentItem('cranberry')];
    state.discovery = [discoveryCard('a')];
    renderWithProviders(<YourLines recent={state.recent} />);

    const cards = screen.getAllByRole('listitem');
    // The reader's own item comes first; discovery augments it.
    expect(cards[0].textContent).toContain('Venue cranberry');
    expect(cards.length).toBeGreaterThan(1);
  });

  it('uses a calendar tile for an unresolved event and only shows its current cover', () => {
    const recent: RecentlyViewedItem[] = [
      {
        ...recentItem('die-montagsspieler'),
        type: 'event',
        title: 'Die Montagsspieler',
        image: 'https://cdn.example/retired.jpg',
      },
    ];
    const { container, rerender } = renderWithProviders(<YourLines recent={recent} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-fallback="station"]')).toBeInTheDocument();

    state.images = { 'event:die-montagsspieler': 'https://cdn.example/official.jpg' };
    rerender(<YourLines recent={recent} />);
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.example/official.jpg',
    );

    state.images = { 'event:die-montagsspieler': null };
    rerender(<YourLines recent={recent} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('keeps room for recommendations even when the visitor has a full history', () => {
    state.recent = Array.from({ length: 8 }, (_, i) => recentItem(String(i)));
    state.discovery = [discoveryCard('7'), discoveryCard('new')];
    renderWithProviders(<YourLines recent={state.recent} />);

    expect(screen.getByRole('link', { name: 'Discovered new' })).toHaveAttribute(
      'href',
      '/venues/new',
    );
    expect(screen.queryByRole('link', { name: 'Discovered 7' })).not.toBeInTheDocument();
  });

  it('states a reason on every card', () => {
    state.recent = [recentItem('cranberry')];
    state.discovery = [discoveryCard('a')];
    renderWithProviders(<YourLines recent={state.recent} />);
    expect(screen.getByText('Venue')).toBeTruthy();
    expect(screen.getByText('In Zürich')).toBeTruthy();
  });

  it('never nests an interactive element inside the overlay link', () => {
    state.recent = [recentItem('cranberry')];
    state.discovery = [discoveryCard('a')];
    const { container } = renderWithProviders(<YourLines recent={state.recent} />);
    expectNoNestedInteractive(container);
  });

  it('does not render the same entity twice', () => {
    state.recent = [recentItem('cranberry')];
    // Discovery legitimately returns something the reader just looked at.
    state.discovery = [
      { ...discoveryCard('cranberry'), title: 'Discovered cranberry' },
      discoveryCard('other'),
    ];
    renderWithProviders(<YourLines recent={state.recent} />);
    const cards = screen.getAllByRole('listitem');
    const titles = cards.map((c) => c.textContent ?? '');
    expect(titles.filter((t) => /cranberry/i.test(t)).length).toBe(1);
  });
});
