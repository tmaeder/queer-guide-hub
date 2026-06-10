/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Suspense } from 'react';

// CityMapTab renders MapShell, which needs router state (useSearchParams),
// reads auth + favorites (saved layer, map wave 3), and renders the real
// ExploreMap — stub all three and wrap renders in MemoryRouter.
vi.mock('@/components/map/ExploreMap', () => ({
  ExploreMap: () => <div data-testid="explore-map">map</div>,
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, session: null, loading: false }),
}));
vi.mock('@/hooks/useFavorites', () => ({
  useFavorites: () => ({
    favoriteIds: new Set<string>(),
    isFavorited: () => false,
    toggleFavorite: async () => {},
    loading: false,
  }),
}));

import { CityMapTab } from '../CityMapTab';

function FakeMap() { return <div data-testid="explore-map">map</div>; }

function renderTab(city: Record<string, unknown>) {
  return render(
    <MemoryRouter>
      <CityMapTab city={city as never} ExploreMap={FakeMap} Suspense={Suspense} />
    </MemoryRouter>,
  );
}

describe('CityMapTab', () => {
  it('renders nothing when coords missing', () => {
    const { container } = renderTab({ id: 'c1' });
    expect(container.firstChild).toBeNull();
  });

  it('renders map when coords present', () => {
    renderTab({ id: 'c1', latitude: 52, longitude: 13 });
    expect(screen.getByTestId('explore-map')).toBeInTheDocument();
  });
});
