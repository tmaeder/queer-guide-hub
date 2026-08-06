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
    // External host → the first attempt goes through the CF resizer srcset.
    expect(container.querySelector('img')!.getAttribute('srcset')).toContain('/cdn-cgi/image/');

    // First stall window blames the CF wrap: same source, raw, new 8s window.
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(container.querySelector('img')!.getAttribute('src')).toBe(REAL);
    expect(container.querySelector('img')!.getAttribute('srcset')).toBeNull();

    // Second stall window concedes to the texture.
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

  it('retries an errored CF-wrapped source raw before conceding to the fallback', () => {
    stubLoadState({ complete: false, naturalWidth: 0 });
    const { container } = render(<Image src={REAL} alt="venue" fallbackKey="v1" />);

    // First error sheds the CF srcset — the raw URL gets its own attempt.
    act(() => {
      container.querySelector('img')!.dispatchEvent(new Event('error'));
    });
    expect(container.querySelector('img')!.getAttribute('src')).toBe(REAL);
    expect(container.querySelector('img')!.getAttribute('srcset')).toBeNull();

    // Second error (raw also dead) reaches the texture.
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
    // Every rung on a CF-resizable host takes two errors: the first sheds the
    // CF srcset (raw retry of the SAME source), the second moves the ladder.
    const failRung = (c: HTMLElement) => {
      fail(c);
      fail(c);
    };

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
      failRung(container);
      expect(src()).toBe(THUMB);
      failRung(container);
      // The whole point: a dead mirror host must not cost us the merchant's image.
      expect(src()).toBe(ORIGINAL);
      failRung(container);
      expect(src()).toContain('/images/fallback/');
    });

    it('does not point the srcset at a source that already failed', () => {
      stubLoadState({ complete: false, naturalWidth: 0 });
      const { container } = render(
        <Image optimizedUrl={MIRROR} imageUrl={ORIGINAL} alt="listing" fallbackKey="m2" />,
      );

      failRung(container);

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

      failRung(container);

      expect(container.querySelector('img')!.getAttribute('src')).toBe(ORIGINAL);
    });
  });

  describe('riso treatment', () => {
    const ORIGINAL = 'https://cdn.merchant.com/product.jpg';

    it('renders in full colour by default', () => {
      const { container } = render(<Image imageUrl={ORIGINAL} alt="d" fallbackKey="t1" />);
      expect(container.querySelector('.duotone-riso')).toBeNull();
    });

    it('wraps the photo when treatment="riso"', () => {
      const { container } = render(
        <Image imageUrl={ORIGINAL} alt="d" fallbackKey="t2" treatment="riso" />,
      );
      expect(container.querySelector('.duotone-riso')).not.toBeNull();
    });

    it('puts the duotone on the image OWN parent, not the outer container', () => {
      // `.duotone-riso` styles `> img`, so the class has to sit on the image's
      // direct parent or the separation silently does nothing. And it must NOT
      // sit on the outer container: its ::after is the last child there, so the
      // multiply layer would paint over the scrim and any overlay children —
      // tinting badges and favourite buttons along with the photograph.
      const { container } = render(
        <Image imageUrl={ORIGINAL} alt="d" fallbackKey="t3" treatment="riso" scrim="readable">
          <button type="button">save</button>
        </Image>,
      );
      const img = container.querySelector('img')!;
      const duo = container.querySelector('.duotone-riso')!;

      expect(img.parentElement).toBe(duo);
      expect(duo.contains(container.querySelector('button'))).toBe(false);
    });
  });
});
