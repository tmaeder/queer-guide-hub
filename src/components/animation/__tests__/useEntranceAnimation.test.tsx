/**
 * @vitest-environment jsdom
 */
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollReveal } from '../ScrollReveal';

let observerCallback: IntersectionObserverCallback;
const observe = vi.fn();
const disconnect = vi.fn();
const animate = vi.fn(() => ({
  finished: Promise.resolve(),
  cancel: vi.fn(),
})) as unknown as typeof HTMLElement.prototype.animate;

class TestIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback;
  }
  observe = observe;
  unobserve = vi.fn();
  disconnect = disconnect;
  takeRecords = () => [];
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: ReadonlyArray<number> = [];
}

const realObserver = window.IntersectionObserver;
const realAnimate = HTMLElement.prototype.animate;

describe('useEntranceAnimation', () => {
  beforeEach(() => {
    observe.mockClear();
    disconnect.mockClear();
    vi.mocked(animate).mockClear();
    window.IntersectionObserver =
      TestIntersectionObserver as unknown as typeof IntersectionObserver;
    HTMLElement.prototype.animate = animate;
  });

  afterEach(() => {
    window.IntersectionObserver = realObserver;
    HTMLElement.prototype.animate = realAnimate;
  });

  it('keeps content visible until intersection and then runs the authored entrance', () => {
    const { container } = render(
      <ScrollReveal direction="left" delay={0.1} duration={0.5}>
        Visible first
      </ScrollReveal>,
    );
    const target = container.firstElementChild as HTMLElement;

    expect(target).not.toHaveStyle({ opacity: 0 });
    expect(observe).toHaveBeenCalledWith(target);

    act(() => {
      observerCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(animate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ transform: 'translate3d(-14px, 0, 0)' }),
        expect.objectContaining({ opacity: 1 }),
      ]),
      expect.objectContaining({ duration: 500, delay: 100, fill: 'both' }),
    );
    expect(disconnect).toHaveBeenCalled();
  });
});
