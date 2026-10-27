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
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useActiveTrip', () => ({
  useActiveTrip: () => ({
    trip: null,
    addToTrip: vi.fn(),
    removeFromTrip: vi.fn(),
    isInTrip: () => false,
  }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/components/trips/QuietAddToTripButton', () => ({ QuietAddToTripButton: () => null }));

import { expectNoNestedInteractive } from '@/test/test-utils';
import { VenueCard } from '../VenueCard';

// Tags matter: without them the chip row never mounts and the nested-anchor
// regression this fixture guards against would go undetected.
const VENUE = {
  id: 'v1',
  name: 'Bar',
  slug: 'bar',
  city: 'X',
  country: 'Y',
  tags: ['bear-bar', 'drag-show', 'queer-owned'],
} as never;

describe('VenueCard', () => {
  it('renders loading state', () => {
    const { container } = render(
      <MemoryRouter>
        <VenueCard loading />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
  it('renders venue', () => {
    const { container } = render(
      <MemoryRouter>
        <VenueCard venue={VENUE} />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });

  it('exposes exactly one link, pointing at the venue detail page', () => {
    render(
      <MemoryRouter>
        <VenueCard venue={VENUE} />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/venues/bar');
    expect(links[0]).toHaveAccessibleName('Bar');
  });

  it('nests no interactive element inside the card link', () => {
    const { container } = render(
      <MemoryRouter>
        <VenueCard venue={VENUE} />
      </MemoryRouter>,
    );
    expectNoNestedInteractive(container);
  });

  it('draws the category mark in the plate when there is no photo', () => {
    const { container } = render(
      <MemoryRouter>
        <VenueCard venue={{ ...(VENUE as object), category: 'sauna' } as never} />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-fallback="station"]')).not.toBeNull();
    expect(container.querySelector('[data-station-badge]')).toBeNull();
    expect(screen.getByText('Sauna')).toBeInTheDocument();
  });

  it('puts the category mark on a station badge when there is a photo', () => {
    const { container } = render(
      <MemoryRouter>
        <VenueCard
          venue={
            {
              ...(VENUE as object),
              category: 'sauna',
              images: ['https://example.com/a.jpg'],
            } as never
          }
        />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-station-badge="waves"]')).not.toBeNull();
  });
});
