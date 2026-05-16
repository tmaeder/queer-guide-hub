/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

const { hookMock } = vi.hoisted(() => ({ hookMock: vi.fn() }));

vi.mock('@/hooks/useMeta', () => ({ useMeta: vi.fn() }));
vi.mock('@/hooks/useMarketplaceListingsByIds', () => ({
  useMarketplaceListingsByIds: hookMock,
}));
vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: (p: { title: string; subtitle?: string }) => (
    <div><h1>{p.title}</h1><p>{p.subtitle}</p></div>
  ),
}));
vi.mock('@/components/marketplace/MarketplaceCard', () => ({
  MarketplaceCard: (p: { loading?: boolean; listing?: { id: string } }) =>
    p.loading ? <div data-testid="sk" /> : <div data-testid="card">{p.listing?.id}</div>,
}));
vi.mock('@/components/marketplace/AffiliateDisclosure', () => ({
  AffiliateDisclosure: () => <div data-testid="disc" />,
}));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

import MarketplaceShare from '../MarketplaceShare';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/marketplace/share" element={<MarketplaceShare />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => hookMock.mockReset());

const ids = ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'ffffffff-1111-2222-3333-444444444444'];

describe('MarketplaceShare', () => {
  it('shows empty subtitle when no ids', () => {
    hookMock.mockReturnValue({ data: [], loading: false });
    renderAt('/marketplace/share');
    expect(screen.getByText(/No listings selected/)).toBeInTheDocument();
  });

  it('renders skeleton cards while loading', () => {
    hookMock.mockReturnValue({ data: [], loading: true });
    renderAt(`/marketplace/share?ids=${ids.join(',')}`);
    expect(screen.getAllByTestId('sk').length).toBeGreaterThan(0);
  });

  it('renders one card per item', () => {
    hookMock.mockReturnValue({ data: [{ id: 'a' }, { id: 'b' }], loading: false });
    renderAt(`/marketplace/share?ids=${ids.join(',')}&title=My+list`);
    expect(screen.getAllByTestId('card')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'My list' })).toBeInTheDocument();
  });

  it('filters out non-UUID ids', () => {
    hookMock.mockReturnValue({ data: [], loading: false });
    renderAt('/marketplace/share?ids=not-a-uuid,still-bad');
    expect(screen.getByText(/No listings selected/)).toBeInTheDocument();
  });
});
