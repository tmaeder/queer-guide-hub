/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useEntityTripStatus', () => ({ useEntityTripStatus: () => ({ data: null }) }));
vi.mock('@/hooks/useVisitedPlaceLookup', () => ({
  useVisitedPlaceLookup: () => ({ has: () => false, mark: vi.fn() }),
}));
vi.mock('@/hooks/useActiveTrip', () => ({
  useActiveTrip: () => ({
    trip: null,
    addToTrip: vi.fn(),
    removeFromTrip: vi.fn(),
    isInTrip: () => false,
  }),
}));
vi.mock('@/hooks/useEventProgramme', () => ({
  useEventProgramme: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/components/trips/QuietAddToTripButton', () => ({ QuietAddToTripButton: () => null }));

import { expectNoNestedInteractive } from '@/test/test-utils';
import { EventCard } from '../EventCard';

// The card orders tags through React Query (kink filter terms); this suite
// renders bare, so the hook is replaced by its loading-state behaviour.
vi.mock('@/hooks/useKinkFilterTerms', () => ({
  useKinkCardTags: (tags?: string[] | null) => (tags ?? []).map((tag) => ({ tag })),
}));

// Tags matter: without them the chip row never mounts and the nested-anchor
// regression this fixture guards against would go undetected.
const EVENT = {
  id: 'e1',
  title: 'Pride',
  slug: 'pride',
  start_date: '2026-06-01',
  tags: ['bear-bar', 'drag-show', 'queer-owned'],
} as never;

describe('EventCard', () => {
  it('says how many events a festival holds, without adding a second link', () => {
    render(
      <MemoryRouter>
        <EventCard event={{ ...(EVENT as object), programme_size: 9 } as never} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /events$/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('shows no programme control on an ordinary event', () => {
    render(
      <MemoryRouter>
        <EventCard event={EVENT} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: /events$/ })).not.toBeInTheDocument();
  });

  it('renders loading state', () => {
    const { container } = render(
      <MemoryRouter>
        <EventCard loading />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
  it('renders event', () => {
    const { container } = render(
      <MemoryRouter>
        <EventCard event={EVENT} />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });

  it('exposes exactly one link, pointing at the event detail page', () => {
    render(
      <MemoryRouter>
        <EventCard event={EVENT} />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/events/pride');
    // Accessible name must match the visible title (WCAG 2.5.3).
    expect(links[0]).toHaveAccessibleName('Pride');
  });

  it('nests no interactive element inside the card link', () => {
    const { container } = render(
      <MemoryRouter>
        <EventCard event={EVENT} />
      </MemoryRouter>,
    );
    expectNoNestedInteractive(container);
  });

  it('draws the event-type mark in the plate when there is no photo', () => {
    const { container } = render(
      <MemoryRouter>
        <EventCard event={{ ...(EVENT as object), event_type: 'pride' } as never} />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-fallback="station"]')).not.toBeNull();
    expect(container.querySelector('[data-station-badge]')).toBeNull();
  });

  it('puts the event-type mark on a station badge when there is a photo', () => {
    const { container } = render(
      <MemoryRouter>
        <EventCard
          event={
            {
              ...(EVENT as object),
              event_type: 'pride',
              image_url: 'https://example.com/a.jpg',
            } as never
          }
        />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-station-badge="flag"]')).not.toBeNull();
  });
});
