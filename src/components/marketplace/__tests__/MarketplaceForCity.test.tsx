/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { occMock, occListingsMock } = vi.hoisted(() => ({
  occMock: vi.fn(),
  occListingsMock: vi.fn(),
}));

vi.mock('@/hooks/useMarketplaceQueries', () => ({
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
  occMock.mockReset().mockReturnValue({ data: null, loading: false });
  occListingsMock.mockReset().mockReturnValue({ data: [], loading: false });
});

describe('MarketplaceForCity', () => {
  it('renders nothing while loading', () => {
    occListingsMock.mockReturnValue({ data: [], loading: true });
    const { container } = render(<MarketplaceForCity cityName="Berlin" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when items empty', () => {
    occListingsMock.mockReturnValue({ data: [], loading: false });
    const { container } = render(<MarketplaceForCity cityName="Berlin" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders heading with city name and one card per item', () => {
    occMock.mockReturnValue({ data: 'occ-pride', loading: false });
    occListingsMock.mockReturnValue({
      data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      loading: false,
    });
    render(<MarketplaceForCity cityName="Berlin" cityId="c1" />);
    expect(screen.getByRole('heading', { name: /marketplace in Berlin/i })).toBeInTheDocument();
    expect(screen.getAllByTestId('card')).toHaveLength(3);
  });

  it('shows the occasion caption when the city has an upcoming occasion', () => {
    occMock.mockReturnValue({ data: 'occ-pride', loading: false });
    occListingsMock.mockReturnValue({ data: [{ id: 'a' }, { id: 'b' }], loading: false });
    render(<MarketplaceForCity cityName="Berlin" cityId="c1" />);
    expect(screen.getAllByTestId('card')).toHaveLength(2);
    expect(screen.getByText('Pride is coming to Berlin.')).toBeInTheDocument();
  });

  it('renders nothing when there is no upcoming occasion', () => {
    occMock.mockReturnValue({ data: null, loading: false });
    occListingsMock.mockReturnValue({ data: [], loading: false });
    const { container } = render(<MarketplaceForCity cityName="Berlin" cityId="c1" />);
    expect(container.firstChild).toBeNull();
  });
});
