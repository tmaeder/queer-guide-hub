/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

// Regression: the 20s load backstop used to read `mapReady` from the
// mount-time closure (always false), so a map that loaded fine was replaced
// by the "Map couldn't load" fallback after 20s.
const handlers: Record<string, () => void> = {};
vi.mock('maplibre-gl', () => {
  class Map {
    on(evt: string, a: unknown, b?: unknown) {
      if (typeof a === 'function') handlers[evt] = a as () => void;
      else if (typeof b === 'function') handlers[`${evt}:${a}`] = b as () => void;
    }
    remove() {}
    addControl() {}
    resize() {}
    getSource() {
      return undefined;
    }
    addSource() {}
    addLayer() {}
  }
  const mod = {
    Map,
    NavigationControl: class {},
    AttributionControl: class {},
    LngLatBounds: class {
      extend() {}
    },
    Popup: class {},
  };
  return { ...mod, default: mod, setWorkerUrl: () => {} };
});
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('@/lib/webglSupport', () => ({ isWebglSupported: () => true }));
vi.mock('@/hooks/useLocalizedNavigate', () => ({ useLocalizedNavigate: () => vi.fn() }));
vi.mock('@/config/mapStyle', () => ({ getMapStyle: () => ({}), MAP_FONT_BOLD: 'x' }));

import { EventsMapView } from '../EventsMapView';

afterEach(() => vi.useRealTimers());

describe('EventsMapView load backstop', () => {
  it('keeps a loaded map after the 20s backstop', () => {
    vi.useFakeTimers();
    render(<EventsMapView events={[]} />);
    act(() => handlers.load?.());
    act(() => vi.advanceTimersByTime(21_000));
    expect(screen.queryByText(/couldn.t load/i)).toBeNull();
  });

  it('shows the fallback when the map never loads', () => {
    vi.useFakeTimers();
    render(<EventsMapView events={[]} />);
    act(() => vi.advanceTimersByTime(21_000));
    expect(screen.getByText(/couldn.t load/i)).toBeTruthy();
  });
});
