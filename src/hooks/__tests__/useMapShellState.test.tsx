/**
 * Regression guard for the URL-write race in `useMapShellState`.
 *
 * `setSearchParams(fn)` does NOT hand `fn` the live query string. React Router
 * closes over the `searchParams` of the render that produced that particular
 * `setSearchParams` identity, and its own docs say so: "Multiple calls to
 * setSearchParams in the same tick will not build on the prior value."
 *
 * The viewport writer debounces for 250 ms, so its callback routinely outlives
 * the render it was created in. Any lens / layer / filter write landing inside
 * that window was silently erased when the timer fired on the stale snapshot —
 * `?lens=density` vanished and the view could not be shared, while
 * `data-map-lens` (React state, not URL state) still read `density`, which is
 * what made it look like a rendering bug rather than a lost write.
 *
 * This is a unit test on purpose. The e2e that found it only fails when the
 * click lands inside the 250 ms window, so it passes against a warm production
 * page and fails on a fast CI preview — a coin flip, not a guard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import { useMapShellState } from '@/hooks/useMapShellState';
import { SURFACE_PRESETS } from '@/components/map/MapShell.types';

function wrapper(initial: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>
  );
}

/** The hook under test plus the location it writes to. */
function useProbe() {
  return { shell: useMapShellState(SURFACE_PRESETS.discover), search: useLocation().search };
}

describe('useMapShellState — URL writes', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('keeps a lens written while a viewport write is still debounced', () => {
    const { result } = renderHook(useProbe, { wrapper: wrapper('/map') });

    // Order matters: the map emits a viewport on load, the user clicks a lens
    // before the 250 ms debounce elapses.
    act(() => result.current.shell.setViewport({ center: [0, 20], zoom: 2.2 }));
    act(() => result.current.shell.setLens('density'));
    expect(result.current.search).toContain('lens=density');

    act(() => void vi.advanceTimersByTime(400));

    expect(result.current.search).toContain('lat=20.0000');
    expect(result.current.search).toContain('lens=density');
    expect(result.current.shell.state.lens).toBe('density');
  });

  it('keeps layers and filters written in the same window', () => {
    const { result } = renderHook(useProbe, { wrapper: wrapper('/map') });

    act(() => result.current.shell.setViewport({ center: [0, 20], zoom: 2.2 }));
    act(() => result.current.shell.setLayers(['venues']));
    act(() => result.current.shell.setFilters({ category: 'bar' }));
    act(() => void vi.advanceTimersByTime(400));

    expect(result.current.search).toContain('layers=venues');
    expect(result.current.search).toContain('category=bar');
    expect(result.current.search).toContain('z=2.20');
  });

  it('builds on the prior value across writes in a single tick', () => {
    const { result } = renderHook(useProbe, { wrapper: wrapper('/map') });

    act(() => {
      result.current.shell.setLens('boundary');
      result.current.shell.setLayers(['venues', 'events']);
    });

    expect(result.current.search).toContain('lens=boundary');
    expect(result.current.search).toContain('layers=venues%2Cevents');
  });

  it('lands on the default after a rapid density -> pins -> combined sequence', () => {
    const { result } = renderHook(useProbe, { wrapper: wrapper('/map') });

    act(() => result.current.shell.setViewport({ center: [0, 20], zoom: 2.2 }));
    act(() => result.current.shell.setLens('density'));
    act(() => result.current.shell.setLens('pins'));
    act(() => result.current.shell.setLens('combined'));
    act(() => void vi.advanceTimersByTime(400));

    expect(result.current.search).not.toContain('lens=');
    expect(result.current.shell.state.lens).toBe('combined');
  });

  it('does not resurrect a stale saved lens after the default is chosen', () => {
    // `prefs` is read once at mount, and the fallback for "no lens param" is
    // that saved value. A remount mid-session must not reinstate the lens the
    // user just cleared.
    localStorage.setItem('map_shell_prefs', JSON.stringify({ lens: 'pins' }));
    const { result, rerender } = renderHook(useProbe, { wrapper: wrapper('/map') });
    expect(result.current.shell.state.lens).toBe('pins');

    act(() => result.current.shell.setLens('combined'));
    rerender();

    expect(result.current.search).not.toContain('lens=');
    expect(result.current.shell.state.lens).toBe('combined');
  });

  it('still deletes the param when the surface default is selected', () => {
    const { result } = renderHook(useProbe, { wrapper: wrapper('/map?lens=density') });
    expect(result.current.shell.state.lens).toBe('density');

    // `combined` is discover's defaultLens — the only value that clears it.
    act(() => result.current.shell.setLens('combined'));
    expect(result.current.search).not.toContain('lens=');

    // `pins` is NOT the default here, so it is written like any other lens.
    act(() => result.current.shell.setLens('pins'));
    expect(result.current.search).toContain('lens=pins');
  });
});
