/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { hookMock } = vi.hoisted(() => ({ hookMock: vi.fn() }));

vi.mock('@/hooks/useMarketplaceQueries', () => ({ useMarketplaceSubcategoryTiles: hookMock }));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

import { MarketplaceCategoryTiles } from '../MarketplaceCategoryTiles';

beforeEach(() => hookMock.mockReset());

describe('MarketplaceCategoryTiles', () => {
  it('renders 8 skeleton placeholders while loading', () => {
    hookMock.mockReturnValue({ data: [], loading: true });
    const { container } = render(<MarketplaceCategoryTiles />);
    expect(container.querySelectorAll('[aria-hidden="true"].animate-pulse').length).toBe(8);
  });

  it('renders nothing when not loading and no tiles', () => {
    hookMock.mockReturnValue({ data: [], loading: false });
    const { container } = render(<MarketplaceCategoryTiles />);
    expect(container.firstChild).toBeNull();
  });

  it('prettifies tile slugs (snake-case → Title Case)', () => {
    hookMock.mockReturnValue({
      data: [{ slug: 'home_decor', count: 3 }, { slug: 'art-prints', count: 1 }],
      loading: false,
    });
    render(<MarketplaceCategoryTiles />);
    expect(screen.getByText('Home Decor')).toBeInTheDocument();
    expect(screen.getByText('Art Prints')).toBeInTheDocument();
  });

  it('uses singular vs plural listing copy', () => {
    hookMock.mockReturnValue({
      data: [{ slug: 'x', count: 1 }, { slug: 'y', count: 5 }],
      loading: false,
    });
    render(<MarketplaceCategoryTiles />);
    expect(screen.getByText('1 listing')).toBeInTheDocument();
    expect(screen.getByText('5 listings')).toBeInTheDocument();
  });

  it('links each tile to its category route', () => {
    hookMock.mockReturnValue({ data: [{ slug: 'foo', count: 2 }], loading: false });
    render(<MarketplaceCategoryTiles />);
    const tileLink = screen.getByRole('link', { name: /foo/i });
    expect(tileLink).toHaveAttribute('href', '/marketplace/category/foo');
  });
});
