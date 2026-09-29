import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockOrder = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: mockOrder,
        }),
      }),
    }),
  },
}));

import { useTargetGroups } from '../useTargetGroups';

describe('useTargetGroups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch target groups on mount', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: '1', name: 'LGBTQ+' }], error: null });
    const { result } = renderHook(() => useTargetGroups());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targetGroups).toHaveLength(1);
  });

  it('should handle error gracefully', async () => {
    mockOrder.mockResolvedValue({ data: null, error: new Error('fail') });
    const { result } = renderHook(() => useTargetGroups());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.targetGroups).toEqual([]);
  });

  /**
   * Regression guard for the unhandled `ReferenceError: window is not defined`
   * that failed CI on #3982 with all 1531 test files and 13,743 tests passing.
   * The mount effect's fetch is unawaited, so when a page test finished before
   * the promise settled, `setLoading(false)` reached react-dom after vitest had
   * torn down that file's jsdom. Vitest reports the unhandled error and exits 1,
   * attributing it to whichever file was running (Venues.test.tsx that day), so
   * the symptom names an innocent file and no assertion ever fails.
   *
   * This asserts the real stack rather than the resulting state. `result.current`
   * is frozen at the last committed render after unmount whether or not a write
   * was attempted, so a state assertion here passes against the unguarded hook
   * too — measured: stripping both `alive.current` checks leaves such a test
   * green. What differs is whether `dispatchSetState` is entered at all: it calls
   * `resolveUpdatePriority`, which reads a bare `window`. So the environment is
   * removed the way vitest removes it, and the promise is awaited for a throw.
   *
   * Both writes are asserted, and they fail differently. The `finally` one is
   * what escaped in CI — nothing catches it, so it becomes the unhandled error
   * that exits the run. An unguarded `setTargetGroups` throws inside the `try`,
   * where this hook's own `catch` swallows it into a `console.error`; harmless
   * today, but it means a reorder could turn it into the escaping one, so it is
   * held by the log assertion rather than left unmeasured.
   */
  it('attempts no state write once the environment is gone', async () => {
    let settle: (v: unknown) => void = () => {};
    mockOrder.mockReturnValue(
      new Promise((res) => {
        settle = res;
      }),
    );

    const { result, unmount } = renderHook(() => useTargetGroups());
    // Same code path as the mount effect, but it hands us the promise to await.
    const pending = result.current.fetchTargetGroups();
    unmount();

    // Collected into a closure, not read off the spy: `mockRestore()` resets call
    // history, so asserting on the spy after restoring it always passes.
    const logged: unknown[][] = [];
    const onError = vi.spyOn(console, 'error').mockImplementation((...args) => {
      logged.push(args);
    });
    const win = globalThis.window;
    // @ts-expect-error -- reproduce vitest tearing down the file's jsdom
    delete globalThis.window;
    try {
      settle({ data: [{ id: '1', name: 'LGBTQ+' }], error: null });
      await pending;
    } finally {
      globalThis.window = win;
      onError.mockRestore();
    }

    expect(logged).toEqual([]);
  });
});
