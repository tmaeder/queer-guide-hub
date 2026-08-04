/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('maplibre-gl', () => ({
  default: {
    Map: class {
      on() {} off() {} once() {} remove() {} addControl() {} setStyle() {} fitBounds() {}
      addLayer() {} addSource() {} getLayer() { return null; } getSource() { return null; }
      removeLayer() {} removeSource() {}
      isStyleLoaded() { return false; }
      loaded() { return false; }
      getCanvas() { return { style: {} }; }
      flyTo() {} jumpTo() {} resize() {}
    },
    NavigationControl: class {},
    Marker: class { setLngLat() { return this; } addTo() { return this; } remove() {} },
    Popup: class { setLngLat() { return this; } setHTML() { return this; } addTo() { return this; } remove() {} },
    LngLatBounds: class { extend() {} },
  },
  // config/mapStyle.ts side-effect-imports config/maplibreWorker.ts, which calls
  // setWorkerUrl() at module scope — a default-only mock throws on import.
  setWorkerUrl: () => {},
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
