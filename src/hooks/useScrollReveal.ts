import { useEffect, useRef } from 'react';
import { useReducedMotion } from './useReducedMotion';

// Shared IntersectionObserver for all scroll-reveal elements
let observer: IntersectionObserver | null = null;
const callbacks = new Map<Element, () => void>();

function getObserver(): IntersectionObserver {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const cb = callbacks.get(entry.target);
            if (cb) {
              cb();
              callbacks.delete(entry.target);
              observer!.unobserve(entry.target);
            }
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
  }
  return observer;
}

/**
 * Attaches a scroll-reveal to a ref element.
 * When the element enters the viewport, the `.revealed` class is added.
 * CSS handles the actual animation (see index.css `.scroll-reveal`).
 */
export function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // If reduced motion, show immediately
    if (reducedMotion) {
      el.classList.add('revealed');
      return;
    }

    const obs = getObserver();
    callbacks.set(el, () => el.classList.add('revealed'));
    obs.observe(el);

    return () => {
      callbacks.delete(el);
      obs.unobserve(el);
    };
  }, [reducedMotion]);

  return ref;
}
