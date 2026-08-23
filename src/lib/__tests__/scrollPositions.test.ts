import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getScrollPosition, setScrollPosition, resetScrollPositions } from '../scrollPositions';

describe('scrollPositions', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetScrollPositions();
  });
  afterEach(() => vi.restoreAllMocks());

  it('remembers an offset per history entry', () => {
    setScrollPosition('a', 640);
    setScrollPosition('b', 2042);
    expect(getScrollPosition('a')).toBe(640);
    expect(getScrollPosition('b')).toBe(2042);
    expect(getScrollPosition('c')).toBeUndefined();
  });

  it('rounds and floors at zero', () => {
    setScrollPosition('a', 12.7);
    expect(getScrollPosition('a')).toBe(13);
    setScrollPosition('b', -5);
    expect(getScrollPosition('b')).toBe(0);
  });

  it('survives a reload — the browser keeps the history key, so we keep the offset', () => {
    setScrollPosition('entry-7', 900);
    dropInMemoryCache();
    expect(getScrollPosition('entry-7')).toBe(900);
  });

  it('bounds the store so a long session cannot grow it without limit', () => {
    for (let i = 0; i < 60; i += 1) setScrollPosition(`k${i}`, i);
    // The 10 oldest are evicted; the 50 newest survive.
    expect(getScrollPosition('k9')).toBeUndefined();
    expect(getScrollPosition('k10')).toBe(10);
    expect(getScrollPosition('k59')).toBe(59);
  });

  it('re-writing a key refreshes its recency, so eviction is least-recently-written', () => {
    setScrollPosition('revisited', 1);
    for (let i = 0; i < 40; i += 1) setScrollPosition(`k${i}`, i);
    // Touching it again moves it to the young end of the queue…
    setScrollPosition('revisited', 2);
    for (let i = 40; i < 89; i += 1) setScrollPosition(`k${i}`, i);
    // …so 49 later writes do not push it out, while its untouched
    // contemporaries are long gone.
    expect(getScrollPosition('revisited')).toBe(2);
    expect(getScrollPosition('k0')).toBeUndefined();

    // One more write puts it over the cap and it goes, like anything else.
    setScrollPosition('k89', 89);
    expect(getScrollPosition('revisited')).toBeUndefined();
  });

  it('does not throw when sessionStorage is unavailable', () => {
    // Safari private mode and some embedded webviews throw outright. Losing a
    // scroll offset must never take the app down with it.
    resetScrollPositions();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => setScrollPosition('a', 100)).not.toThrow();
    expect(getScrollPosition('a')).toBe(100); // the in-memory map still serves
  });

  it('ignores a corrupted store rather than throwing', () => {
    resetScrollPositions();
    sessionStorage.setItem('qg:scroll-positions', '{not json');
    expect(() => getScrollPosition('a')).not.toThrow();
    expect(getScrollPosition('a')).toBeUndefined();
  });
});

/** Drops the in-memory cache but leaves sessionStorage, as a reload does. */
function dropInMemoryCache() {
  const raw = sessionStorage.getItem('qg:scroll-positions');
  resetScrollPositions();
  if (raw) sessionStorage.setItem('qg:scroll-positions', raw);
}
