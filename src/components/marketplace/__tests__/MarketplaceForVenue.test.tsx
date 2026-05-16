/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { hookMock } = vi.hoisted(() => ({ hookMock: vi.fn() }));

vi.mock('@/hooks/useMarketplaceQueries', () => ({
  useMarketplaceListingsForVenue: hookMock,
}));
vi.mock('../MarketplaceCard', () => ({
  MarketplaceCard: (p: { listing: { id: string } }) => <div data-testid="card">{p.listing.id}</div>,
}));

import { MarketplaceForVenue } from '../MarketplaceForVenue';

beforeEach(() => hookMock.mockReset());

describe('MarketplaceForVenue', () => {
  it('renders nothing while loading', () => {
    hookMock.mockReturnValue({ data: [], loading: true });
    const { container } = render(<MarketplaceForVenue venueId="v1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no items', () => {
    hookMock.mockReturnValue({ data: [], loading: false });
    const { container } = render(<MarketplaceForVenue venueId="v1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders custom title + cards', () => {
    hookMock.mockReturnValue({ data: [{ id: 'a' }], loading: false });
    render(<MarketplaceForVenue venueId="v1" title="From here" />);
    expect(screen.getByRole('heading', { name: /From here/i })).toBeInTheDocument();
    expect(screen.getByTestId('card')).toBeInTheDocument();
  });
});
