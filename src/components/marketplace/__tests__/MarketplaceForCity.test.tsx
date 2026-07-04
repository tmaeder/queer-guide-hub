/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { cityMock, occMock, occListingsMock } = vi.hoisted(() => ({
  cityMock: vi.fn(),
  occMock: vi.fn(),
  occListingsMock: vi.fn(),
}));

vi.mock('@/hooks/useMarketplaceQueries', () => ({
  useMarketplaceListingsForCity: cityMock,
  useCityUpcomingOccasion: occMock,
  useMarketplaceListingsForOccasion: occListingsMock,
}));
vi.mock('../MarketplaceCard', () => ({
  MarketplaceCard: (p: { listing?: { id: string }; loading?: boolean }) => (
    <div data-testid="card">{p.listing?.id}</div>
  ),
}));

import { MarketplaceForCity } from '../MarketplaceForCity';

beforeEach(() => {
  cityMock.mockReset();
  occMock.mockReset().mockReturnValue({ data: null, loading: false });
  occListingsMock.mockReset().mockReturnValue({ data: [], loading: false });
});

describe('MarketplaceForCity', () => {
  it('renders nothing while loading', () => {
    cityMock.mockReturnValue({ data: [], loading: true });
    const { container } = render(<MarketplaceForCity cityName="Berlin" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when items empty', () => {
    cityMock.mockReturnValue({ data: [], loading: false });
    const { container } = render(<MarketplaceForCity cityName="Berlin" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders heading with city name and one card per item', () => {
    cityMock.mockReturnValue({
      data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      loading: false,
    });
    render(<MarketplaceForCity cityName="Berlin" />);
    expect(screen.getByRole('heading', { name: /marketplace in Berlin/i })).toBeInTheDocument();
    expect(screen.getAllByTestId('card')).toHaveLength(3);
  });

  it('unions occasion listings and shows the occasion caption', () => {
    cityMock.mockReturnValue({ data: [{ id: 'a' }], loading: false });
    occMock.mockReturnValue({ data: 'occ-pride', loading: false });
    occListingsMock.mockReturnValue({ data: [{ id: 'a' }, { id: 'b' }], loading: false });
    render(<MarketplaceForCity cityName="Berlin" cityId="c1" />);
    // Deduped union: a (local) + b (occasion).
    expect(screen.getAllByTestId('card')).toHaveLength(2);
    expect(screen.getByText('Pride is coming to Berlin.')).toBeInTheDocument();
  });
});
