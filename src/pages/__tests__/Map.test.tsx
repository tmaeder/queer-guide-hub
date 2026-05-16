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
