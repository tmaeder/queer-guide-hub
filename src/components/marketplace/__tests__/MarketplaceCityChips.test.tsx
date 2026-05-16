/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const { useMarketplaceTopCitiesMock } = vi.hoisted(() => ({
  useMarketplaceTopCitiesMock: vi.fn(),
}));

vi.mock('@/hooks/useMarketplaceQueries', () => ({
  useMarketplaceTopCities: useMarketplaceTopCitiesMock,
}));
vi.mock('@/components/routing/LocalizedLink', () => ({
  LocalizedLink: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>{children}</a>
  ),
}));

import { MarketplaceCityChips } from '../MarketplaceCityChips';

beforeEach(() => useMarketplaceTopCitiesMock.mockReset());

describe('MarketplaceCityChips', () => {
  it('renders nothing while loading', () => {
    useMarketplaceTopCitiesMock.mockReturnValue({ data: [], loading: true });
    const { container } = render(<MarketplaceCityChips />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when cities list empty', () => {
    useMarketplaceTopCitiesMock.mockReturnValue({ data: [], loading: false });
    const { container } = render(<MarketplaceCityChips />);
    expect(container.firstChild).toBeNull();
  });

  it('renders linked chip when city has a slug', () => {
    useMarketplaceTopCitiesMock.mockReturnValue({
      data: [{ name: 'Berlin', slug: 'berlin', count: 12 }],
      loading: false,
    });
    render(
      <MemoryRouter>
        <MarketplaceCityChips />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /Berlin/i });
    expect(link).toHaveAttribute('href', '/cities/berlin');
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders disabled span chip when slug missing', () => {
    useMarketplaceTopCitiesMock.mockReturnValue({
      data: [{ name: 'Atlantis', slug: null, count: 3 }],
      loading: false,
    });
    render(<MarketplaceCityChips />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Atlantis')).toBeInTheDocument();
  });
});
