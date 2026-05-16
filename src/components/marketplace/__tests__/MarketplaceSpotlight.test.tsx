/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useSpotlightMock, formatPriceMock, getLinkMock } = vi.hoisted(() => ({
  useSpotlightMock: vi.fn(),
  formatPriceMock: vi.fn(),
  getLinkMock: vi.fn(),
}));

vi.mock('@/hooks/useMarketplaceRows', () => ({ useMarketplaceSpotlight: useSpotlightMock }));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock('../marketplaceHelpers', () => ({
  formatListingPrice: (...a: unknown[]) => formatPriceMock(...a),
  getOutboundLink: (...a: unknown[]) => getLinkMock(...a),
}));

import { MarketplaceSpotlight } from '../MarketplaceSpotlight';

beforeEach(() => {
  useSpotlightMock.mockReset();
  formatPriceMock.mockReset();
  getLinkMock.mockReset();
  formatPriceMock.mockReturnValue({ primary: '$50', secondary: '€45' });
  getLinkMock.mockReturnValue({ url: 'https://shop/x', label: 'Buy', rel: 'noopener sponsored' });
});

describe('MarketplaceSpotlight', () => {
  it('renders nothing while loading', () => {
    useSpotlightMock.mockReturnValue({ listing: null, loading: true });
    const { container } = render(<MarketplaceSpotlight />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no listing', () => {
    useSpotlightMock.mockReturnValue({ listing: null, loading: false });
    const { container } = render(<MarketplaceSpotlight />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when listing has no images', () => {
    useSpotlightMock.mockReturnValue({ listing: { title: 'X', images: [], slug: 'x' }, loading: false });
    const { container } = render(<MarketplaceSpotlight />);
    expect(container.firstChild).toBeNull();
  });

  it('renders title, price, image, View details link, and outbound CTA', () => {
    useSpotlightMock.mockReturnValue({
      listing: {
        title: 'Pride mug',
        slug: 'pride-mug',
        images: ['https://img/x.jpg'],
        business_name: 'Acme',
        description: 'A nice mug.',
      },
      loading: false,
    });
    render(<MarketplaceSpotlight />);
    expect(screen.getByText('Pride mug')).toBeInTheDocument();
    expect(screen.getByText('A nice mug.')).toBeInTheDocument();
    expect(screen.getByText('$50')).toBeInTheDocument();
    expect(screen.getByText('€45')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Pride mug' })).toHaveAttribute('src', 'https://img/x.jpg');
    expect(screen.getByRole('link', { name: /Buy/i })).toHaveAttribute('href', 'https://shop/x');
    expect(screen.getByRole('link', { name: /View details/i })).toHaveAttribute('href', '/marketplace/pride-mug');
  });

  it('omits outbound CTA when no link', () => {
    getLinkMock.mockReturnValue(null);
    useSpotlightMock.mockReturnValue({
      listing: { title: 'X', slug: 'x', images: ['/a.jpg'], business_name: 'b' },
      loading: false,
    });
    render(<MarketplaceSpotlight />);
    expect(screen.queryByRole('link', { name: /Buy/i })).toBeNull();
  });
});
