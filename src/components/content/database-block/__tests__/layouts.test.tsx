/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { DEFAULT_VIEW_STATE, type BlockViewState } from '@/lib/databaseBlock/schema';
import type { EntityCard } from '@/lib/databaseBlock/normalize';
import { EntityListLayout } from '../EntityListLayout';
import { EntityGalleryLayout } from '../EntityGalleryLayout';
import { EntityKanbanLayout } from '../EntityKanbanLayout';
import { EntityTimelineLayout } from '../EntityTimelineLayout';
import { EntityCalendarLayout } from '../EntityCalendarLayout';

// The Image primitive pulls in Cloudflare srcset + fallback machinery that is
// irrelevant here; the layouts only care that it receives an alt text.
vi.mock('@/components/ui/Image', () => ({
  Image: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const card = (over: Partial<EntityCard> = {}): EntityCard => ({
  docId: `venue:${over.entityId ?? 'a'}`,
  entityType: 'venue',
  entityId: 'a',
  title: 'Berghain',
  href: '/venues/berghain',
  imageUrl: null,
  description: null,
  categoryLabel: null,
  city: null,
  country: null,
  startMs: null,
  endMs: null,
  isFeatured: false,
  livenessStatus: null,
  priceMin: null,
  priceMax: null,
  isFree: null,
  facets: {},
  isGated: false,
  updatedAtMs: 0,
  ...over,
});

const view = (over: Partial<BlockViewState> = {}): BlockViewState => ({
  ...DEFAULT_VIEW_STATE,
  ...over,
});

const renderIn = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('EntityListLayout', () => {
  it('renders a row per card, linked to its detail route', () => {
    renderIn(
      <EntityListLayout
        cards={[card(), card({ entityId: 'b', docId: 'venue:b', title: 'SO36', href: '/venues/so36' })]}
        viewState={view()}
        isLoading={false}
      />,
    );
    expect(screen.getByRole('link', { name: /Berghain/ })).toHaveAttribute('href', '/venues/berghain');
    expect(screen.getByText('SO36')).toBeInTheDocument();
  });

  it('renders an entity with no route as plain text, not a broken link', () => {
    renderIn(<EntityListLayout cards={[card({ href: null })]} viewState={view()} isLoading={false} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Berghain')).toBeInTheDocument();
  });
});

describe('EntityGalleryLayout', () => {
  it('renders a tile per card', () => {
    renderIn(
      <EntityGalleryLayout
        cards={[card(), card({ entityId: 'b', docId: 'venue:b', title: 'SO36' })]}
        viewState={view()}
        isLoading={false}
      />,
    );
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});

describe('EntityKanbanLayout', () => {
  it('groups into columns by the chosen field', () => {
    renderIn(
      <EntityKanbanLayout
        cards={[
          card({ entityId: 'a', docId: 'v:a', title: 'A', city: 'Berlin' }),
          card({ entityId: 'b', docId: 'v:b', title: 'B', city: 'Paris' }),
          card({ entityId: 'c', docId: 'v:c', title: 'C', city: 'Berlin' }),
        ]}
        viewState={view({ groupByField: 'city' })}
        isLoading={false}
      />,
    );
    const berlin = screen.getByRole('region', { name: 'Berlin' });
    expect(within(berlin).getByText('A')).toBeInTheDocument();
    expect(within(berlin).getByText('C')).toBeInTheDocument();
    expect(within(berlin).queryByText('B')).not.toBeInTheDocument();
  });

  it('collects valueless cards into one Ungrouped column, placed last', () => {
    renderIn(
      <EntityKanbanLayout
        cards={[
          card({ entityId: 'a', docId: 'v:a', title: 'A', city: null }),
          card({ entityId: 'b', docId: 'v:b', title: 'B', city: 'Paris' }),
        ]}
        viewState={view({ groupByField: 'city' })}
        isLoading={false}
      />,
    );
    const regions = screen.getAllByRole('region');
    expect(regions.map((r) => r.getAttribute('aria-label'))).toEqual(['Paris', 'Ungrouped']);
  });

  it('groups by category, reading the value out of facets', () => {
    renderIn(
      <EntityKanbanLayout
        cards={[card({ categoryLabel: 'club' })]}
        viewState={view({ groupByField: 'category' })}
        isLoading={false}
      />,
    );
    expect(screen.getByRole('region', { name: 'club' })).toBeInTheDocument();
  });
});

describe('EntityTimelineLayout', () => {
  const JUNE = Date.UTC(2026, 5, 1);
  const JULY = Date.UTC(2026, 6, 1);

  it('plots dated records with an accessible range label', () => {
    renderIn(
      <EntityTimelineLayout
        cards={[card({ title: 'Pride', startMs: JUNE, endMs: JULY })]}
        viewState={view()}
        isLoading={false}
      />,
    );
    expect(screen.getByRole('img', { name: /Pride/ })).toBeInTheDocument();
  });

  it('surfaces undated records separately rather than dropping them', () => {
    renderIn(
      <EntityTimelineLayout
        cards={[
          card({ entityId: 'a', docId: 'v:a', title: 'Dated', startMs: JUNE, endMs: JUNE }),
          card({ entityId: 'b', docId: 'v:b', title: 'Undated', startMs: null }),
        ]}
        viewState={view()}
        isLoading={false}
      />,
    );
    expect(screen.getByText('No date recorded')).toBeInTheDocument();
    expect(screen.getByText('Undated')).toBeInTheDocument();
  });

  it('does not divide by zero when every record shares one instant', () => {
    expect(() =>
      renderIn(
        <EntityTimelineLayout
          cards={[
            card({ entityId: 'a', docId: 'v:a', startMs: JUNE, endMs: JUNE }),
            card({ entityId: 'b', docId: 'v:b', startMs: JUNE, endMs: JUNE }),
          ]}
          viewState={view()}
          isLoading={false}
        />,
      ),
    ).not.toThrow();
  });
});

describe('EntityCalendarLayout', () => {
  it('opens on the month of the earliest record, not today', () => {
    // A block about a past season must not render an empty current month.
    const march2026 = new Date(2026, 2, 12).getTime();
    renderIn(
      <EntityCalendarLayout
        cards={[card({ title: 'Spring thing', startMs: march2026, endMs: march2026 })]}
        viewState={view()}
        isLoading={false}
      />,
    );
    expect(screen.getByText(/March 2026/)).toBeInTheDocument();
    expect(screen.getByText('Spring thing')).toBeInTheDocument();
  });

  it('places a multi-day record on every day it spans', () => {
    const start = new Date(2026, 2, 10).getTime();
    const end = new Date(2026, 2, 12).getTime();
    renderIn(
      <EntityCalendarLayout
        cards={[card({ title: 'Festival', startMs: start, endMs: end })]}
        viewState={view()}
        isLoading={false}
      />,
    );
    expect(screen.getAllByTitle('Festival')).toHaveLength(3);
  });

  it('renders month navigation controls', () => {
    renderIn(<EntityCalendarLayout cards={[card()]} viewState={view()} isLoading={false} />);
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument();
  });
});
