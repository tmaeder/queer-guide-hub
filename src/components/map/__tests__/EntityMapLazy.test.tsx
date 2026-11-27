import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The implementation is what imports maplibre-gl. Count how often the wrapper
// asks for it: before the map nears the viewport the answer must be zero.
const implLoaded = vi.fn();
vi.mock('../EntityMap.impl', () => {
  implLoaded();
  return { default: () => <div data-testid="real-map" /> };
});

type IOCallback = (
  entries: Array<{ isIntersecting: boolean; boundingClientRect?: { top: number } }>,
) => void;
let fire: IOCallback | null = null;
let observerOptions: IntersectionObserverInit | undefined;

beforeEach(() => {
  implLoaded.mockClear();
  fire = null;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IOCallback, opts?: IntersectionObserverInit) {
        fire = cb;
        observerOptions = opts;
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('EntityMap (lazy island)', () => {
  it('renders a placeholder at the map height and does not load maplibre off-screen', async () => {
    const { EntityMap } = await import('../EntityMap');
    render(<EntityMap center={[13.4, 52.52]} height={360} />);
    const ph = screen.getByTestId('entity-map-placeholder');
    expect(ph.style.height).toBe('360px');
    expect(screen.queryByTestId('real-map')).toBeNull();
    expect(implLoaded).not.toHaveBeenCalled();
    // Loading starts ahead of the viewport, not on contact.
    expect(observerOptions?.rootMargin).toMatch(/^\d+px/);
  });

  it('loads and mounts the real map once it nears the viewport', async () => {
    const { EntityMap } = await import('../EntityMap');
    render(<EntityMap center={[13.4, 52.52]} />);
    expect(fire).not.toBeNull();
    await act(async () => {
      fire?.([{ isIntersecting: true }]);
    });
    expect(await screen.findByTestId('real-map')).toBeTruthy();
    expect(implLoaded).toHaveBeenCalledTimes(1);
  });

  it('waits for the first scroll when the map is below the fold of an unscrolled page', async () => {
    const { EntityMap } = await import('../EntityMap');
    render(<EntityMap center={[13.4, 52.52]} />);
    // Within the look-ahead margin, but under the fold, and nobody has scrolled.
    await act(async () => {
      fire?.([{ isIntersecting: true, boundingClientRect: { top: window.innerHeight + 136 } }]);
    });
    expect(screen.queryByTestId('real-map')).toBeNull();
    expect(implLoaded).not.toHaveBeenCalled();
    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(await screen.findByTestId('real-map')).toBeTruthy();
  });

  it('treats a sliver above the fold as below it', async () => {
    const { EntityMap } = await import('../EntityMap');
    render(<EntityMap center={[13.4, 52.52]} />);
    await act(async () => {
      fire?.([{ isIntersecting: true, boundingClientRect: { top: window.innerHeight - 14 } }]);
    });
    expect(implLoaded).not.toHaveBeenCalled();
  });

  it('loads at once when the map is already on screen', async () => {
    const { EntityMap } = await import('../EntityMap');
    render(<EntityMap center={[13.4, 52.52]} />);
    await act(async () => {
      fire?.([{ isIntersecting: true, boundingClientRect: { top: 200 } }]);
    });
    expect(await screen.findByTestId('real-map')).toBeTruthy();
  });

  it('mounts at once where IntersectionObserver is unavailable, rather than never', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { EntityMap } = await import('../EntityMap');
    render(<EntityMap center={[13.4, 52.52]} />);
    expect(await screen.findByTestId('real-map')).toBeTruthy();
  });
});
