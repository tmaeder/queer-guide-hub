/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('maplibre-gl', () => ({
  default: {
    Map: class { on() {} off() {} remove() {} addControl() {} setStyle() {} fitBounds() {} isStyleLoaded() { return true; } },
    NavigationControl: class {},
    AttributionControl: class {},
    ScaleControl: class {},
    GeolocateControl: class {},
    Marker: class { setLngLat() { return this; } addTo() { return this; } remove() {} setPopup() { return this; } },
    Popup: class { setLngLat() { return this; } setHTML() { return this; } addTo() { return this; } remove() {} },
    LngLatBounds: class { extend() {} },
  },
}));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));

import { EventsMapView } from '../EventsMapView';

describe('EventsMapView', () => {
  it('renders without crashing', () => {
    const { container } = render(<EventsMapView events={[]} />);
    expect(container).toBeTruthy();
  });
});
