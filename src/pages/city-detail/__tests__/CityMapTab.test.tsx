/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Suspense } from 'react';

// MapShell (rendered when VITE_MAP_SHELL is on) reads auth + favorites and
// renders the real ExploreMap — mock all three so the test passes under
// either flag state.
vi.mock('@/components/map/ExploreMap', () => ({
  ExploreMap: () => <div data-testid="explore-map">map</div>,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useFavorites', () => ({
  useFavorites: () => ({
    isFavorited: () => false,
    toggleFavorite: vi.fn(),
    loading: false,
    favoriteIds: new Set<string>(),
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
