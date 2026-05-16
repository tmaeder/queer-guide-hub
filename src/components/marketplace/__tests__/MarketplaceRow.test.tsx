/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { hookMock } = vi.hoisted(() => ({ hookMock: vi.fn() }));

vi.mock('@/hooks/useMarketplaceRows', () => ({ useMarketplaceRow: hookMock }));
vi.mock('../MarketplaceCard', () => ({
  MarketplaceCard: (p: { loading?: boolean; listing?: { id: string } }) =>
    p.loading ? <div data-testid="skeleton" /> : <div data-testid="card">{p.listing?.id}</div>,
}));

import { MarketplaceRow } from '../MarketplaceRow';

beforeEach(() => hookMock.mockReset());

describe('MarketplaceRow', () => {
  it('renders 4 skeleton cards while loading', () => {
    hookMock.mockReturnValue({ data: [], loading: true, error: null });
    render(<MarketplaceRow rowKey={'trending' as never} title="Trending" />);
    expect(screen.getAllByTestId('skeleton')).toHaveLength(4);
  });

  it('renders nothing on error', () => {
    hookMock.mockReturnValue({ data: [], loading: false, error: new Error('x') });
    const { container } = render(<MarketplaceRow rowKey={'trending' as never} title="Trending" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no items + no error + not loading', () => {
    hookMock.mockReturnValue({ data: [], loading: false, error: null });
    const { container } = render(<MarketplaceRow rowKey={'trending' as never} title="Trending" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders heading + subtitle + one card per item', () => {
    hookMock.mockReturnValue({
      data: [{ id: 'a' }, { id: 'b' }],
      loading: false,
      error: null,
    });
    render(<MarketplaceRow rowKey={'trending' as never} title="Trending" subtitle="hot stuff" />);
    expect(screen.getByRole('heading', { name: 'Trending' })).toBeInTheDocument();
    expect(screen.getByText('hot stuff')).toBeInTheDocument();
    expect(screen.getAllByTestId('card')).toHaveLength(2);
  });

  it('scroll buttons invoke scrollBy on the scroller', () => {
    hookMock.mockReturnValue({ data: [{ id: 'a' }], loading: false, error: null });
    const spy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollBy', { configurable: true, value: spy });
    render(<MarketplaceRow rowKey={'trending' as never} title="Trending" />);
    fireEvent.click(screen.getByRole('button', { name: /Scroll Trending left/i }));
    fireEvent.click(screen.getByRole('button', { name: /Scroll Trending right/i }));
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
