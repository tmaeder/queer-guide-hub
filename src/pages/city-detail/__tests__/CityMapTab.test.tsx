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

  it('links out with a real CAMERA, not the dead ?city= param', () => {
    // `?city=` was never in /map's param schema, so this link landed on the
    // world view for as long as it existed. The old expectation pinned that
    // defect; asserting the camera is what makes the fix stick.
    renderTab(
      { id: 'c1', name: 'Berlin', latitude: 52, longitude: 13 },
      { openLabel: 'Open the full map' },
    );
    const href = screen
      .getByRole('link', { name: 'Open the full map' })
      .getAttribute('href') as string;

    expect(href, 'the dead param must be gone').not.toContain('city=');
    const sp = new URL(href, 'https://x.test').searchParams;
    expect(sp.get('lng')).toBe('13.0000');
    expect(sp.get('lat')).toBe('52.0000');
    expect(sp.get('z')).toBe('11.00');
    // and the referrer travels, so the reader can get back
    expect(sp.get('back')).toBeTruthy();
  });
});
