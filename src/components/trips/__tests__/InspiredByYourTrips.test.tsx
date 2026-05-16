/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useDiscoverableTripsMock, navigateFn } = vi.hoisted(() => ({
  useDiscoverableTripsMock: vi.fn(),
  navigateFn: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => navigateFn }));
vi.mock('@/hooks/useDiscoverableTrips', () => ({ useDiscoverableTrips: useDiscoverableTripsMock }));
vi.mock('@/components/trips/PublicTripCard', () => ({
  PublicTripCard: (p: { trip: { id: string } }) => <div data-testid="card">{p.trip.id}</div>,
}));

import { InspiredByYourTrips } from '../InspiredByYourTrips';

beforeEach(() => {
  navigateFn.mockReset();
  useDiscoverableTripsMock.mockReset();
});

describe('InspiredByYourTrips', () => {
  it('renders nothing while loading', () => {
    useDiscoverableTripsMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<InspiredByYourTrips ownTrips={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no public trips match', () => {
    useDiscoverableTripsMock.mockReturnValue({ data: [], isLoading: false });
    const { container } = render(<InspiredByYourTrips ownTrips={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('prefers same-city trips, capped at 3', () => {
    useDiscoverableTripsMock.mockReturnValue({
      data: [
        { id: 'p1', primary_city_id: 'c1' },
        { id: 'p2', primary_city_id: 'c1' },
        { id: 'p3', primary_city_id: 'c1' },
        { id: 'p4', primary_city_id: 'c2' },
      ],
      isLoading: false,
    });
    render(<InspiredByYourTrips ownTrips={[{ id: 'o1', primary_city_id: 'c1' } as never]} />);
    const cards = screen.getAllByTestId('card');
    expect(cards.map(c => c.textContent)).toEqual(['p1', 'p2', 'p3']);
  });

  it('fills with non-matching trips up to 3 when same-city < 3', () => {
    useDiscoverableTripsMock.mockReturnValue({
      data: [
        { id: 'p1', primary_city_id: 'c1' },
        { id: 'p2', primary_city_id: 'c2' },
        { id: 'p3', primary_city_id: 'c3' },
      ],
      isLoading: false,
    });
    render(<InspiredByYourTrips ownTrips={[{ id: 'o1', primary_city_id: 'c1' } as never]} />);
    expect(screen.getAllByTestId('card')).toHaveLength(3);
  });

  it('excludes the user own trips', () => {
    useDiscoverableTripsMock.mockReturnValue({
      data: [
        { id: 'o1', primary_city_id: 'c1' },
        { id: 'p1', primary_city_id: 'c2' },
        { id: 'p2', primary_city_id: 'c3' },
        { id: 'p3', primary_city_id: 'c4' },
      ],
      isLoading: false,
    });
    render(<InspiredByYourTrips ownTrips={[{ id: 'o1', primary_city_id: 'c1' } as never]} />);
    const ids = screen.getAllByTestId('card').map(c => c.textContent);
    expect(ids).not.toContain('o1');
  });
});
