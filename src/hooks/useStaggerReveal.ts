import { useEffect, useRef, useCallback } from 'react';
import { useReducedMotion } from './useReducedMotion';
import { gsapEase, stagger as staggerTokens, duration, isLowEndDevice } from '@/lib/animation';

/**
 * Staggered reveal for grid/list children using GSAP.
 * Triggers when the container enters the viewport.
 * Falls back to simple CSS fade on low-end devices.
 */
export function useStaggerReveal<T extends HTMLElement>(
  options: {
    stagger?: number;
    from?: number;
    childSelector?: string;
  } = {},
) {
  const {
    stagger: staggerVal = staggerTokens.normal,
    from = 0,
    childSelector = ':scope > *',
  } = options;

  const containerRef = useRef<T>(null);
  const reducedMotion = useReducedMotion();
  const hasAnimated = useRef(false);
  const lowEnd = isLowEndDevice();
  const skipAnimation = reducedMotion || lowEnd;

  const animate = useCallback(async () => {
    const el = containerRef.current;
    if (!el || hasAnimated.current) return;
    hasAnimated.current = true;

    const children = el.querySelectorAll(childSelector);
    if (children.length === 0) return;

    if (skipAnimation) {
      children.forEach((child) => {
        (child as HTMLElement).style.opacity = '1';
        (child as HTMLElement).style.transform = 'none';
      });
      return;
    }

    const { gsap } = await import('@/lib/gsap');

    gsap.fromTo(
      children,
      { opacity: 0, y: 12 },
      {
        opacity: 1,
        y: 0,
        duration: duration.normal,
        ease: gsapEase.decel,
        stagger: staggerVal,
        delay: from,
      },
    );
  }, [staggerVal, from, childSelector, skipAnimation]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Set initial hidden state via CSS
    const children = el.querySelectorAll(childSelector);
    if (!skipAnimation) {
      children.forEach((child) => {
        (child as HTMLElement).style.opacity = '0';
      });
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          animate();
          observer.disconnect();
        }
      },
      { threshold: 0.05, rootMargin: '0px 0px -20px 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [animate, childSelector, skipAnimation]);

  return containerRef;
}
