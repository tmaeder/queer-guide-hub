import { useEffect, useRef, useState } from 'react';
import { animate } from 'motion/react';
import { useMotionTokens, easing } from '@/lib/motion';
import { duration, isLowEndDevice } from '@/lib/animation';

/**
 * Animated count-up for stat numerals. Animates from the previously shown
 * value whenever `target` changes (stats often load async), starting from 0 on
 * mount. Reduced motion / low-end devices render the final value instantly.
 */
export function useCountUp(target: number) {
  const { reduced } = useMotionTokens();
  const skip = reduced || isLowEndDevice();
  const [value, setValue] = useState(skip ? target : 0);
  const shownRef = useRef(skip ? target : 0);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    if (skip || target === shownRef.current) {
      shownRef.current = target;
      setValue(target);
      return;
    }
    const controls = animate(shownRef.current, target, {
      duration: duration.reveal,
      ease: easing.smooth,
      onUpdate: (v) => {
        shownRef.current = Math.round(v);
        setValue(shownRef.current);
      },
    });
    return () => controls.stop();
  }, [target, skip]);

  return value;
}
