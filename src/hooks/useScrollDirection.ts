import { useEffect, useRef, useState } from 'react';

export type ScrollDirection = 'up' | 'down';

interface Options {
  /** Minimum delta (px) between samples before flipping direction. */
  threshold?: number;
  /** Always report 'up' (visible) while within this many px of the top. */
  topOffset?: number;
}

/**
 * Reports the user's vertical scroll direction, rAF-throttled. Returns 'up'
 * near the top of the page so chrome anchored to a scroll-away behaviour stays
 * visible above the fold. Used by the mobile bottom nav to slide itself off
 * screen on scroll-down and back on scroll-up.
 */
export function useScrollDirection({
  threshold = 6,
  topOffset = 80,
}: Options = {}): ScrollDirection {
  const [direction, setDirection] = useState<ScrollDirection>('up');
  const lastY = useRef(typeof window === 'undefined' ? 0 : window.scrollY);
  const ticking = useRef(false);

  useEffect(() => {
    const update = () => {
      const y = window.scrollY;
      if (y <= topOffset) {
        setDirection('up');
        lastY.current = y;
        ticking.current = false;
        return;
      }
      if (Math.abs(y - lastY.current) >= threshold) {
        setDirection(y > lastY.current ? 'down' : 'up');
        lastY.current = y;
      }
      ticking.current = false;
    };

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold, topOffset]);

  return direction;
}
