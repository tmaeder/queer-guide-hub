import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';

/**
 * useEventFilters derives the feed request from filter state; it no longer
 * fetches. These pin the derivation rules that replaced the per-dimension
 * refetch effects.
 */

vi.mock('@/hooks/useVisitorLocation', () => ({
  useVisitorLocation: () => ({ location: null, loading: false }),
}));
vi.mock('@/hooks/useAccessibilityAttributes', () => ({
  useAccessibilityAttributes: () => ({ accessibilityAttributes: [] }),
}));
vi.mock('@/hooks/useTargetGroups', () => ({ useTargetGroups: () => ({ targetGroups: [] }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

import { useEventFilters } from '../useEventFilters';

const wrapperFor =
  (url: string) =>
  ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );

describe('useEventFilters — derived request', () => {
  beforeEach(() => vi.useRealTimers());

  it('a preset keeps the other active filters (the old preset fetch dropped them)', async () => {
    const { result } = renderHook(() => useEventFilters(), {
      wrapper: wrapperFor('/events?acc=step-free-entrance&cities=Berlin'),
    });
    await act(async () => {
      await result.current.handlePresetSelect('featured');
    });
    expect(result.current.request.filters).toMatchObject({
      featured: true,
      cities: ['Berlin'],
      accessibilityAttributes: ['step-free-entrance'],
    });
  });

  it('toggling a preset off reverses exactly what it set', async () => {
    const { result } = renderHook(() => useEventFilters(), { wrapper: wrapperFor('/events') });
    await act(async () => {
      await result.current.handlePresetSelect('pride');
    });
    expect(result.current.request.filters.eventTypes).toEqual(['pride']);
    expect(result.current.request.filters.dateRange).toBeDefined();
    await act(async () => {
      await result.current.handlePresetSelect('pride');
    });
    expect(result.current.request.filters.eventTypes).toBeUndefined();
    expect(result.current.request.filters.dateRange).toBeUndefined();
  });

  it('timeline view takes its date window from the viewport, other views from the filters', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEventFilters(), {
      wrapper: wrapperFor('/events?view=timeline'),
    });
    const startMs = Date.UTC(2030, 0, 1);
    const endMs = Date.UTC(2030, 0, 31);
    act(() => result.current.setTimelineViewport({ startMs, endMs }));
    act(() => vi.advanceTimersByTime(400));
    expect(result.current.request.filters.dateRange).toEqual({
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
    });
    expect(result.current.request.filters.includePast).toBeUndefined();

    act(() => result.current.setViewMode('grid'));
    expect(result.current.request.filters.dateRange).toBeUndefined();
  });

  it('search waits for the debounce, and commitSearch applies it at once', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEventFilters(), { wrapper: wrapperFor('/events') });
    act(() => result.current.setSearch('drag'));
    expect(result.current.request.filters.search).toBeUndefined();

    let changed = false;
    act(() => {
      changed = result.current.commitSearch();
    });
    expect(changed).toBe(true);
    expect(result.current.request.filters.search).toBe('drag');
    // Nothing pending: the caller refetches instead.
    expect(result.current.commitSearch()).toBe(false);
  });

  it('clearFilters clears search immediately, not after the debounce', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEventFilters(), {
      wrapper: wrapperFor('/events?q=drag&cities=Berlin'),
    });
    expect(result.current.request.filters).toMatchObject({ search: 'drag', cities: ['Berlin'] });
    act(() => result.current.clearFilters());
    expect(result.current.request.filters.search).toBeUndefined();
    expect(result.current.request.filters.cities).toBeUndefined();
  });

  it('near me clears the city and sends the location', async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok({ coords: { latitude: 47.37, longitude: 8.54 } } as GeolocationPosition),
    );
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition },
      configurable: true,
    });
    const { result } = renderHook(() => useEventFilters(), {
      wrapper: wrapperFor('/events?cities=Berlin'),
    });
    await act(async () => {
      await result.current.handlePresetSelect('near-me');
    });
    expect(result.current.request.filters.cities).toBeUndefined();
    expect(result.current.request.filters.nearMe).toEqual({ lat: 47.37, lng: 8.54 });
  });
});
