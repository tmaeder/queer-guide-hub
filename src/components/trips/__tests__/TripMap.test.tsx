/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useTripSuggestions', () => ({
  fetchTripMapVenues: vi.fn().mockResolvedValue([]),
  fetchTripMapEvents: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/hooks/useVisitedPlaceLookup', () => ({ useVisitedPlaceLookup: () => ({ has: () => false, mark: vi.fn() }) }));
vi.mock('maplibre-gl', () => ({
  default: {
    Map: class { on() {} off() {} remove() {} addControl() {} setStyle() {} fitBounds() {} isStyleLoaded() { return true; } },
    NavigationControl: class {},
    AttributionControl: class {},
    Marker: class { setLngLat() { return this; } addTo() { return this; } remove() {} setPopup() { return this; } },
    Popup: class { setLngLat() { return this; } setHTML() { return this; } addTo() { return this; } remove() {} },
    LngLatBounds: class { extend() {} },
  },
}));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

import { TripMap } from '../TripMap';

describe('TripMap', () => {
  it('renders without crashing', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <TripMap places={[]} days={[]} startDate="2026-06-01" endDate="2026-06-05" />
      </QueryClientProvider>,
    );
    expect(container).toBeTruthy();
  });
});
