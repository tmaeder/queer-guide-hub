import * as React from 'react';
import { duration as durationTokens, stagger as staggerTokens } from '@/lib/animation';
import type { RevealDirection } from '@/lib/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const ROOT_MARGIN = '0px 0px -40px 0px';
const MAX_STAGGER_MS = 320;

const startTransform: Record<RevealDirection, string> = {
  up: 'translate3d(0, 14px, 0)',
  down: 'translate3d(0, -14px, 0)',
  left: 'translate3d(-14px, 0, 0)',
  right: 'translate3d(14px, 0, 0)',
  fade: 'translate3d(0, 0, 0)',
};

interface EntranceAnimationOptions {
  direction?: RevealDirection;
  delay?: number;
  duration?: number;
  stagger?: number;
  children?: boolean;
}

/**
 * Runs a one-shot entrance only after the element becomes visible.
 *
 * The DOM is never hidden while waiting for IntersectionObserver. That keeps
 * server rendering, screenshots, no-JS and unsupported-browser paths fully
 * readable; the Web Animations effect is progressive enhancement applied at
 * the moment it can actually be seen.
 */
export function useEntranceAnimation<T extends HTMLElement>({
  direction = 'up',
  delay = 0,
  duration = durationTokens.reveal,
  stagger = staggerTokens.normal,
  children = false,
}: EntranceAnimationOptions = {}) {
  const ref = React.useRef<T>(null);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    const root = ref.current;
    if (!root || reduced || typeof IntersectionObserver === 'undefined') return;

    let animations: Animation[] = [];
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;

        const targets = children ? Array.from(root.children) : [root];
        animations = targets.flatMap((target, index) => {
          if (!(target instanceof HTMLElement) || typeof target.animate !== 'function') return [];

          const itemDelay = Math.min(index * stagger * 1000, MAX_STAGGER_MS);
          target.style.willChange = 'transform, opacity';
          const animation = target.animate(
            [
              {
                opacity: 0.12,
                transform: startTransform[direction],
              },
              {
                opacity: 1,
                transform: 'translate3d(0, 0, 0)',
              },
            ],
            {
              duration: duration * 1000,
              delay: delay * 1000 + itemDelay,
              easing: EASE_OUT,
              fill: 'both',
            },
          );
          animation.finished
            .catch(() => undefined)
            .finally(() => {
              target.style.willChange = '';
            });
          return [animation];
        });
        observer.disconnect();
      },
      { threshold: 0.12, rootMargin: ROOT_MARGIN },
    );

    observer.observe(root);
    return () => {
      observer.disconnect();
      animations.forEach((animation) => animation.cancel());
    };
  }, [children, delay, direction, duration, reduced, stagger]);

  return ref;
}
