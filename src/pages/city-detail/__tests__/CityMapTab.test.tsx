/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// CityMapTab renders EntityMap (maplibre), and reads auth + favorites via
// useVisitedPlaceLookup — stub all three and wrap renders in MemoryRouter.
vi.mock('@/components/map/EntityMap', () => ({
  EntityMap: () => <div data-testid="explore-map">map</div>,
}));
vi.mock('@/hooks/useVisitedPlaceLookup', () => ({ useVisitedPlaceLookup: () => undefined }));
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

function renderTab(city: Record<string, unknown>, props: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <CityMapTab city={city as never} {...props} />
    </MemoryRouter>,
  );
}

describe('CityMapTab', () => {
  it('renders nothing when coords missing', () => {
    const { container } = renderTab({ id: 'c1' });
    expect(container.firstChild).toBeNull();
  });

  it('renders the map inside the module frame when coords are present', () => {
    renderTab({ id: 'c1', name: 'Berlin', latitude: 52, longitude: 13 });
    expect(screen.getByTestId('explore-map')).toBeInTheDocument();
    // Module 16's own eyebrow — this is the city single's OWNER module.
    expect(screen.getByText('Around this station')).toBeInTheDocument();
  });

  it('offers a real link out to the full map rather than duplicating it', () => {
    renderTab(
      { id: 'c1', name: 'Berlin', latitude: 52, longitude: 13 },
      { openLabel: 'Open the full map' },
    );
    expect(screen.getByRole('link', { name: 'Open the full map' })).toHaveAttribute(
      'href',
      '/map?city=Berlin',
    );
  });
});
