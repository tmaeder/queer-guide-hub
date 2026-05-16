/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { hookMock } = vi.hoisted(() => ({ hookMock: vi.fn() }));

vi.mock('@/hooks/useMarketplaceQueries', () => ({
  useMarketplaceListingsForCity: hookMock,
}));
vi.mock('../MarketplaceCard', () => ({
  MarketplaceCard: (p: { listing: { id: string } }) => <div data-testid="card">{p.listing.id}</div>,
}));

import { MarketplaceForCity } from '../MarketplaceForCity';

beforeEach(() => hookMock.mockReset());

describe('MarketplaceForCity', () => {
  it('renders nothing while loading', () => {
    hookMock.mockReturnValue({ data: [], loading: true });
    const { container } = render(<MarketplaceForCity cityName="Berlin" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when items empty', () => {
    hookMock.mockReturnValue({ data: [], loading: false });
    const { container } = render(<MarketplaceForCity cityName="Berlin" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders heading with city name and one card per item', () => {
    hookMock.mockReturnValue({
      data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      loading: false,
    });
    render(<MarketplaceForCity cityName="Berlin" />);
    expect(screen.getByRole('heading', { name: /marketplace in Berlin/i })).toBeInTheDocument();
    expect(screen.getAllByTestId('card')).toHaveLength(3);
  });
});
