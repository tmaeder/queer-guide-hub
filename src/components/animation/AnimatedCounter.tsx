import React, { useRef, useEffect, useState } from 'react';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  locale?: string;
  className?: string;
  suffix?: string;
  prefix?: string;
}

/**
 * Animated number counter that counts up when scrolled into view.
 * Uses GSAP for smooth tweening.
 */
export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  duration: dur = 1.5,
  locale = 'en',
  className,
  suffix = '',
  prefix = '',
}) => {
  const wrapperRef = useScrollReveal<HTMLSpanElement>();
  const counterRef = useRef<{ val: number }>({ val: 0 });
  const [display, setDisplay] = useState(0);
  const reducedMotion = useReducedMotion();
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const obs = new MutationObserver(() => {
      if (el.classList.contains('revealed') && !hasAnimated.current) {
        hasAnimated.current = true;

        if (reducedMotion) {
          setDisplay(value);
          return;
        }

        import('@/lib/gsap').then(({ gsap }) => {
          counterRef.current.val = 0;
          gsap.to(counterRef.current, {
            val: value,
            duration: dur,
            ease: 'power2.out',
            onUpdate: () => {
              setDisplay(Math.round(counterRef.current.val));
            },
          });
        });
      }
    });

    obs.observe(el, { attributes: true, attributeFilter: ['class'] });

    // Check if already revealed
    if (el.classList.contains('revealed') && !hasAnimated.current) {
      hasAnimated.current = true;
      if (reducedMotion) {
        setDisplay(value);
      } else {
        import('@/lib/gsap').then(({ gsap }) => {
          counterRef.current.val = 0;
          gsap.to(counterRef.current, {
            val: value,
            duration: dur,
            ease: 'power2.out',
            onUpdate: () => setDisplay(Math.round(counterRef.current.val)),
          });
        });
      }
    }

    return () => obs.disconnect();
  }, [value, dur, reducedMotion, wrapperRef]);

  return (
    <span ref={wrapperRef} className={`scroll-reveal scroll-reveal--fade ${className ?? ''}`}>
      {prefix}{display.toLocaleString(locale)}{suffix}
    </span>
  );
};
