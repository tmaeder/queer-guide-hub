/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, expectNoNestedInteractive } from '@/test/test-utils';

const state = vi.hoisted(() => ({
  recent: [] as unknown[],
  discovery: [] as unknown[],
  discoveryEnabled: null as boolean | null,
}));

vi.mock('@/hooks/useRecentlyViewed', () => ({
  useRecentlyViewed: () => state.recent,
}));
vi.mock('@/hooks/useRecentlyViewedImages', () => ({
  useRecentlyViewedImages: () => ({}),
}));
vi.mock('@/hooks/useYourLines', () => ({
  useYourLinesDiscovery: (_r: unknown, _l: number, enabled = true) => {
    state.discoveryEnabled = enabled;
    return { data: enabled ? state.discovery : [] };
  },
}));

import { YourLines } from '../YourLines';

const recentItem = (slug: string) => ({
  type: 'venue',
  slug,
  title: `Venue ${slug}`,
  city: 'Zürich',
  country: 'CH',
  image: null,
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
  state.discovery = [];
  state.discoveryEnabled = null;
});

describe('YourLines', () => {
  it('self-hides for a visitor with no thread of their own', () => {
    // Discovery alone is "places in your region" — which is what the Near you
    // band already is. Rendering it here produced two near-identical lists,
    // the second claiming the content was the reader's.
    state.discovery = [discoveryCard('a'), discoveryCard('b')];
    const { container } = renderWithProviders(<YourLines />);
    expect(container.querySelector('h2')).toBeNull();
  });

  it('does not even fire the discovery query for a cold visitor', () => {
    state.discovery = [discoveryCard('a')];
    renderWithProviders(<YourLines />);
    expect(state.discoveryEnabled).toBe(false);
  });

  it('renders once the visitor has history, and leads with it', () => {
    state.recent = [recentItem('cranberry')];
    state.discovery = [discoveryCard('a')];
    renderWithProviders(<YourLines />);

    expect(screen.getByRole('heading', { level: 2 })).toBeTruthy();
    const cards = screen.getAllByRole('listitem');
    // The reader's own item comes first; discovery augments it.
    expect(cards[0].textContent).toContain('Venue cranberry');
    expect(cards.length).toBeGreaterThan(1);
  });

  it('states a reason on every card', () => {
    state.recent = [recentItem('cranberry')];
    state.discovery = [discoveryCard('a')];
    renderWithProviders(<YourLines />);
    // A personalized card with no visible reason is just clutter that happens
    // to be personal.
    expect(screen.getByText(/you looked at this/i)).toBeTruthy();
    expect(screen.getByText('In Zürich')).toBeTruthy();
  });

  it('never nests an interactive element inside the overlay link', () => {
    state.recent = [recentItem('cranberry')];
    state.discovery = [discoveryCard('a')];
    const { container } = renderWithProviders(<YourLines />);
    expectNoNestedInteractive(container);
  });

  it('does not render the same entity twice', () => {
    state.recent = [recentItem('cranberry')];
    // Discovery legitimately returns something the reader just looked at.
    state.discovery = [
      { ...discoveryCard('cranberry'), title: 'Discovered cranberry' },
      discoveryCard('other'),
    ];
    renderWithProviders(<YourLines />);
    const cards = screen.getAllByRole('listitem');
    const titles = cards.map((c) => c.textContent ?? '');
    expect(titles.filter((t) => /cranberry/i.test(t)).length).toBe(1);
  });
});
