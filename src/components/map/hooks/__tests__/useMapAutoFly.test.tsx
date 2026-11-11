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

type P = Parameters<typeof useMapAutoFly>[0];

function setup(visitorGeo: P['visitorGeo'], extra: Partial<P> = {}) {
  const flyToLocation = vi.fn();
  const setViewport = vi.fn();
  const showLocationHint = vi.fn();
  const view = renderHook((props: Partial<P>) =>
    useMapAutoFly({
      skipAutoFly: false,
      visitorGeo,
      flyToLocation,
      setViewport,
      showLocationHint,
      ...extra,
      ...props,
    }),
  );
  return { flyToLocation, setViewport, showLocationHint, rerender: view.rerender };
}

const IP = { latitude: 52.52, longitude: 13.4, city: 'Berlin' };

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

  it('centres on the picked region over IP geo', () => {
    const m = setup(IP, { region: { latitude: 38.72, longitude: -9.14, name: 'Lisbon' } });
    expect(m.flyToLocation).toHaveBeenCalledTimes(1);
    expect(m.flyToLocation).toHaveBeenCalledWith(-9.14, 38.72, 10);
    expect(m.showLocationHint).toHaveBeenCalledWith('Showing Lisbon');
  });

  it('holds IP geo back while the region is still resolving', () => {
    const m = setup(IP, { regionPending: true });
    expect(m.flyToLocation).not.toHaveBeenCalled();
    m.rerender({
      regionPending: false,
      region: { latitude: 38.72, longitude: -9.14, name: 'Lisbon' },
    });
    expect(m.flyToLocation).toHaveBeenCalledTimes(1);
    expect(m.flyToLocation).toHaveBeenCalledWith(-9.14, 38.72, 10);
  });
});
