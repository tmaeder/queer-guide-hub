/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { lazyRetry } from '../lazyRetry';

// jsdom's window.location is non-configurable. Replace the whole object so
// we can spy on reload() and pin pathname.
const originalLocation = window.location;

describe('lazyRetry', () => {
  let reloadSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, pathname: '/test-route', reload: reloadSpy },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    sessionStorage.clear();
  });

  it('returns a React.LazyExoticComponent', () => {
    const lazy = lazyRetry(() => Promise.resolve({ default: () => null }));
    expect(lazy).toHaveProperty('$$typeof');
  });

  it('triggers a hard reload on first chunk-load failure', async () => {
    const factory = vi.fn(() => Promise.reject(new Error('chunk-load fail')));
    const lazy = lazyRetry(factory);

    type LazyInternals = {
      _payload: { _result: Promise<unknown> };
      _init: (p: { _result: Promise<unknown> }) => unknown;
    };
    const internals = lazy as unknown as LazyInternals;
    try { internals._init(internals._payload); } catch { /* expected */ }
    await new Promise(r => setTimeout(r, 0));

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('chunk-reload-/test-route')).toBe('1');
  });

  it('re-throws and clears the loop-guard on second failure', async () => {
    sessionStorage.setItem('chunk-reload-/test-route', '1');

    const factory = vi.fn(() => Promise.reject(new Error('still broken')));
    const lazy = lazyRetry(factory);

    type LazyInternals = {
      _payload: { _result: Promise<unknown> };
      _init: (p: { _result: Promise<unknown> }) => unknown;
    };
    const internals = lazy as unknown as LazyInternals;
    try { internals._init(internals._payload); } catch { /* expected */ }
    await new Promise(r => setTimeout(r, 0));

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('chunk-reload-/test-route')).toBeNull();
  });
});
