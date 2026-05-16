/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { hookMock } = vi.hoisted(() => ({ hookMock: vi.fn() }));

vi.mock('@/hooks/useMarketplaceQueries', () => ({
  useMarketplaceSimilarListings: hookMock,
}));
vi.mock('../MarketplaceCard', () => ({
  MarketplaceCard: (p: { loading?: boolean; listing?: { id: string } }) =>
    p.loading ? <div data-testid="skeleton" /> : <div data-testid="card">{p.listing?.id}</div>,
}));

import { MarketplaceSimilarItems } from '../MarketplaceSimilarItems';

const listing = { id: 'l1' } as never;
beforeEach(() => hookMock.mockReset());

describe('MarketplaceSimilarItems', () => {
  it('renders skeleton cards while loading', () => {
    hookMock.mockReturnValue({ data: [], loading: true });
    render(<MarketplaceSimilarItems listing={listing} limit={3} />);
    expect(screen.getAllByTestId('skeleton')).toHaveLength(3);
  });

  it('renders nothing when not loading and items empty', () => {
    hookMock.mockReturnValue({ data: [], loading: false });
    const { container } = render(<MarketplaceSimilarItems listing={listing} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one card per result', () => {
    hookMock.mockReturnValue({ data: [{ id: 'a' }, { id: 'b' }], loading: false });
    render(<MarketplaceSimilarItems listing={listing} />);
    expect(screen.getAllByTestId('card')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: /Similar items/i })).toBeInTheDocument();
  });
});
