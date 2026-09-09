/**
 * @vitest-environment jsdom
 *
 * The readiness gate itself, against a fake MapLibre `Map`.
 *
 * These assert the two halves of the contract that the production crashes came
 * from breaking: NOTHING is applied while the style cannot take it, and the
 * update is RE-APPLIED once it can — never dropped, because a dropped source
 * leaves the map permanently blank, which is the same symptom by a quieter
 * route.
 */
import { describe, it, expect, vi } from 'vitest';
import type * as maplibregl from 'maplibre-gl';
import {
  applyWhenStyleReady,
  isMapAlive,
  isStyleMutable,
  isStyleNotLoadedError,
} from '../mapStyleReady';

/**
 * A stand-in for the parts of `Map` the gate touches.
 *
 * `style._loaded` and `isStyleLoaded()` are BOTH modelled because the gate
 * prefers the internal (it is the exact flag `Style._checkLoaded()` reads) and
 * falls back to the public method. `remove()` reproduces what maplibre-gl 6
 * actually does — `setStyle(null)` → `delete this.style` — so a removed map
 * here is style-less exactly as it is in the browser.
 *
 * One instance per test, mutated in place: the object identity never changes,
 * so nothing here can reproduce the unstable-mock-ref OOM.
 */
function fakeMap(opts: { loaded?: boolean } = {}) {
  const listeners: Record<string, Array<() => void>> = {};
  const map = {
    style: { _loaded: opts.loaded ?? true } as { _loaded: boolean } | null,
    _removed: false,
    isStyleLoaded() {
      return map.style?._loaded === true;
    },
    on(event: string, cb: () => void) {
      (listeners[event] ??= []).push(cb);
    },
    off(event: string, cb: () => void) {
      listeners[event] = (listeners[event] ?? []).filter((f) => f !== cb);
    },
    remove() {
      map._removed = true;
      map.style = null; // maplibre-gl 6: `_updateStyle(null)` does `delete this.style`
    },
    /** Flip the style to loaded and fire the event MapLibre fires. */
    finishStyleLoad() {
      if (map.style) map.style._loaded = true;
      map.emit('styledata');
    },
    emit(event: string) {
      for (const cb of [...(listeners[event] ?? [])]) cb();
    },
    listenerCount(event: string) {
      return (listeners[event] ?? []).length;
    },
  };
  return map;
}

type FakeMap = ReturnType<typeof fakeMap>;
const asMap = (m: FakeMap) => m as unknown as maplibregl.Map;

describe('isStyleNotLoadedError', () => {
  it('matches the literal string Style._checkLoaded() throws', () => {
    // maplibre-gl 6.7.0, dist/maplibre-gl-dev.mjs:14688
    expect(isStyleNotLoadedError(new Error('Style is not done loading.'))).toBe(true);
  });

  it('does not match an unrelated error — a real bug must stay loud', () => {
    expect(isStyleNotLoadedError(new Error('There is already a source with ID "x"'))).toBe(false);
    expect(isStyleNotLoadedError('Style is not done loading.')).toBe(false);
  });
});

describe('isMapAlive / isStyleMutable', () => {
  it('a removed map is neither alive nor mutable, though the ref is still set', () => {
    const map = fakeMap();
    expect(isMapAlive(asMap(map))).toBe(true);
    expect(isStyleMutable(asMap(map))).toBe(true);
    map.remove();
    expect(isMapAlive(asMap(map))).toBe(false);
    expect(isStyleMutable(asMap(map))).toBe(false);
  });

  it('a live map whose style has not finished loading is alive but NOT mutable', () => {
    const map = fakeMap({ loaded: false });
    expect(isMapAlive(asMap(map))).toBe(true);
    expect(isStyleMutable(asMap(map))).toBe(false);
  });

  it('falls back to the public isStyleLoaded() when the internal flag is absent', () => {
    const map = fakeMap();
    map.style = {} as unknown as { _loaded: boolean }; // no `_loaded`
    map.isStyleLoaded = () => true;
    expect(isStyleMutable(asMap(map))).toBe(true);
    map.isStyleLoaded = () => false;
    expect(isStyleMutable(asMap(map))).toBe(false);
  });
});

describe('applyWhenStyleReady', () => {
  it('applies synchronously when the style is already loaded', () => {
    const map = fakeMap({ loaded: true });
    const apply = vi.fn();
    applyWhenStyleReady(asMap(map), apply);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(map.listenerCount('styledata')).toBe(0);
  });

  it('does NOT apply while the style is still loading, then applies once it is', () => {
    const map = fakeMap({ loaded: false });
    const apply = vi.fn();

    applyWhenStyleReady(asMap(map), apply);

    // THE REGRESSION. Before the fix this call went straight through and
    // MapLibre threw "Style is not done loading." out of a useEffect body,
    // which React 18 hands to the error boundary — the whole route crashes.
    expect(apply).not.toHaveBeenCalled();

    map.finishStyleLoad();

    // …and it is RE-APPLIED, not dropped. Dropping is the other half of the
    // bug: a map that never gets its source is permanently blank.
    expect(apply).toHaveBeenCalledTimes(1);
    // The listener detaches itself once it has landed.
    expect(map.listenerCount('styledata')).toBe(0);
  });

  it('applies exactly once even though styledata fires repeatedly', () => {
    const map = fakeMap({ loaded: false });
    const apply = vi.fn();
    applyWhenStyleReady(asMap(map), apply);
    map.finishStyleLoad();
    map.emit('styledata');
    map.emit('styledata');
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('never applies to a map that was removed while waiting', () => {
    const map = fakeMap({ loaded: false });
    const apply = vi.fn();
    applyWhenStyleReady(asMap(map), apply);
    map.remove();
    map.emit('styledata');
    expect(apply).not.toHaveBeenCalled();
  });

  it('applies nothing to an already-removed map and does not throw', () => {
    const map = fakeMap();
    map.remove();
    const apply = vi.fn();
    expect(() => applyWhenStyleReady(asMap(map), apply)).not.toThrow();
    expect(apply).not.toHaveBeenCalled();
  });

  it('disposing cancels a pending apply and detaches the listener', () => {
    const map = fakeMap({ loaded: false });
    const apply = vi.fn();
    const dispose = applyWhenStyleReady(asMap(map), apply);
    dispose();
    expect(map.listenerCount('styledata')).toBe(0);
    map.finishStyleLoad();
    expect(apply).not.toHaveBeenCalled();
  });

  it('an apply returning false keeps waiting — a deferred prerequisite is not a drop', () => {
    const map = fakeMap({ loaded: true });
    let layerExists = false;
    const apply = vi.fn(() => (layerExists ? undefined : false));

    applyWhenStyleReady(asMap(map), apply);
    expect(apply).toHaveBeenCalledTimes(1); // attempted, declined

    map.emit('styledata');
    expect(apply).toHaveBeenCalledTimes(2); // still declined

    layerExists = true;
    map.emit('styledata');
    expect(apply).toHaveBeenCalledTimes(3);
    expect(map.listenerCount('styledata')).toBe(0); // landed, detached
  });

  it('re-arms rather than crashing if the style call throws the not-loaded error anyway', () => {
    // Belt and braces: the gate says ready, MapLibre disagrees. Losing that
    // race must defer, not reach the error boundary.
    const map = fakeMap({ loaded: true });
    let firstCall = true;
    const apply = vi.fn(() => {
      if (firstCall) {
        firstCall = false;
        throw new Error('Style is not done loading.');
      }
    });

    expect(() => applyWhenStyleReady(asMap(map), apply)).not.toThrow();
    expect(apply).toHaveBeenCalledTimes(1);

    map.emit('styledata');
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it('re-throws any other error — a duplicate layer id must not be swallowed', () => {
    const map = fakeMap({ loaded: true });
    const apply = () => {
      throw new Error('There is already a source with ID "world-choropleth"');
    };
    expect(() => applyWhenStyleReady(asMap(map), apply)).toThrow(/already a source/);
  });
});
