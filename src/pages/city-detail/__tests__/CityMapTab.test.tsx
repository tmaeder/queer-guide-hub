/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { MemoryRouter } from 'react-router';

// CityMapTab renders MapShell, which needs router state (useSearchParams) and
// consumes auth + favorites (saved layer, map wave 3) — stub the hooks and
// wrap renders in MemoryRouter.
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

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('CityMapTab', () => {
  it('renders nothing when coords missing', () => {
    const { container } = renderWithRouter(
      <CityMapTab city={{ id: 'c1' } as never} ExploreMap={FakeMap} Suspense={Suspense} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders map when coords present', () => {
    renderWithRouter(
      <CityMapTab
        city={{ id: 'c1', latitude: 52, longitude: 13 } as never}
        ExploreMap={FakeMap}
        Suspense={Suspense}
      />,
    );
    expect(screen.getByTestId('explore-map')).toBeInTheDocument();
  });
});
