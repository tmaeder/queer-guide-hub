import React, { useRef, useEffect, useState, useCallback } from 'react';
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

  const triggerAnimation = useCallback(() => {
    if (hasAnimated.current) return;
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
        onUpdate: () => setDisplay(Math.round(counterRef.current.val)),
      });
    });
  }, [value, dur, reducedMotion]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    // If already revealed (e.g. above fold), animate immediately
    if (el.classList.contains('revealed')) {
      triggerAnimation();
      return;
    }

    const obs = new MutationObserver(() => {
      if (el.classList.contains('revealed')) {
        triggerAnimation();
        obs.disconnect();
      }
    });

    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [triggerAnimation, wrapperRef]);

  return (
    <span ref={wrapperRef} className={`scroll-reveal scroll-reveal--fade ${className ?? ''}`}>
      {prefix}{display.toLocaleString(locale)}{suffix}
    </span>
  );
};
