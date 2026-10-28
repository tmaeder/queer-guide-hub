import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useIsMobile } from '../use-mobile';

const initialWidth = window.innerWidth;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setWidth(initialWidth);
});

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
}

describe('useIsMobile', () => {
  it.each([320, 412, 767])('uses mobile on the very first render at %ipx', (width) => {
    setWidth(width);
    const renders: boolean[] = [];
    renderHook(() => {
      const mobile = useIsMobile();
      renders.push(mobile);
    });
    expect(renders[0]).toBe(true);
    expect(renders).not.toContain(false);
  });

  it.each([768, 1024, 1440])('uses desktop on the first render at %ipx', (width) => {
    setWidth(width);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('updates when the media query changes and unsubscribes on unmount', () => {
    setWidth(412);
    let notify: (() => void) | undefined;
    const remove = vi.fn();
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      addEventListener: (_type: string, listener: () => void) => {
        notify = listener;
      },
      removeEventListener: remove,
    } as unknown as MediaQueryList);
    const { result, unmount } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    setWidth(1024);
    act(() => notify?.());
    expect(result.current).toBe(false);
    unmount();
    expect(remove).toHaveBeenCalledWith('change', notify);
  });
});
