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

  it('groups fine subcategories into department umbrellas', () => {
    hookMock.mockReturnValue({
      data: [
        { slug: 'sex_toys', count: 2931 },
        { slug: 'anal_toys', count: 757 },
        { slug: 'underwear_and_swimwear', count: 1758 },
      ],
      loading: false,
    });
    render(<MarketplaceCategoryTiles />);
    // sex_toys + anal_toys collapse into one Intimacy tile with summed count.
    expect(screen.getByText('Intimacy')).toBeInTheDocument();
    expect(screen.getByText('3,688 listings')).toBeInTheDocument();
    expect(screen.getByText('Underwear')).toBeInTheDocument();
    expect(screen.queryByText('Sex Toys')).toBeNull();
  });

  it('uses singular vs plural listing copy', () => {
    hookMock.mockReturnValue({
      data: [{ slug: 'swimwear', count: 1 }, { slug: 'jewelry_and_pins', count: 5 }],
      loading: false,
    });
    render(<MarketplaceCategoryTiles />);
    expect(screen.getByText('1 listing')).toBeInTheDocument();
    expect(screen.getByText('5 listings')).toBeInTheDocument();
  });

  it('links each department tile to its category route', () => {
    hookMock.mockReturnValue({ data: [{ slug: 'books_and_art', count: 2 }], loading: false });
    render(<MarketplaceCategoryTiles />);
    const tileLink = screen.getByRole('link', { name: /books & art/i });
    expect(tileLink).toHaveAttribute('href', '/marketplace/category/books_art');
  });

  it('SFW departments precede the adult umbrellas', () => {
    hookMock.mockReturnValue({
      data: [
        { slug: 'sex_toys', count: 100 },
        { slug: 'apparel_and_accessories', count: 50 },
      ],
      loading: false,
    });
    render(<MarketplaceCategoryTiles />);
    const labels = screen.getAllByRole('link').map((a) => a.textContent ?? '');
    const apparelIdx = labels.findIndex((t) => t.includes('Apparel'));
    const intimacyIdx = labels.findIndex((t) => t.includes('Intimacy'));
    expect(apparelIdx).toBeGreaterThanOrEqual(0);
    expect(apparelIdx).toBeLessThan(intimacyIdx);
  });
});
