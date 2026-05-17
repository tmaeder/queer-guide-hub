import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
import { useMapShellState } from '@/hooks/useMapShellState';
import { SURFACE_PRESETS } from '@/components/map/MapShell.types';

function wrapper(initial: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>
  );
}

const discover = SURFACE_PRESETS.discover;

describe('useMapShellState', () => {
  it('parses defaults when URL is empty', () => {
    const { result } = renderHook(() => useMapShellState(discover), {
      wrapper: wrapper('/map'),
    });
    expect(result.current.state.lens).toBe('pins');
    expect(result.current.state.enabledLayers).toEqual(discover.layers);
    expect(result.current.state.filters).toEqual({});
  });

  it('parses lens from URL when allowed by the surface', () => {
    const { result } = renderHook(() => useMapShellState(discover), {
      wrapper: wrapper('/map?lens=density'),
    });
    expect(result.current.state.lens).toBe('density');
  });

  it('ignores lens values not allowed by the surface', () => {
    const { result } = renderHook(() => useMapShellState(discover), {
      wrapper: wrapper('/map?lens=routes'),
    });
    expect(result.current.state.lens).toBe('pins');
  });

  it('parses filters (q, category, tags, near, queer_owned, era) from URL', () => {
    const { result } = renderHook(() => useMapShellState(discover), {
      wrapper: wrapper(
        '/map?q=berlin&category=bar&tags=lesbian,trans&near=52.52,13.41,5&queer_owned=1&era=1970-1990',
      ),
    });
    expect(result.current.state.filters.search).toBe('berlin');
    expect(result.current.state.filters.category).toBe('bar');
    expect(result.current.state.filters.tags).toEqual(['lesbian', 'trans']);
    expect(result.current.state.filters.nearMe).toEqual({ lat: 52.52, lng: 13.41, radiusKm: 5 });
    expect(result.current.state.filters.queerOwned).toBe(true);
    expect(result.current.state.filters.era).toEqual({ decadeStart: 1970, decadeEnd: 1990 });
  });

  it('parses viewport from URL', () => {
    const { result } = renderHook(() => useMapShellState(discover), {
      wrapper: wrapper('/map?lat=52.52&lng=13.41&z=12'),
    });
    expect(result.current.state.viewport).toEqual({ center: [13.41, 52.52], zoom: 12 });
  });

  it('rejects out-of-range lat/lng/zoom', () => {
    const { result } = renderHook(() => useMapShellState(discover), {
      wrapper: wrapper('/map?lat=999&lng=999&z=99'),
    });
    expect(result.current.state.viewport).toBeUndefined();
  });

  it('setLens removes the param when the value matches the surface default', () => {
    const { result } = renderHook(() => useMapShellState(discover), {
      wrapper: wrapper('/map?lens=density'),
    });
    act(() => result.current.setLens('pins'));
    expect(result.current.state.lens).toBe('pins');
  });

  it('setFilters clears params when removed', () => {
    const { result } = renderHook(() => useMapShellState(discover), {
      wrapper: wrapper('/map?q=foo&queer_owned=1'),
    });
    expect(result.current.state.filters.search).toBe('foo');
    expect(result.current.state.filters.queerOwned).toBe(true);
    act(() => result.current.setFilters({}));
    expect(result.current.state.filters.search).toBeUndefined();
    expect(result.current.state.filters.queerOwned).toBeUndefined();
  });

  it('setLayers removes the param when empty', () => {
    const { result } = renderHook(() => useMapShellState(discover), {
      wrapper: wrapper('/map?layers=venues,events'),
    });
    expect(result.current.state.enabledLayers).toEqual(['venues', 'events']);
    act(() => result.current.setLayers([]));
    expect(result.current.state.enabledLayers).toEqual(discover.layers);
  });

  it('ignores layer values not present in the surface preset', () => {
    const { result } = renderHook(() => useMapShellState(discover), {
      wrapper: wrapper('/map?layers=venues,fake_layer'),
    });
    expect(result.current.state.enabledLayers).toEqual(['venues']);
  });

  it('skips URL parsing when enableUrlState is false', () => {
    const trip = SURFACE_PRESETS.trip;
    const { result } = renderHook(() => useMapShellState(trip), {
      wrapper: wrapper('/trips/x?lens=pins&q=foo'),
    });
    expect(result.current.state.lens).toBe(trip.defaultLens);
    expect(result.current.state.filters.search).toBeUndefined();
  });
});
