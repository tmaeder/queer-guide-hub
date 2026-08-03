/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { Image } from '../Image';

/**
 * jsdom never fetches images, so the element's load state is stubbed here.
 *
 * `src/test/setup.ts` patches `HTMLImageElement.prototype.src` to dispatch a
 * synthetic `load` on a 0ms timer (Radix Avatar needs it). That patch is
 * exactly the condition these tests must NOT have — the bug under test is what
 * happens when `onLoad` never fires — so `silenceSyntheticLoad` puts a plain
 * attribute-backed `src` accessor back for the duration of a test.
 */
const originalSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;

function silenceSyntheticLoad() {
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    set(value: string) {
      this.setAttribute('src', value);
    },
    get() {
      return this.getAttribute('src') ?? '';
    },
  });
}

/** Model the browser's view of the image: finished-and-decoded, or stalled. */
function stubLoadState({ complete, naturalWidth }: { complete: boolean; naturalWidth: number }) {
  Object.defineProperty(HTMLImageElement.prototype, 'complete', {
    configurable: true,
    get: () => complete,
  });
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
    configurable: true,
    get: () => naturalWidth,
  });
}

const REAL = 'https://img.example.com/venue.jpg';

describe('Image', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    silenceSyntheticLoad();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(HTMLImageElement.prototype, 'src', originalSrc);
    Reflect.deleteProperty(HTMLImageElement.prototype, 'complete');
    Reflect.deleteProperty(HTMLImageElement.prototype, 'naturalWidth');
  });

  it('shows a cached image whose onLoad never fires, instead of covering it with the fallback', () => {
    // A cached image finishes during the same commit React uses to attach
    // onLoad, so the event is missed. Before the DOM sync this left the photo
    // at opacity 0 and then let the stall guard swap the fallback in over it.
    stubLoadState({ complete: true, naturalWidth: 800 });
    const { container } = render(
      <Image src={REAL} alt="venue" priority fallbackEntityType="venue" fallbackKey="v1" />,
    );
    const img = container.querySelector('img')!;

    expect(img).toHaveClass('loaded');

    act(() => {
      vi.advanceTimersByTime(9000);
    });

    expect(container.querySelector('img')!.getAttribute('src')).toBe(REAL);
  });

  it('still swaps in the fallback for a priority image that genuinely stalls', () => {
    stubLoadState({ complete: false, naturalWidth: 0 });
    const { container } = render(
      <Image src={REAL} alt="venue" priority fallbackEntityType="venue" fallbackKey="v1" />,
    );
    expect(container.querySelector('img')!.getAttribute('src')).toBe(REAL);

    act(() => {
      vi.advanceTimersByTime(9000);
    });

    expect(container.querySelector('img')!.getAttribute('src')).toContain('/images/fallback/');
  });

  it('does not force-fail a lazy image that is simply still off-screen', () => {
    stubLoadState({ complete: false, naturalWidth: 0 });
    const { container } = render(<Image src={REAL} alt="venue" fallbackKey="v1" />);

    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(container.querySelector('img')!.getAttribute('src')).toBe(REAL);
  });

  it('marks loaded from the onLoad event when it does fire', () => {
    stubLoadState({ complete: false, naturalWidth: 0 });
    const { container } = render(<Image src={REAL} alt="venue" fallbackKey="v1" />);
    const img = container.querySelector('img')!;
    expect(img).not.toHaveClass('loaded');

    act(() => {
      img.dispatchEvent(new Event('load'));
    });

    expect(container.querySelector('img')!).toHaveClass('loaded');
  });

  it('falls back when the image reports an error', () => {
    stubLoadState({ complete: false, naturalWidth: 0 });
    const { container } = render(<Image src={REAL} alt="venue" fallbackKey="v1" />);

    act(() => {
      container.querySelector('img')!.dispatchEvent(new Event('error'));
    });

    expect(container.querySelector('img')!.getAttribute('src')).toContain('/images/fallback/');
  });

  describe('source ladder', () => {
    const MIRROR = 'https://img.example.com/mirror.webp';
    const THUMB = 'https://img.example.com/thumb/mirror.webp';
    const ORIGINAL = 'https://cdn.merchant.com/product.jpg';
    const fail = (c: HTMLElement) =>
      act(() => {
        c.querySelector('img')!.dispatchEvent(new Event('error'));
      });

    it('walks optimized → thumbnail → original before conceding to the texture', () => {
      stubLoadState({ complete: false, naturalWidth: 0 });
      const { container } = render(
        <Image
          optimizedUrl={MIRROR}
          thumbnailUrl={THUMB}
          imageUrl={ORIGINAL}
          alt="listing"
          fallbackKey="m1"
        />,
      );
      const src = () => container.querySelector('img')!.getAttribute('src');

      expect(src()).toBe(MIRROR);
      fail(container);
      expect(src()).toBe(THUMB);
      fail(container);
      // The whole point: a dead mirror host must not cost us the merchant's image.
      expect(src()).toBe(ORIGINAL);
      fail(container);
      expect(src()).toContain('/images/fallback/');
    });

    it('does not point the srcset at a source that already failed', () => {
      stubLoadState({ complete: false, naturalWidth: 0 });
      const { container } = render(
        <Image optimizedUrl={MIRROR} imageUrl={ORIGINAL} alt="listing" fallbackKey="m2" />,
      );

      fail(container);

      const img = container.querySelector('img')!;
      expect(img.getAttribute('src')).toBe(ORIGINAL);
      expect(img.getAttribute('srcset') ?? '').not.toContain(MIRROR);
    });

    it('does not burn a rung when two sources are the same URL', () => {
      stubLoadState({ complete: false, naturalWidth: 0 });
      const { container } = render(
        <Image
          optimizedUrl={MIRROR}
          thumbnailUrl={MIRROR}
          imageUrl={ORIGINAL}
          alt="l"
          fallbackKey="m3"
        />,
      );

      fail(container);

      expect(container.querySelector('img')!.getAttribute('src')).toBe(ORIGINAL);
    });
  });
});
