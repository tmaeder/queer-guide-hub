/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { TrackLoader } from '../TrackLoader';
import { useLoaderDelay, LOADER_DELAY_MS, LOADER_SLOW_MS } from '../useLoaderDelay';

describe('TrackLoader', () => {
  it('draws a bezier loop, never a circle primitive', () => {
    const { container } = render(<TrackLoader />);
    // The brand rule is that transit lines are never straight — and a <circle>
    // is the degenerate case. The loop must be a path with curve commands.
    expect(container.querySelector('circle')).toBeNull();
    const d = container.querySelector('path')?.getAttribute('d') ?? '';
    expect(d).toMatch(/C/);
    expect(d).not.toMatch(/[HVhv]/);
  });

  it('is decorative by default and a live status when labelled', () => {
    const { container, rerender } = render(<TrackLoader />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden');
    rerender(<TrackLoader label="Saving place" />);
    expect(screen.getByRole('status')).toHaveAccessibleName('Saving place');
  });

  it('takes its colour from a track token, not a literal', () => {
    const { container } = render(<TrackLoader track="blue" />);
    expect(container.querySelector('path')).toHaveAttribute('stroke', 'hsl(var(--track-blue))');
  });
});

describe('useLoaderDelay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows NOTHING for the first 400ms — the rule most often skipped', () => {
    const { result } = renderHook(() => useLoaderDelay(true));
    expect(result.current.visible).toBe(false);
    act(() => void vi.advanceTimersByTime(LOADER_DELAY_MS - 1));
    expect(result.current.visible).toBe(false);
    act(() => void vi.advanceTimersByTime(2));
    expect(result.current.visible).toBe(true);
  });

  it('flags slow past 8s so the copy can say what is waiting', () => {
    const { result } = renderHook(() => useLoaderDelay(true));
    act(() => void vi.advanceTimersByTime(LOADER_SLOW_MS - 1));
    expect(result.current.slow).toBe(false);
    act(() => void vi.advanceTimersByTime(2));
    expect(result.current.slow).toBe(true);
  });

  it('reports nothing once loading ends, even mid-window', () => {
    const { result, rerender } = renderHook(({ l }) => useLoaderDelay(l), {
      initialProps: { l: true },
    });
    act(() => void vi.advanceTimersByTime(LOADER_DELAY_MS + 10));
    expect(result.current.visible).toBe(true);
    rerender({ l: false });
    expect(result.current.visible).toBe(false);
    expect(result.current.slow).toBe(false);
  });
});
