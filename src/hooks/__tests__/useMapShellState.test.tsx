/**
 * Regression guard for the URL-write race in `useMapShellState`.
 *
 * `setSearchParams(fn)` does NOT hand `fn` the live query string. React Router
 * closes over the `searchParams` of the render that produced that particular
 * `setSearchParams` identity, and its own docs say so: "Multiple calls to
 * setSearchParams in the same tick will not build on the prior value."
 *
 * The viewport writer debounces for 250 ms, so its callback routinely outlives
 * the render it was created in. Any view / line / filter write landing inside
 * that window was silently erased when the timer fired on the stale snapshot —
 * `?view=heat` vanished and the view could not be shared, while
 * `data-map-view` (React state, not URL state) still read `heat`, which is
 * what made it look like a rendering bug rather than a lost write.
 *
 * Re-asserted on the NEW names here, deliberately: a rename is exactly the
 * change that quietly drops a regression guard.
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

  it('keeps a view written while a viewport write is still debounced', () => {
    const { result } = renderHook(useProbe, { wrapper: wrapper('/map') });

    // Order matters: the map emits a viewport on load, the user picks a view
    // before the 250 ms debounce elapses.
    act(() => result.current.shell.setViewport({ center: [0, 20], zoom: 2.2 }));
    act(() => result.current.shell.setView('heat'));
    expect(result.current.search).toContain('view=heat');

    act(() => void vi.advanceTimersByTime(400));

    expect(result.current.search).toContain('lat=20.0000');
    expect(result.current.search).toContain('view=heat');
    expect(result.current.shell.state.view).toBe('heat');
  });

  it('keeps lines and filters written in the same window', () => {
    const { result } = renderHook(useProbe, { wrapper: wrapper('/map') });

    act(() => result.current.shell.setViewport({ center: [0, 20], zoom: 2.2 }));
    act(() => result.current.shell.setLines(['M']));
    act(() => result.current.shell.setFilters({ category: 'bar' }));
    act(() => void vi.advanceTimersByTime(400));

    expect(result.current.search).toContain('lines=M');
    expect(result.current.search).toContain('category=bar');
    expect(result.current.search).toContain('z=2.20');
  });

  it('builds on the prior value across writes in a single tick', () => {
    const { result } = renderHook(useProbe, { wrapper: wrapper('/map') });

    act(() => {
      result.current.shell.setView('areas');
      result.current.shell.setLines(['M', 'E']);
    });

    expect(result.current.search).toContain('view=areas');
    expect(result.current.search).toContain('lines=M%2CE');
  });

  it('lands on the default after a rapid heat -> areas -> stations sequence', () => {
    const { result } = renderHook(useProbe, { wrapper: wrapper('/map') });

    act(() => result.current.shell.setViewport({ center: [0, 20], zoom: 2.2 }));
    act(() => result.current.shell.setView('heat'));
    act(() => result.current.shell.setView('areas'));
    act(() => result.current.shell.setView('stations'));
    act(() => void vi.advanceTimersByTime(400));

    expect(result.current.search).not.toContain('view=');
    expect(result.current.shell.state.view).toBe('stations');
  });

  it('does not resurrect a stale saved view after the default is chosen', () => {
    // `prefs` is read once at mount, and the fallback for "no view param" is
    // that saved value. A remount mid-session must not reinstate the view the
    // user just cleared.
    localStorage.setItem('map_shell_prefs', JSON.stringify({ view: 'heat' }));
    const { result, rerender } = renderHook(useProbe, { wrapper: wrapper('/map') });
    expect(result.current.shell.state.view).toBe('heat');

    act(() => result.current.shell.setView('stations'));
    rerender();

    expect(result.current.search).not.toContain('view=');
    expect(result.current.shell.state.view).toBe('stations');
  });

  it('still deletes the param when the surface default is selected', () => {
    const { result } = renderHook(useProbe, { wrapper: wrapper('/map?view=heat') });
    expect(result.current.shell.state.view).toBe('heat');

    // `stations` is discover's defaultView — the only value that clears it.
    act(() => result.current.shell.setView('stations'));
    expect(result.current.search).not.toContain('view=');

    // `areas` is NOT the default here, so it is written like any other view.
    act(() => result.current.shell.setView('areas'));
    expect(result.current.search).toContain('view=areas');
  });
});

describe('useMapShellState — legacy URLs', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('reads a bookmarked ?lens=combined as the stations view', () => {
    const { result } = renderHook(useProbe, { wrapper: wrapper('/map?lens=combined') });
    expect(result.current.shell.state.view).toBe('stations');
  });

  it('reads ?layers= as lines', () => {
    const { result } = renderHook(useProbe, {
      wrapper: wrapper('/map?layers=venues,hotels'),
    });
    expect(result.current.shell.state.lines.sort()).toEqual(['M', 'T']);
  });

  it('does NOT rewrite the URL at mount — that would race the viewport timer', () => {
    // Rule 3. A normalising effect is a URL write outside `writeParams`, which
    // is exactly the lost-write bug the suite above exists for.
    const { result } = renderHook(useProbe, { wrapper: wrapper('/map?lens=density') });
    expect(result.current.search).toContain('lens=density');
    expect(result.current.search).not.toContain('view=');
    // and read precedence still makes the new vocabulary authoritative
    expect(result.current.shell.state.view).toBe('heat');
  });

  it('deletes the legacy keys on the next write the user causes', () => {
    const { result } = renderHook(useProbe, {
      wrapper: wrapper('/map?lens=density&layers=venues'),
    });
    act(() => result.current.shell.setView('areas'));

    expect(result.current.search).toContain('view=areas');
    expect(result.current.search).not.toContain('lens=');
    expect(result.current.search).not.toContain('layers=');
  });

  it('strips them on a VIEWPORT write too, 250 ms later', () => {
    // The delete lives inside `writeParams`, so every writer composes it —
    // including the debounced one whose stale snapshot caused the original bug.
    const { result } = renderHook(useProbe, { wrapper: wrapper('/map?lens=pins') });
    act(() => result.current.shell.setViewport({ center: [0, 20], zoom: 2.2 }));
    act(() => void vi.advanceTimersByTime(400));

    expect(result.current.search).toContain('lat=20.0000');
    expect(result.current.search).not.toContain('lens=');
  });

  it('migrates a prefs blob saved under the old vocabulary', () => {
    localStorage.setItem(
      'map_shell_prefs',
      JSON.stringify({ lens: 'boundary', enabledLayers: ['venues'] }),
    );
    const { result } = renderHook(useProbe, { wrapper: wrapper('/map') });
    expect(result.current.shell.state.view).toBe('areas');
    expect(result.current.shell.state.lines).toEqual(['M']);
  });
});
