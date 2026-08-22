import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scrollToIdSettled } from '../scrollSettle';

describe('scrollToIdSettled', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="target"></div>';
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('re-scrolls until the settle count is reached', () => {
    const el = document.getElementById('target')!;
    el.scrollIntoView = vi.fn();
    scrollToIdSettled('target', 4, 100);
    expect(el.scrollIntoView).toHaveBeenCalledTimes(1); // immediate jump
    vi.advanceTimersByTime(1000);
    expect(el.scrollIntoView).toHaveBeenCalledTimes(5); // + 4 settle passes
  });

  it('stops quietly when the element does not exist', () => {
    scrollToIdSettled('missing', 4, 100);
    vi.advanceTimersByTime(1000); // must not throw or loop forever
    expect(vi.getTimerCount()).toBe(0);
  });
});
