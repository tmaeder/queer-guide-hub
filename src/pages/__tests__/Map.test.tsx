/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

vi.mock('@/components/map/ExploreMap', () => ({
  ExploreMap: () => <div data-testid="map" />,
}));
vi.mock('@/components/map/ExploreMapLayers', () => ({
  LAYER_DEFS: [{ type: 'venues', comingSoon: false }, { type: 'events', comingSoon: false }],
}));
// MapShell (rendered when VITE_MAP_SHELL is on) reads auth + favorites.
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useFavorites', () => ({
  useFavorites: () => ({
    isFavorited: () => false,
    toggleFavorite: vi.fn(),
    loading: false,
    favoriteIds: new Set<string>(),
// MapShell consumes auth + favorites (saved layer, map wave 3) — these page
// tests don't mount providers, so stub both hooks.
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

import MapPage from '../Map';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/map" element={<MapPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('Map page', () => {
  it('renders ExploreMap', () => {
    renderAt('/map');
    expect(screen.getByTestId('map')).toBeInTheDocument();
  });

  it('parses URL lat/lng/z params without crashing', () => {
    renderAt('/map?lat=52.52&lng=13.4&z=12&layers=venues');
    expect(screen.getByTestId('map')).toBeInTheDocument();
  });
});
