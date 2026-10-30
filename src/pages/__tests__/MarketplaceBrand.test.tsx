/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { renderWithProviders, screen } from '@/test/test-utils';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/i18n/locales/en.json';
import { fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { brandSlug } from '@/lib/marketplaceTaxonomy';

vi.mock('@/components/marketplace/MarketplaceFilteredView', () => ({
  MarketplaceFilteredView: (p: { filters: { brandKey?: string; includeAdult?: boolean } }) => (
    <div
      data-testid="filtered"
      data-brand-key={p.filters.brandKey}
      data-include-adult={String(Boolean(p.filters.includeAdult))}
    />
  ),
}));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

const ageState = { acknowledged: false };
vi.mock('@/hooks/useAdultContent', () => ({
  useAdultAcknowledgement: () => ({ acknowledged: ageState.acknowledged }),
}));
vi.mock('@/components/marketplace/AdultContentGate', () => ({
  AdultContentGate: (p: { active: boolean; fallbackPath: string }) => (
    <div data-testid="age-gate" data-active={String(p.active)} data-fallback={p.fallbackPath} />
  ),
}));
beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
});
beforeEach(() => {
  ageState.acknowledged = false;
});

const brandState: { value: unknown; loading: boolean } = { value: null, loading: false };
const adminState = { canManageContent: false, brandId: null as string | null };
const brandIdCalls: Array<[string | undefined, boolean]> = [];
vi.mock('@/hooks/useMarketplaceBrands', () => ({
  useMarketplaceBrand: () => ({ data: brandState.value, isLoading: brandState.loading }),
  useMarketplaceBrandId: (slug: string | undefined, enabled: boolean) => {
    brandIdCalls.push([slug, enabled]);
    return { data: enabled ? adminState.brandId : undefined };
  },
}));
vi.mock('@/hooks/useAdminRoles', () => ({
  useAdminRoles: () => ({ canManageContent: () => adminState.canManageContent, loading: false }),
}));
vi.mock('@/components/admin/AdminEditButton', () => ({
  AdminEditButton: (p: { contentType: string; contentId: string; exportable?: boolean }) => (
    <div
      data-testid="admin-edit"
      data-type={p.contentType}
      data-id={p.contentId}
      data-exportable={String(Boolean(p.exportable))}
    />
  ),
}));

import MarketplaceBrand from '../MarketplaceBrand';

function renderAt(path: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/marketplace/brands/:slug" element={<MarketplaceBrand />} />
    </Routes>,
    { route: path },
  );
}

describe('MarketplaceBrand', () => {
  it('shows a linked photographer and license for an attributed portrait', () => {
    brandState.value = {
      slug: 'author',
      display_name: 'Author',
      brand_key: 'author',
      product_count: 1,
      website: null,
      logo_url: 'https://upload.wikimedia.org/portrait.jpg',
      story: null,
      ownership_tags: [],
      is_approved: true,
      logo_credit: {
        attribution: 'Photographer',
        license: 'CC BY 4.0',
        source_url: 'https://commons.wikimedia.org/wiki/File:Portrait.jpg',
        license_url: 'https://creativecommons.org/licenses/by/4.0/',
      },
    };
    renderAt('/marketplace/brands/author');
    expect(screen.getByRole('link', { name: /Photographer.*CC BY 4.0/ })).toHaveAttribute(
      'href',
      'https://commons.wikimedia.org/wiki/File:Portrait.jpg',
    );
    expect(screen.getByText(/via Wikimedia Commons/)).toBeInTheDocument();
  });

  it.each([
    ['https://www.author.example/press', 'author.example'],
    ['https://commons.wikimedia.org.author.example/press', 'commons.wikimedia.org.author.example'],
  ])('credits the actual portrait source at %s', (sourceUrl, sourceLabel) => {
    brandState.value = {
      slug: 'author',
      display_name: 'Author',
      brand_key: 'author',
      product_count: 1,
      website: null,
      logo_url: 'https://images.example/portrait.jpg',
      story: null,
      ownership_tags: [],
      is_approved: true,
      logo_credit: {
        attribution: 'Photographer',
        license: null,
        source_url: sourceUrl,
        license_url: null,
      },
    };
    renderAt('/marketplace/brands/author');
    expect(screen.getByRole('link', { name: `Photographer · ${sourceLabel}` })).toHaveAttribute(
      'href',
      sourceUrl,
    );
    expect(screen.queryByText(/via Wikimedia Commons/)).not.toBeInTheDocument();
  });

  it('shows not-found for unknown brand', () => {
    brandState.value = null;
    renderAt('/marketplace/brands/nope');
    expect(screen.getByText(/No maker here/i)).toBeInTheDocument();
  });

  it('noindexes an unknown brand instead of shipping the plain "Brand" title indexable', () => {
    // `useMeta` never set `noIndex` on the not-found branch — a dead brand
    // slug published a real (if generic) title with no robots tag, same
    // soft-404 shape as TagDetail's fix.
    brandState.value = null;
    renderAt('/marketplace/brands/nope');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex,nofollow',
    );
  });

  it('offers the makers directory as the way out of a dead end', () => {
    // The whole point of adding /marketplace/brands: a missing maker used to
    // dead-end at "Brand not found" with only the hub to go back to.
    brandState.value = null;
    renderAt('/marketplace/brands/nope');
    expect(screen.getByRole('link', { name: /All makers/i })).toHaveAttribute(
      'href',
      '/marketplace/brands',
    );
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
    expect(screen.getByRole('link', { name: /Visit brand site/i })).toHaveAttribute(
      'href',
      'https://tomboyx.com',
    );
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

describe('maker content visibility', () => {
  const maker = {
    slug: 'example',
    display_name: 'Example',
    brand_key: 'example',
    product_count: 5,
    website: null,
    logo_url: null,
    story: null,
    ownership_tags: [],
    is_approved: true,
  };
  it('keeps adult products out of the initial query and labels the catalogue total', () => {
    brandState.value = maker;
    renderAt('/marketplace/brands/example');
    expect(screen.getByTestId('filtered')).toHaveAttribute('data-include-adult', 'false');
    expect(screen.getByText('5 total listings')).toBeInTheDocument();
    expect(screen.getByTestId('age-gate')).toHaveAttribute('data-active', 'false');
  });
  it('honors an existing age confirmation on maker pages', () => {
    ageState.acknowledged = true;
    brandState.value = maker;
    renderAt('/marketplace/brands/example');
    expect(screen.getByTestId('filtered')).toHaveAttribute('data-include-adult', 'true');
    expect(screen.queryByRole('button', { name: 'Show adult listings (18+)' })).toBeNull();
  });
  it('requests the existing age gate without enabling adult queries early', () => {
    brandState.value = maker;
    renderAt('/marketplace/brands/example');
    fireEvent.click(screen.getByRole('button', { name: 'Show adult listings (18+)' }));
    expect(screen.getByTestId('age-gate')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('age-gate')).toHaveAttribute('data-fallback', '/marketplace/brands');
    expect(screen.getByTestId('filtered')).toHaveAttribute('data-include-adult', 'false');
  });
});

describe('brandSlug', () => {
  it('mirrors the SQL slug rule', () => {
    expect(brandSlug('TomboyX')).toBe('tomboyx');
    expect(brandSlug('  Big Bud   Press ')).toBe('big-bud-press');
    expect(brandSlug('Ash + Chess & Co.')).toBe('ash-chess-co');
    expect(brandSlug('***')).toBeNull();
    expect(brandSlug(null)).toBeNull();
  });

  describe('staff admin menu', () => {
    const tomboyx = {
      slug: 'tomboyx',
      display_name: 'TomboyX',
      brand_key: 'tomboyx',
      product_count: 573,
      website: null,
      logo_url: null,
      story: null,
      ownership_tags: [],
      is_approved: true,
    };

    it('gives staff the record export, addressed by the brand id', () => {
      brandState.value = tomboyx;
      adminState.canManageContent = true;
      adminState.brandId = 'brand-uuid-1';
      renderAt('/marketplace/brands/tomboyx');
      const btn = screen.getByTestId('admin-edit');
      expect(btn).toHaveAttribute('data-type', 'marketplace_brands');
      expect(btn).toHaveAttribute('data-id', 'brand-uuid-1');
      expect(btn).toHaveAttribute('data-exportable', 'true');
    });

    it('never looks up the id or shows the menu for a public visitor', () => {
      brandState.value = tomboyx;
      adminState.canManageContent = false;
      adminState.brandId = 'brand-uuid-1';
      brandIdCalls.length = 0;
      renderAt('/marketplace/brands/tomboyx');
      expect(screen.queryByTestId('admin-edit')).not.toBeInTheDocument();
      expect(brandIdCalls.length).toBeGreaterThan(0);
      expect(brandIdCalls.every(([, enabled]) => enabled === false)).toBe(true);
    });
  });
});
