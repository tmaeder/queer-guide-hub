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

  // lazyRetry now retries once (≈250 ms delay) before falling back to a
  // hard reload — the path taken when a chunk genuinely cannot load.
  // These tests wait long enough for the retry to settle before asserting.
  const RETRY_DELAY_MS = 300;

  it('triggers a hard reload after both the initial and retry attempts fail', async () => {
    const factory = vi.fn(() => Promise.reject(new Error('chunk-load fail')));
    const lazy = lazyRetry(factory);

    type LazyInternals = {
      _payload: { _result: Promise<unknown> };
      _init: (p: { _result: Promise<unknown> }) => unknown;
    };
    const internals = lazy as unknown as LazyInternals;
    try { internals._init(internals._payload); } catch { /* expected */ }
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));

    expect(factory).toHaveBeenCalledTimes(2);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    // Guard is a timestamp now (cooldown), not a boolean flag.
    const stored = Number(sessionStorage.getItem('chunk-reload-/test-route'));
    expect(stored).toBeGreaterThan(0);
  });

  // Regression: a chunk that resolves to a module WITHOUT a default export
  // (stale/partial chunk during a deploy) must be treated as a load failure
  // — retry then reload — rather than letting React.lazy throw the cryptic
  // "Cannot read properties of undefined (reading 'default')". This was the
  // root cause of a crash on /marketplace/category/:slug right after a deploy.
  it('treats a module with no default export as a load failure (retry → reload)', async () => {
    const factory = vi.fn(() => Promise.resolve({} as { default: () => null }));
    const lazy = lazyRetry(factory);

    type LazyInternals = {
      _payload: { _result: Promise<unknown> };
      _init: (p: { _result: Promise<unknown> }) => unknown;
    };
    const internals = lazy as unknown as LazyInternals;
    try { internals._init(internals._payload); } catch { /* expected */ }
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));

    expect(factory).toHaveBeenCalledTimes(2);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('re-throws (no reload) when the retry also fails right after a previous reload', async () => {
    // Fresh timestamp = we just reloaded for this path → within cooldown.
    sessionStorage.setItem('chunk-reload-/test-route', String(Date.now()));

    const factory = vi.fn(() => Promise.reject(new Error('still broken')));
    const lazy = lazyRetry(factory);

    type LazyInternals = {
      _payload: { _result: Promise<unknown> };
      _init: (p: { _result: Promise<unknown> }) => unknown;
    };
    const internals = lazy as unknown as LazyInternals;
    try { internals._init(internals._payload); } catch { /* expected */ }
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));

    expect(factory).toHaveBeenCalledTimes(2);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  // Regression (2026-07-21, /admin crash): the old boolean guard persisted for
  // the whole tab session, so the SECOND deploy that invalidated a long-lived
  // tab's chunks got no recovery reload and crashed to the error boundary.
  // An old timestamp (previous deploy, outside the cooldown) must allow a
  // fresh reload.
  it('reloads again when the previous recovery reload is outside the cooldown', async () => {
    sessionStorage.setItem('chunk-reload-/test-route', String(Date.now() - 5 * 60_000));

    const factory = vi.fn(() => Promise.reject(new Error('stale chunk, deploy #2')));
    const lazy = lazyRetry(factory);

    type LazyInternals = {
      _payload: { _result: Promise<unknown> };
      _init: (p: { _result: Promise<unknown> }) => unknown;
    };
    const internals = lazy as unknown as LazyInternals;
    try { internals._init(internals._payload); } catch { /* expected */ }
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));

    expect(factory).toHaveBeenCalledTimes(2);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
