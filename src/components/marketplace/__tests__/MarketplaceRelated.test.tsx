/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { hookMock } = vi.hoisted(() => ({ hookMock: vi.fn() }));

vi.mock('@/hooks/useMarketplaceQueries', () => ({
  useMarketplaceListingsRelated: hookMock,
}));
vi.mock('../MarketplaceCard', () => ({
  MarketplaceCard: (p: { listing: { id: string } }) => <div data-testid="card">{p.listing.id}</div>,
}));
vi.mock('../AffiliateDisclosure', () => ({
  AffiliateDisclosure: () => <div data-testid="disc" />,
}));

import { MarketplaceRelated } from '../MarketplaceRelated';

beforeEach(() => hookMock.mockReset());

describe('MarketplaceRelated', () => {
  it('renders nothing while loading', () => {
    hookMock.mockReturnValue({ data: [], loading: true });
    const { container } = render(<MarketplaceRelated />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no items', () => {
    hookMock.mockReturnValue({ data: [], loading: false });
    const { container } = render(<MarketplaceRelated />);
    expect(container.firstChild).toBeNull();
  });

  it('renders custom title + cards + disclosure', () => {
    hookMock.mockReturnValue({ data: [{ id: 'a' }, { id: 'b' }], loading: false });
    render(<MarketplaceRelated title="You might like" />);
    expect(screen.getByRole('heading', { name: /You might like/i })).toBeInTheDocument();
    expect(screen.getAllByTestId('card')).toHaveLength(2);
    expect(screen.getByTestId('disc')).toBeInTheDocument();
  });
});
