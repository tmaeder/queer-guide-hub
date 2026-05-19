/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('maplibre-gl', () => ({
  default: {
    Map: class {
      on() {} off() {} once() {} remove() {} addControl() {} setStyle() {} fitBounds() {}
      addSource() {} addLayer() {} getSource() { return null; } getLayer() { return null; }
      isStyleLoaded() { return false; }
      getCanvas() { return { style: {} }; }
    },
    NavigationControl: class {},
    Marker: class { setLngLat() { return this; } addTo() { return this; } remove() {} },
    Popup: class { setLngLat() { return this; } setHTML() { return this; } addTo() { return this; } remove() {} },
    LngLatBounds: class { extend() {} },
  },
}));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('@/components/trips/PublicTripCard', () => ({ PublicTripCard: () => null }));

import { DiscoverMap } from '../DiscoverMap';

describe('DiscoverMap', () => {
  it('renders without crashing', () => {
    const { container } = render(<DiscoverMap trips={[]} />);
    expect(container).toBeTruthy();
  });
});
