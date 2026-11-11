/**
 * @vitest-environment jsdom
 *
 * With no geolocation the map used to fly to Berlin and toast "Showing
 * Berlin" — telling a visitor anywhere else we thought they were in Berlin.
 * It must open a neutral world view and name no city.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMapAutoFly, WORLD_CENTER, WORLD_ZOOM } from '../useMapAutoFly';

afterEach(() => vi.useRealTimers());

function setup(visitorGeo: Parameters<typeof useMapAutoFly>[0]['visitorGeo']) {
  const flyToLocation = vi.fn();
  const setViewport = vi.fn();
  const showLocationHint = vi.fn();
  renderHook(() =>
    useMapAutoFly({ skipAutoFly: false, visitorGeo, flyToLocation, setViewport, showLocationHint }),
  );
  return { flyToLocation, setViewport, showLocationHint };
}

describe('useMapAutoFly', () => {
  it('falls back to a neutral world view with no city toast', () => {
    vi.useFakeTimers();
    const m = setup(null);
    act(() => vi.advanceTimersByTime(2600));
    expect(m.setViewport).toHaveBeenCalledWith({ center: WORLD_CENTER, zoom: WORLD_ZOOM });
    expect(m.flyToLocation).toHaveBeenCalledWith(WORLD_CENTER[0], WORLD_CENTER[1], WORLD_ZOOM);
    expect(m.showLocationHint).not.toHaveBeenCalled();
  });

  it('centres on the resolved location when there is one', () => {
    const m = setup({ latitude: 38.72, longitude: -9.14, city: 'Lisbon' });
    expect(m.flyToLocation).toHaveBeenCalledWith(-9.14, 38.72, 10);
    expect(m.showLocationHint).toHaveBeenCalledWith('Showing Lisbon');
  });
});
