/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import { Routes, Route } from 'react-router';
import { brandSlug } from '@/lib/marketplaceTaxonomy';

vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: (p: { title: string; subtitle?: string; actions?: React.ReactNode }) => (
    <div><h1>{p.title}</h1><span>{p.subtitle}</span>{p.actions}</div>
  ),
}));
vi.mock('@/components/marketplace/MarketplaceFilteredView', () => ({
  MarketplaceFilteredView: (p: { filters: { brandKey?: string } }) => (
    <div data-testid="filtered" data-brand-key={p.filters.brandKey} />
  ),
}));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

const brandState: { value: unknown; loading: boolean } = { value: null, loading: false };
vi.mock('@/hooks/useMarketplaceBrands', () => ({
  useMarketplaceBrand: () => ({ data: brandState.value, isLoading: brandState.loading }),
}));

import MarketplaceBrand from '../MarketplaceBrand';

function renderAt(path: string) {
  return renderWithProviders(
    <Routes><Route path="/marketplace/brands/:slug" element={<MarketplaceBrand />} /></Routes>,
    { route: path },
  );
}

describe('MarketplaceBrand', () => {
  it('shows not-found for unknown brand', () => {
    brandState.value = null;
    renderAt('/marketplace/brands/nope');
    expect(screen.getByText(/Brand not found/i)).toBeInTheDocument();
  });

  it('renders approved brand with ownership badge, story, and brand-keyed grid', () => {
    brandState.value = {
      slug: 'tomboyx',
      display_name: 'TomboyX',
      brand_key: 'tomboyx',
      product_count: 573,
      website: 'https://tomboyx.com',
      logo_url: null,
      story: 'Underwear for every body.',
      ownership_tags: ['queer_owned'],
      is_approved: true,
    };
    renderAt('/marketplace/brands/tomboyx');
    expect(screen.getByRole('heading', { name: 'TomboyX' })).toBeInTheDocument();
    expect(screen.getByText('Queer-owned')).toBeInTheDocument();
    expect(screen.getByText('Underwear for every body.')).toBeInTheDocument();
    expect(screen.getByTestId('filtered')).toHaveAttribute('data-brand-key', 'tomboyx');
    expect(screen.getByRole('link', { name: /Visit brand site/i })).toHaveAttribute('href', 'https://tomboyx.com');
  });

  it('renders un-reviewed brand without trust fields', () => {
    brandState.value = {
      slug: 'some-brand',
      display_name: 'Some Brand',
      brand_key: 'some brand',
      product_count: 12,
      website: null,
      logo_url: null,
      story: null,
      ownership_tags: [],
      is_approved: false,
    };
    renderAt('/marketplace/brands/some-brand');
    expect(screen.getByRole('heading', { name: 'Some Brand' })).toBeInTheDocument();
    expect(screen.queryByText('Queer-owned')).toBeNull();
  });
});

describe('brandSlug', () => {
  it('mirrors the SQL slug rule', () => {
    expect(brandSlug('TomboyX')).toBe('tomboyx');
    expect(brandSlug('  Big Bud   Press ')).toBe('big-bud-press');
    expect(brandSlug("Ash + Chess & Co.")).toBe('ash-chess-co');
    expect(brandSlug('***')).toBeNull();
    expect(brandSlug(null)).toBeNull();
  });
});
